#!/usr/bin/env python3
"""Week 5 · Task 3 — Make longest-prefix match fast.

Textbook §4.3.3.

`LinearTable` is correct and it is what you probably wrote in Task 1: keep the
prefixes in a list, check every one, remember the longest that matched. On six
entries that is fine. A real router holds close to a million, and it has to
answer while the packet is still in the buffer.

Beat it:

    python3 bench.py
    python3 bench.py --yours

Correctness first: `bench.py` checks every one of your answers against the
linear table. A fast router that forwards to the wrong next hop is not a
router, it is an outage.
"""
from array import array
from bisect import bisect_left, insort


class LinearTable:
    """Correct, and slow in the obvious way."""

    def __init__(self):
        self.entries = []                     # (prefix_len, network, next_hop)

    def add(self, network, prefix_len, next_hop):
        self.entries.append((prefix_len, network, next_hop))

    def lookup(self, address):
        best = None
        for plen, net, hop in self.entries:
            mask = (0xFFFFFFFF << (32 - plen)) & 0xFFFFFFFF
            if address & mask == net and (best is None or plen > best[0]):
                best = (plen, hop)
        return best[1] if best else None


class YourTable:
    """Your table. Same three methods, same answers, fewer comparisons.

    Addresses and networks are plain 32-bit ints here - no strings, no parsing,
    so that the benchmark measures your lookup and nothing else.

    Two directions worth knowing about before you pick one:

      * group by prefix length. There are only 33 possible lengths, and you can
        ask them in an order that lets you stop early.
      * walk the address one bit at a time. Each bit takes you to at most one
        child, so the work is bounded by the address width, not by the table size.

    The second is what hardware does. The first is easier and often enough.
    Say which you chose and what it cost you in memory.
    """

    def __init__(self):
        # DIR-24-8 style. `first` has one slot per /24 (2**24 of them) holding the
        # index of the best next hop for that whole /24, so a lookup is one array read.
        self.first = array("I", [0]) * (1 << 24)      # 0 = no route; 64 MB
        self.hops = [None]                            # index -> next hop
        self.index = {}                               # next hop -> index
        self.seen = {}                                # plen -> {network: index}   (plen <= 24)
        self.sorted_nets = {}                         # plen -> sorted list of /24 numbers
        self.long = {}                                # plen -> {network: hop}     (plen 25..32)
        self.long_lens = []                           # 25..32 lengths in use, longest first

    def _fill(self, net, plen, idx):
        lo = net >> 8
        n = 1 << (24 - plen)
        self.first[lo:lo + n] = array("I", [idx]) * n

    def add(self, network, prefix_len, next_hop):
        if prefix_len > 24:                           # rare: too long for the first level
            bucket = self.long.setdefault(prefix_len, {})
            bucket.setdefault(network, next_hop)      # first add wins, like LinearTable
            self.long_lens = sorted(self.long, reverse=True)
            return
        if network in self.seen.get(prefix_len, {}):
            return
        idx = self.index.get(next_hop)
        if idx is None:
            idx = self.index[next_hop] = len(self.hops)
            self.hops.append(next_hop)
        self.seen.setdefault(prefix_len, {})[network] = idx
        insort(self.sorted_nets.setdefault(prefix_len, []), network >> 8)

        # Write this prefix over its whole range - then put back every longer prefix
        # that lives inside that range, shortest first, so the longest always wins.
        self._fill(network, prefix_len, idx)
        lo, hi = network >> 8, (network >> 8) + (1 << (24 - prefix_len))
        for plen in sorted(p for p in self.seen if p > prefix_len):
            nets = self.sorted_nets[plen]
            for slot in nets[bisect_left(nets, lo):bisect_left(nets, hi)]:
                self._fill(slot << 8, plen, self.seen[plen][slot << 8])

    def lookup(self, address):
        for plen in self.long_lens:                   # empty here: nothing is longer than /24
            hop = self.long[plen].get(address & ((0xFFFFFFFF << (32 - plen)) & 0xFFFFFFFF))
            if hop is not None:
                return hop
        return self.hops[self.first[address >> 8]]
