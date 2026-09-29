#!/usr/bin/env python3
"""Week 5 · Task 1 — Subnets and longest-prefix match.

Textbook §4.3.2 (IPv4 addressing, CIDR) and §4.3.3 (forwarding).

Two things a router does with every packet: work out which prefixes the
destination falls inside, and pick the longest one. The second is the whole
of "longest prefix match", and it is the reason the internet's routing table
can hold a million entries and still be answerable.

You build both, from integers up. No `ipaddress` module - that library is
exactly the thing you are supposed to understand this week.

    python3 task1_forward.py --verify
"""
import argparse


def _to_int(addr):
    """'163.152.6.10' -> 32-bit int. Four decimal octets, nothing else accepted."""
    parts = addr.split(".")
    if len(parts) != 4:
        raise ValueError(f"not a dotted quad: {addr!r}")
    value = 0
    for part in parts:
        if not part.isascii() or not part.isdigit() or int(part) > 255:
            raise ValueError(f"bad octet {part!r} in {addr!r}")
        value = (value << 8) | int(part)
    return value


def _to_str(value):
    return ".".join(str((value >> shift) & 0xFF) for shift in (24, 16, 8, 0))


def _mask(plen):
    """plen ones followed by (32 - plen) zeros. plen == 0 must give 0, not 2**32-1."""
    return (0xFFFFFFFF << (32 - plen)) & 0xFFFFFFFF


def parse_cidr(cidr):
    """'163.152.6.0/24' -> (network as int, prefix length).

    Requirements: reject a prefix length outside 0-32, and reject an address
    whose host bits are set when they should not be (163.152.6.5/24 is a
    common way to write a host, but it is not a network).
    """
    if cidr.count("/") != 1:
        raise ValueError(f"expected address/prefix: {cidr!r}")
    addr, plen_text = cidr.split("/")
    if not plen_text.isascii() or not plen_text.isdigit():
        raise ValueError(f"bad prefix length {plen_text!r}")
    plen = int(plen_text)
    if not 0 <= plen <= 32:                                   # R1
        raise ValueError(f"prefix length {plen} outside 0-32")
    net = _to_int(addr)
    if net & ~_mask(plen) & 0xFFFFFFFF:                       # R2: host bits set
        raise ValueError(f"{cidr} has host bits set; network would be "
                         f"{_to_str(net & _mask(plen))}/{plen}")
    return net, plen


def network_range(cidr):
    """'163.152.6.0/24' -> (first usable, last usable, broadcast) as strings.

    Careful at the edges. /31 and /32 do not have a usable host range in the
    ordinary sense - decide what you return and say so in observation.md.

    My choice (RFC 3021):
      /31  both addresses are hosts on a point-to-point link: (net, net+1, None)
      /32  a single host, no range: (addr, addr, None)
    "None" for broadcast: there is no broadcast address to give in either case.
    """
    net, plen = parse_cidr(cidr)
    last = net | (~_mask(plen) & 0xFFFFFFFF)                  # all host bits set
    if plen == 32:
        return _to_str(net), _to_str(net), None
    if plen == 31:
        return _to_str(net), _to_str(last), None
    return _to_str(net + 1), _to_str(last - 1), _to_str(last)


class ForwardingTable:
    """Longest-prefix-match forwarding.

    add(cidr, next_hop)  ·  lookup(address) -> next_hop or None

    The default route 0.0.0.0/0 matches everything and is the shortest prefix,
    so it must lose to any other match. If two entries have the same prefix
    length, the table is malformed - say what you do.

    What I do: two entries with the same network *and* prefix length but different
    next hops are ambiguous, so add() raises ValueError. The same entry added twice
    with the same next hop is harmless. (Different networks of equal length can
    never both match one address, so they are fine.)
    """

    def __init__(self):
        self.by_len = {}          # prefix length -> {network int: next hop}

    def add(self, cidr, next_hop):
        net, plen = parse_cidr(cidr)
        bucket = self.by_len.setdefault(plen, {})
        if net in bucket and bucket[net] != next_hop:
            raise ValueError(f"{cidr} already routes to {bucket[net]!r}, not {next_hop!r}")
        bucket[net] = next_hop

    def lookup(self, address):
        addr = _to_int(address)
        for plen in sorted(self.by_len, reverse=True):        # longest first, stop at a hit
            hop = self.by_len[plen].get(addr & _mask(plen))
            if hop is not None:
                return hop
        return None


# ------------------------------------------------------------------- harness
RANGE_CASES = [
    ("192.168.0.0/24",  "192.168.0.1",   "192.168.0.254",  "192.168.0.255"),
    ("10.0.0.0/8",      "10.0.0.1",      "10.255.255.254", "10.255.255.255"),
    ("172.16.32.0/20",  "172.16.32.1",   "172.16.47.254",  "172.16.47.255"),
    ("203.0.113.64/26", "203.0.113.65",  "203.0.113.126",  "203.0.113.127"),
]

TABLE = [
    ("0.0.0.0/0",       "default-gw"),
    ("10.0.0.0/8",      "campus"),
    ("10.20.0.0/16",    "eng-building"),
    ("10.20.30.0/24",   "lab-floor"),
    ("10.20.30.64/26",  "lab-rack-2"),
    ("192.168.1.0/24",  "home"),
]

LOOKUP_CASES = [
    ("10.20.30.70",   "lab-rack-2"),     # inside all four 10.x entries
    ("10.20.30.10",   "lab-floor"),
    ("10.20.99.1",    "eng-building"),
    ("10.99.0.1",     "campus"),
    ("8.8.8.8",       "default-gw"),
    ("192.168.1.77",  "home"),
]


def verify():
    fails = 0
    for cidr, first, last, bcast in RANGE_CASES:
        try:
            got = network_range(cidr)
        except NotImplementedError:
            print("  network_range is still a stub"); return 1
        except Exception as e:
            print(f"  FAIL  {cidr:<18} raised {e!r}"); fails += 1; continue
        ok = tuple(got) == (first, last, bcast)
        print(f"  {'ok  ' if ok else 'FAIL'}  {cidr:<18} {got}")
        fails += not ok

    t = ForwardingTable()
    try:
        for cidr, hop in TABLE:
            t.add(cidr, hop)
    except NotImplementedError:
        print("  ForwardingTable is still a stub"); return 1

    for addr, expect in LOOKUP_CASES:
        got = t.lookup(addr)
        ok = got == expect
        print(f"  {'ok  ' if ok else 'FAIL'}  {addr:<16} -> {got}  (want {expect})")
        fails += not ok

    print(f"\n  {len(RANGE_CASES) + len(LOOKUP_CASES) - fails}"
          f"/{len(RANGE_CASES) + len(LOOKUP_CASES)} ok")
    return 1 if fails else 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--verify", action="store_true")
    a = p.parse_args()
    raise SystemExit(verify() if a.verify else p.print_help())
