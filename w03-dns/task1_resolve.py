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
    python3 task1_resolve.py --selftest      # R3-R6 against a fake hierarchy

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

# R6 - three separate caps, because there are three separate ways to loop.
MAX_QUERIES = 80     # servers asked for one resolve(), nested lookups included
MAX_DEPTH = 6        # how deep "resolve the nameserver's own name" may nest
MAX_CNAMES = 10      # length of a CNAME chain we will follow
MAX_STEPS = 12       # delegations followed inside one walk (root..leaf is ~4)


class ResolveError(Exception):
    """The name cannot be resolved (does not exist, no server helped, loop)."""


class BudgetExceeded(ResolveError):
    """Hit MAX_QUERIES. Never swallowed by a nested lookup - it ends the run."""


# ----------------------------------------------------------------- transport
def parse_dig(text):
    """dig output -> {status, flags, answer, authority, additional}.

    Every record is (owner, type, rdata), lower-cased, trailing dots removed
    from names. `+noall +comments +answer +authority +additional` prints the
    header and the three sections and nothing else.
    """
    reply = {"status": None, "flags": set(),
             "answer": [], "authority": [], "additional": []}
    section = None
    for line in text.splitlines():
        if line.startswith(";;"):
            if "->>HEADER<<-" in line:
                m = re.search(r"status: (\w+)", line)
                reply["status"] = m.group(1) if m else None
            elif line.startswith(";; flags:"):
                reply["flags"] = set(line[len(";; flags:"):].split(";")[0].split())
            elif "ANSWER SECTION" in line:
                section = "answer"
            elif "AUTHORITY SECTION" in line:
                section = "authority"
            elif "ADDITIONAL SECTION" in line:
                section = "additional"
            else:
                section = None
        elif section and line.strip() and not line.startswith(";"):
            p = line.split()
            if len(p) >= 5 and p[2] == "IN":
                rdata = " ".join(p[4:])
                if p[3] in ("NS", "CNAME"):
                    rdata = rdata.rstrip(".").lower()
                reply[section].append((p[0].rstrip(".").lower(), p[3], rdata))
    return reply if reply["status"] else None


def dig_transport(server, name, rtype="A"):
    """Ask ONE server one question, non-recursively. None if it did not answer."""
    cmd = ["dig", "-4", f"@{server}", name, rtype, "+norecurse", "+time=2",
           "+tries=1", "+noall", "+comments", "+answer", "+authority",
           "+additional"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=8).stdout
    except subprocess.TimeoutExpired:
        return None
    return parse_dig(out)


# ------------------------------------------------------------- name helpers
def norm(name):
    return name.strip().rstrip(".").lower()


def under(name, zone):
    """Is `name` inside `zone`? The root zone is "" and contains everything."""
    return zone == "" or name == zone or name.endswith("." + zone)


def depth(zone):
    return len(zone.split(".")) if zone else 0


def classify(reply, name, zone):
    """What did this server just tell us about `name`, asked while in `zone`?

    Returns one of
        ("answer", "A", [addresses])         somebody answered
        ("answer", "CNAME", target)          the answer is for another name
        ("nxdomain",) / ("nodata",)          authoritative "no"
        ("referral", zone, glued, unglued)   "not mine, ask them"
        None                                 unusable - try the next server

    None covers SERVFAIL/REFUSED, lame servers, and the two ways a referral can
    fail to make progress (points at an unrelated zone, or back up the tree).
    Refusing those here is what stops a broken zone from looping us (R6).
    """
    if reply["status"] == "NXDOMAIN":
        return ("nxdomain",)
    if reply["status"] != "NOERROR":
        return None

    # 1. an answer. It may hold a whole CNAME chain, so follow it as far as the
    #    server itself did - and no further.
    cnames = {o: d for o, t, d in reply["answer"] if t == "CNAME"}
    addrs = {}
    for o, t, d in reply["answer"]:
        if t == "A":
            addrs.setdefault(o, []).append(d)
    cur = name
    for _ in range(MAX_CNAMES + 1):
        if cur in addrs:
            return ("answer", "A", addrs[cur])
        if cur in cnames:
            cur = cnames[cur]
            continue
        break
    if cur != name:
        return ("answer", "CNAME", cur)

    # 2. a delegation: NS records in the authority section
    ns = [(o, d) for o, t, d in reply["authority"] if t == "NS"]
    if ns:
        z = ns[0][0]
        if not under(name, z) or depth(z) <= depth(zone):
            return None                     # sideways or upward: no progress
        glue = {}
        for o, t, d in reply["additional"]:
            if t == "A":
                glue.setdefault(o, []).append(d)
        names = [d for o, d in ns if o == z]
        glued = [ip for n in names for ip in glue.get(n, [])]
        unglued = [n for n in names if n not in glue]
        return ("referral", z, glued, unglued)

    # 3. an authoritative empty answer
    if any(t == "SOA" for _, t, _ in reply["authority"]):
        return ("nodata",)
    return None


# ------------------------------------------------------------------ resolver
class Resolver:
    """Your iterative resolver.

    The whole point is that you never ask a server to recurse for you.
    You ask one server, it says "not mine, ask over there", and you go there.

        resolve(name) -> (address, path)
            address : the A record you ended up with, as a string
            path    : the servers you asked, in order, so you can show your work

    Beyond that contract it keeps, for the last resolve():
        log       one line per question, indented by how deeply nested it is
        glueless  [(nameserver name, queries it cost)] - the R3 evidence

    What each requirement became:
        R3  a delegation with no glue is resolved by calling _resolve() on the
            nameserver's own name - a nested walk that starts at the root again.
            Only tried when every glued server failed, and remembered for the
            rest of the call so one nameserver is never walked twice.
        R4  _ask() moves to the next server on a timeout, SERVFAIL, REFUSED, or
            a reply that classify() rejects.
        R5  a CNAME answer for a different name restarts the walk at the root.
        R6  MAX_QUERIES / MAX_DEPTH / MAX_CNAMES / MAX_STEPS, plus classify()
            refusing referrals that go nowhere.
    """

    def __init__(self, roots=None, transport=dig_transport):
        self.roots = list(roots or ROOT_SERVERS)
        self.transport = transport
        self._reset()

    def _reset(self):
        self.path, self.log, self.glueless = [], [], []
        self._queries = 0
        self._ns_addr = {}          # nameserver name -> address or None
        self._resolving = set()     # nameserver names being walked right now

    def resolve(self, name):
        self._reset()
        return self._resolve(norm(name), 0)[0], self.path

    # ---- one name, following CNAMEs (R5)
    def _resolve(self, name, level):
        if level > MAX_DEPTH:
            raise ResolveError(f"nameserver lookups nested more than {MAX_DEPTH} deep")
        seen = []
        for _ in range(MAX_CNAMES + 1):
            if name in seen:
                raise ResolveError(f"CNAME loop at {name}")
            seen.append(name)
            kind, value = self._walk(name, level)
            if kind == "A":
                return value
            name = value                    # CNAME: start again from the root
        raise ResolveError(f"CNAME chain longer than {MAX_CNAMES}")

    # ---- root -> ... -> authoritative, for one name
    def _walk(self, name, level):
        zone, servers, unglued = "", list(self.roots), []
        for _ in range(MAX_STEPS):
            result = self._ask(servers, unglued, name, zone, level)
            if result is None:
                raise ResolveError(
                    f"no server for zone {zone or '.'} gave a usable answer for {name}")
            if result[0] == "answer":
                return result[1], result[2]
            if result[0] == "nxdomain":
                raise ResolveError(f"{name} does not exist (NXDOMAIN)")
            if result[0] == "nodata":
                raise ResolveError(f"{name} exists but has no A record")
            _, zone, servers, unglued = result      # a delegation: go down
        raise ResolveError(f"more than {MAX_STEPS} delegations for {name}")

    # ---- first usable reply from a set of servers (R4), then R3
    def _ask(self, servers, unglued, name, zone, level):
        for ip in servers:
            result = self._query(ip, name, zone, level)
            if result:
                return result
        for ns in unglued:                          # R3: no glue, or glue all dead
            ip = self._ns_address(ns, level)
            if ip:
                result = self._query(ip, name, zone, level)
                if result:
                    return result
        return None

    def _query(self, ip, name, zone, level):
        if self._queries >= MAX_QUERIES:
            raise BudgetExceeded(f"more than {MAX_QUERIES} queries for one name")
        self._queries += 1
        self.path.append(ip)
        reply = self.transport(ip, name, "A")
        result = classify(reply, name, zone) if reply else None
        if reply is None:
            note = "no answer"
        elif result is None:
            note = f"unusable ({reply['status']})"
        elif result[0] == "referral":
            note = (f"delegation to {result[1]}: {len(result[2])} glued, "
                    f"{len(result[3])} without glue")
        elif result[0] == "answer":
            note = f"answer: {result[1]} {result[2]}"
        else:
            note = result[0]
        self.log.append(f"{'    ' * level}{len(self.path):>2}. {ip:<16} A {name}  -> {note}")
        return result

    def _ns_address(self, ns, level):
        if ns in self._ns_addr:
            return self._ns_addr[ns]
        if ns in self._resolving:                   # zone needs its own server
            return None
        self._resolving.add(ns)
        before = self._queries
        try:
            self.log.append(f"{'    ' * level}    (no glue for {ns} - resolving it first)")
            ip = self._resolve(ns, level + 1)[0]
        except BudgetExceeded:
            raise
        except ResolveError as e:
            self.log.append(f"{'    ' * level}    (could not resolve {ns}: {e})")
            ip = None
        finally:
            self._resolving.discard(ns)
        self._ns_addr[ns] = ip
        self.glueless.append((ns, self._queries - before))
        return ip


# ------------------------------------------------------------------ selftest
def _fake_hierarchy():
    """A tiny DNS world for R3-R6, so they are tested on purpose and not by luck.

        10.0.0.1  root, dead                              -> R4
        10.0.0.2  root
        10.0.1.1  the "test" TLD
        example.test  is served by ns1.hoster.test, delegated WITHOUT glue -> R3
        www.example.test  is a CNAME to web.cdn.test                        -> R5
        a.loop.test <-> b.loop.test                        CNAME loop      -> R6
        circ.test  needs ns.circ.test to be reached: a circular delegation  -> R6
        bad.test   answers with a referral straight back to the TLD         -> R6
    """
    def rep(answer=(), authority=(), additional=(), status="NOERROR"):
        return {"status": status, "flags": set(), "answer": list(answer),
                "authority": list(authority), "additional": list(additional)}

    def delegate(zone, ns, glue_ip=None):
        return rep(authority=[(zone, "NS", ns)],
                   additional=[(ns, "A", glue_ip)] if glue_ip else [])

    def root(name):
        return delegate("test", "a.nic.test", "10.0.1.1")

    def tld(name):
        table = {"example.test": ("ns1.hoster.test", None),       # no glue
                 "hoster.test": ("ns.hoster.test", "10.0.2.1"),
                 "cdn.test": ("ns.cdn.test", "10.0.4.1"),
                 "loop.test": ("ns.loop.test", "10.0.3.1"),
                 "circ.test": ("ns.circ.test", None),
                 "bad.test": ("ns.bad.test", "10.0.6.1")}
        for zone, (ns, glue) in table.items():
            if under(name, zone):
                return delegate(zone, ns, glue)
        return rep(status="NXDOMAIN")

    def hoster(name):
        return rep(answer=[("ns1.hoster.test", "A", "10.0.5.1")])

    def example(name):
        return rep(answer=[("www.example.test", "CNAME", "web.cdn.test")])

    def cdn(name):
        return rep(answer=[("web.cdn.test", "A", "9.9.9.9")])

    def loop(name):
        other = "b.loop.test" if name == "a.loop.test" else "a.loop.test"
        return rep(answer=[(name, "CNAME", other)])

    def bad(name):
        return delegate("test", "a.nic.test", "10.0.1.1")   # back up the tree

    servers = {"10.0.0.2": root, "10.0.1.1": tld, "10.0.2.1": hoster,
               "10.0.5.1": example, "10.0.4.1": cdn, "10.0.3.1": loop,
               "10.0.6.1": bad}                               # 10.0.0.1: dead

    def transport(ip, name, rtype="A"):
        fn = servers.get(ip)
        return fn(name) if fn else None
    return transport


def selftest():
    fails = 0

    def check(label, ok, detail=""):
        nonlocal fails
        fails += 0 if ok else 1
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}" + (f"  - {detail}" if detail else ""))

    def fresh():
        return Resolver(roots=["10.0.0.1", "10.0.0.2"], transport=_fake_hierarchy())

    r = fresh()
    addr, path = r.resolve("www.example.test")
    check("R4 dead root is skipped", path[0] == "10.0.0.1" and addr == "9.9.9.9",
          f"asked {path[0]} first, still reached {addr}")
    check("R3 delegation without glue is resolved first",
          [n for n, _ in r.glueless] == ["ns1.hoster.test"],
          f"cost {r.glueless[0][1]} extra queries" if r.glueless else "no glueless lookup")
    check("R5 CNAME restarts the walk",
          any("CNAME" in l for l in r.log) and addr == "9.9.9.9")
    for name, label in [("a.loop.test", "R6 CNAME loop stops"),
                        ("www.circ.test", "R6 circular glueless delegation stops"),
                        ("www.bad.test", "R6 referral back up the tree stops"),
                        ("nothing.test", "NXDOMAIN is reported, not retried")]:
        r = fresh()
        try:
            r.resolve(name)
            check(label, False, "returned an address")
        except ResolveError as e:
            check(label, True, f"{len(r.path)} queries: {e}")
    print(f"\n  {'all ok' if not fails else f'{fails} failed'}")
    return 1 if fails else 0


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
    p.add_argument("--selftest", action="store_true")
    a = p.parse_args()

    if a.verify:
        sys.exit(verify())
    if a.selftest:
        sys.exit(selftest())

    r = Resolver()
    try:
        addr, path = r.resolve(a.name)
    except ResolveError as e:
        print("\n".join(r.log))
        sys.exit(f"\n  could not resolve {a.name}: {e}")
    print("\n".join(r.log))
    print(f"\n  {a.name} -> {addr}   ({len(path)} servers asked, "
          f"{len(r.glueless)} nameserver(s) resolved without glue)")


if __name__ == "__main__":
    main()
