#!/usr/bin/env python3
"""Week 3 · Task 1 — Build your own iterative resolver.

Textbook §2.4.2 - §2.4.3.

`dig +trace` walks root -> TLD -> authoritative for you. In this task you do
that walk yourself: start at a root server, read the delegation it returns,
ask the next server, and keep going until somebody answers authoritatively.

You may shell out to `dig` for the transport, or use a DNS library
(`dnspython` is in the container). Either is fine - what matters is that
*you* follow the delegations rather than letting a tool do it.

    python3 task1_resolve.py www.korea.ac.kr
    python3 task1_resolve.py --verify        # check yourself against dig

Pass condition
--------------
`--verify` resolves five names with your resolver and with `dig`, and the
addresses must agree. A name behind a CDN may legitimately return a different
address each time; the harness compares the *set of authoritative nameservers*
you ended at for those, not the address.
"""
import argparse, re, subprocess, sys

# Root servers. Everything starts here; there is no earlier step.
ROOT_SERVERS = [
    "198.41.0.4",       # a.root-servers.net
    "199.9.14.201",     # b.root-servers.net
    "192.33.4.12",      # c.root-servers.net
]

# (name, kind).  "stable" names must match dig exactly.  "cdn" names are served
# from many replicas and may legitimately give you a different address than dig
# got a second earlier - for those we only require that you reached an answer.
VERIFY_NAMES = [
    ("www.korea.ac.kr", "stable"),
    ("dns.google", "stable"),
    ("en.wikipedia.org", "stable"),
    ("www.stanford.edu", "stable"),
    ("www.microsoft.com", "cdn"),
]


class Resolver:
    """Your iterative resolver.

    The whole point is that you never ask a server to recurse for you.
    You ask one server, it says "not mine, ask over there", and you go there.

    Suggested shape - but it is yours to design:

        resolve(name) -> (address, path)
            address : the A record you ended up with, as a string
            path    : the servers you asked, in order, so you can show your work

    Things you will hit, in roughly this order:

    1.  A delegation gives you NS *names*, sometimes with glue A records and
        sometimes without. No glue means you have to resolve that nameserver's
        name first - which is another walk. Decide what you do there.
    2.  A server may not answer. Try the next one rather than giving up.
    3.  CNAMEs. The answer you get back may be a different name than the one
        you asked for, and you have to start again with that name.
    4.  Loops. Cap your depth.

    If you shell out to dig, the flag you want is `+norecurse`, so that the
    server you ask replies with a delegation instead of doing the work:

        dig @198.41.0.4 www.korea.ac.kr +norecurse
    """

    MAX_DEPTH = 30          # R6: total queries per resolve() call, all walks included
    MAX_CNAME = 10          # R5: CNAME restarts before we call it a loop

    def __init__(self):
        self.asked = []      # every server we sent a query to, in order
        self.no_glue = 0     # how many delegations arrived without glue (R3)

    # -- transport: one non-recursive question to one server. Nothing else. --
    def _query(self, server, name):
        """Ask `server` about `name` with RD off. Returns parsed sections or None."""
        self.asked.append(server)
        if len(self.asked) > self.MAX_DEPTH * 4:
            raise RuntimeError("too many queries - loop?")
        r = subprocess.run(
            ["dig", f"@{server}", name, "A", "+norecurse", "+time=3", "+tries=1",
             "+noall", "+answer", "+authority", "+additional", "+comments"],
            capture_output=True, text=True)
        if r.returncode != 0 or "status:" not in r.stdout:
            return None                              # timeout / refused: next server
        status = re.search(r"status: (\w+)", r.stdout).group(1)
        sec = {"answer": [], "authority": [], "additional": []}
        cur = None
        for line in r.stdout.splitlines():
            m = re.match(r";; (ANSWER|AUTHORITY|ADDITIONAL) SECTION", line)
            if m:
                cur = m.group(1).lower()
                continue
            if not line.strip() or line.startswith(";") or cur is None:
                continue
            f = line.split()
            if len(f) >= 5:                          # name ttl IN type rdata
                sec[cur].append((f[0].rstrip(".").lower(), f[3], f[4].rstrip(".").lower()))
        return status, sec

    def _walk(self, name, depth):
        """One walk from the roots for `name`. Returns ('A', ip) or ('CNAME', target)."""
        servers = list(ROOT_SERVERS)
        for _ in range(self.MAX_DEPTH):
            reply = None
            for server in servers:                   # R4: dead server -> next one
                reply = self._query(server, name)
                if reply is not None and reply[0] in ("NOERROR", "NXDOMAIN"):
                    break
                reply = None
            if reply is None:
                raise RuntimeError(f"no server answered for {name}")
            status, sec = reply
            if status == "NXDOMAIN":
                raise RuntimeError(f"{name}: NXDOMAIN")

            # Answer section: A record for the name we asked, or a CNAME to chase.
            cnames = {n: v for n, t, v in sec["answer"] if t == "CNAME"}
            cur = name
            for _ in range(self.MAX_CNAME):
                if cur in cnames:
                    cur = cnames[cur]
                else:
                    break
            ips = [v for n, t, v in sec["answer"] if t == "A" and n == cur]
            if ips:
                return "A", ips[0]
            if cur != name:                          # R5: chain ended without an A
                return "CNAME", cur

            # Delegation: authority NS + (maybe) glue in additional.
            ns = [v for n, t, v in sec["authority"] if t == "NS"]
            if not ns:
                raise RuntimeError(f"{name}: empty answer (NODATA)")
            glue = [v for n, t, v in sec["additional"] if t == "A" and n in ns]
            if glue:
                servers = glue
                continue
            # R3: no glue. Resolve the nameserver's own name - a whole extra walk.
            self.no_glue += 1
            servers = []
            for n in ns:
                try:
                    servers.append(self.resolve_inner(n, depth + 1))
                    break
                except RuntimeError:
                    continue
            if not servers:
                raise RuntimeError(f"could not resolve any NS for {name}")
        raise RuntimeError(f"{name}: delegation depth exceeded")

    def resolve_inner(self, name, depth=0):
        if depth > 5:
            raise RuntimeError("nameserver resolution too deep")
        for _ in range(self.MAX_CNAME):
            kind, val = self._walk(name, depth)
            if kind == "A":
                return val
            name = val                               # restart from the roots
        raise RuntimeError("CNAME loop")

    def resolve(self, name):
        self.asked, self.no_glue = [], 0
        addr = self.resolve_inner(name.rstrip(".").lower())
        return addr, list(self.asked)


# ------------------------------------------------------------------- harness
def dig_answer(name):
    """What the system resolver says, for comparison."""
    out = subprocess.run(["dig", "+short", name, "A"],
                         capture_output=True, text=True).stdout
    return [l for l in out.split() if l and l[0].isdigit()]


def verify():
    r, failures = Resolver(), 0
    for name, kind in VERIFY_NAMES:
        try:
            addr, path = r.resolve(name)
        except NotImplementedError:
            print("Nothing implemented yet - write Resolver.resolve first.")
            return 1
        except Exception as e:
            print(f"  FAIL  {name:<22} your resolver raised {e!r}")
            failures += 1
            continue
        expected = dig_answer(name)
        if addr in expected:
            note = ""
        elif kind == "cdn":
            note = "  <- differs, but this name is CDN-hosted. Explain it."
        else:
            note = "  <- should have matched"
            failures += 1
        print(f"  {'FAIL' if note.endswith('matched') else 'ok  '}  {name:<22} "
              f"you={addr:<16} dig={','.join(expected) or '-'}   "
              f"hops={len(path)}{note}")
    print(f"\n  {len(VERIFY_NAMES) - failures}/{len(VERIFY_NAMES)} ok")
    return 1 if failures else 0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("name", nargs="?", default="www.korea.ac.kr")
    p.add_argument("--verify", action="store_true")
    a = p.parse_args()

    if a.verify:
        sys.exit(verify())

    addr, path = Resolver().resolve(a.name)
    for i, server in enumerate(path, 1):
        print(f"  {i}. asked {server}")
    print(f"\n  {a.name} -> {addr}")


if __name__ == "__main__":
    main()
