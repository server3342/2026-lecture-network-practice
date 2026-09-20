#!/usr/bin/env python3
"""Week 3 · Task 2 — Does DNS actually steer you? Measure it.

Textbook §2.4.3 (records) and §2.5 (CDNs).

The lecture claims two things:

    (a) most large sites are served by a CDN, reached through a CNAME chain
    (b) DNS steers each user to a *nearby* replica

Both are testable from your laptop, and one of them is harder to prove than
the slide makes it look. Your job is to produce the evidence and a number.

    python3 task2_steering.py --collect        # gather the raw data
    python3 task2_steering.py --report         # your analysis

What you have to build
----------------------
1.  For each hostname in SITES, follow the CNAME chain to its end and record
    every hop. `--collect` should leave the raw data in out/chains.json.

2.  Decide, for each site, whether it is served by a **third party**.
    This is the hard part and there is no single right answer:

      - `www.microsoft.com` ends at `akamaiedge.net`     - clearly third party
      - `www.netflix.com`   stops inside `netflix.com`   - own CDN, not third party
      - some sites have no CNAME at all and still sit behind a CDN (anycast)
      - `foo.cloudfront.net` and `foo.s3.amazonaws.com` are both Amazon,
        but they are not the same service

    Write down the rule you used and **defend it in observation.md**. A rule
    that just compares the last two labels will be wrong on at least one of
    the sites below; find which, and say so.

3.  Ask **two different resolvers** for the same name and compare the
    addresses you get back. If DNS really steers by location, a CDN-hosted
    name should answer differently to resolvers sitting in different places.

        RESOLVERS below has your system resolver and two public ones.

    Report: of N CDN-hosted sites, how many returned a different address set
    from a different resolver? Claim (b) predicts most of them. Check it.

Pass condition
--------------
There is no fixed answer. You pass by producing, in out/report.md:

  - the table: site | chain length | final zone | third party? | your rule's verdict
  - the steering number: "X of N sites answered differently to a different resolver"
  - at least one site where your classification rule was wrong, and why

How this implementation works
-----------------------------
--collect   asks every resolver for every site RUNS times, one second apart, and
            keeps the sets. A CDN rotates and shuffles its answers, so comparing
            one reply with one reply mostly measures the shuffle, not the
            steering. It also times a TCP handshake to each address (claim (b) is
            about *nearby*, and an address you cannot place is not evidence) and
            looks up who owns each address (Team Cymru, over DNS).
            `--label` names the network you are on. Run it again from another
            network with another label and --report compares them (B3).
--report    classifies, counts and writes out/report.md. The judgement column
            (JUDGED) is a human verdict written from the evidence; the rule is
            code; the report shows where they disagree.
"""
import argparse, datetime, ipaddress, json, os, socket, subprocess, time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHAINS = os.path.join(OUT, "chains.json")
REPORT = os.path.join(OUT, "report.md")
CAPTURE = os.path.join(OUT, "dns.pcapng")

SITES = [
    "www.microsoft.com",     # Akamai, multi-hop
    "www.netflix.com",       # own CDN
    "www.adobe.com",
    "www.cnn.com",
    "www.apple.com",
    "www.korea.ac.kr",       # no CDN at all
    "www.stanford.edu",
    "www.bbc.co.uk",
    "www.spotify.com",
    "www.github.com",
    "www.wikipedia.org",
    "www.nytimes.com",
]

RESOLVERS = {
    "system": None,          # whatever is in your resolv.conf
    "google": "8.8.8.8",
    "quad9":  "9.9.9.9",
}

# Same resolver, but told (EDNS Client Subnet) that the client sits somewhere
# else. Only a probe: it tests whether the CDN *listens* to the client's
# location, it does not replace a second real network.
ECS_PROBES = {
    "google+ecs-kr": ("8.8.8.8", "163.152.6.0/24"),     # a Korea University prefix
    "google+ecs-us": ("8.8.8.8", "171.67.215.0/24"),    # a Stanford prefix
}

RUNS, GAP = 3, 1.0       # repeat every question, one second apart


# --------------------------------------------------------------------- transport
def dig(name, rtype="A", server=None, subnet=None):
    """Raw lookup. Transport only - the thinking is yours."""
    args = ["dig", "-4", "+short", "+time=3", "+tries=1", name, rtype]
    if server:
        args.insert(2, f"@{server}")
    if subnet:
        args.insert(2, f"+subnet={subnet}")
    try:
        out = subprocess.run(args, capture_output=True, text=True, timeout=15).stdout
    except subprocess.TimeoutExpired:
        return []
    return [l.strip() for l in out.splitlines() if l.strip() and not l.startswith(";")]


def addresses(lines):
    """Keep only the IPv4 addresses of a `dig +short` answer (it also prints CNAMEs)."""
    found = []
    for l in lines:
        try:
            found.append(str(ipaddress.IPv4Address(l)))
        except ValueError:
            pass
    return sorted(found)


def follow_chain(site):
    """Every name from `site` to the end of its CNAME chain, one hop at a time."""
    chain = [site]
    while len(chain) <= 10:
        hop = [l for l in dig(chain[-1], "CNAME") if l.endswith(".")]
        if not hop or hop[0].rstrip(".").lower() in chain:
            break
        chain.append(hop[0].rstrip(".").lower())
    return chain


def tcp_rtt(ip, port=443, tries=2, timeout=1.5):
    """Best of a couple of TCP handshakes, in ms. Opens and closes; sends nothing."""
    best = None
    for _ in range(tries):
        t0 = time.perf_counter()
        try:
            socket.create_connection((ip, port), timeout=timeout).close()
        except OSError:
            continue
        dt = (time.perf_counter() - t0) * 1000
        best = dt if best is None else min(best, dt)
    return None if best is None else round(best, 1)


def owner_of(ip, cache={}):
    """'AS16625 AKAMAI-AS - Akamai Technologies, Inc., US', via Team Cymru's DNS."""
    if ip in cache:
        return cache[ip]
    rev = ".".join(reversed(ip.split(".")))
    origin = dig(f"{rev}.origin.asn.cymru.com", "TXT")
    name = "unknown"
    if origin:
        asn = origin[0].strip('"').split("|")[0].strip()
        detail = dig(f"AS{asn}.asn.cymru.com", "TXT")
        tail = detail[0].strip('"').split("|")[-1].strip() if detail else "?"
        name = f"AS{asn} {tail}"
    cache[ip] = name
    return name


# ------------------------------------------------------------------ collection
def collect(label="network-A"):
    """Raw chains and per-resolver answers -> out/chains.json.

    {site: {"asn": {ip: owner},
            "observations": {label: {"time", "chain", "resolvers": {
                name: {"runs": [[ip..]..], "addresses": [ip..], "rtt_ms": {ip: ms}}}}}}}
    """
    data = json.load(open(CHAINS, encoding="utf-8")) if os.path.exists(CHAINS) else {}
    probes = {n: (s, None) for n, s in RESOLVERS.items()} | ECS_PROBES
    stamp = datetime.datetime.now().astimezone().isoformat(timespec="seconds")

    print(f"  label {label!r}: {len(SITES)} sites x {len(probes)} resolvers x {RUNS} runs")
    chains = {}
    for site in SITES:
        chains[site] = follow_chain(site)
        print(f"    chain  {site:<20} {len(chains[site]) - 1} CNAME hop(s) -> {chains[site][-1]}")

    runs = {s: {p: [] for p in probes} for s in SITES}
    for i in range(RUNS):
        for site in SITES:
            for p, (server, subnet) in probes.items():
                runs[site][p].append(addresses(dig(site, "A", server, subnet)))
        print(f"    run {i + 1}/{RUNS} done")
        if i < RUNS - 1:
            time.sleep(GAP)

    rtt = {}
    for site in SITES:
        rec = data.setdefault(site, {"asn": {}, "observations": {}})
        resolvers = {}
        for p in probes:
            union = sorted({ip for r in runs[site][p] for ip in r},
                           key=lambda ip: tuple(map(int, ip.split("."))))
            for ip in union[:4]:                       # a few per resolver is enough
                rtt.setdefault(ip, tcp_rtt(ip))
            resolvers[p] = {"runs": runs[site][p], "addresses": union,
                            "rtt_ms": {ip: rtt[ip] for ip in union[:4]}}
            for ip in union:
                rec["asn"][ip] = owner_of(ip)
        rec["observations"][label] = {"time": stamp, "chain": chains[site],
                                      "resolvers": resolvers}
    json.dump(data, open(CHAINS, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"\n  wrote {CHAINS}")


# ------------------------------------------------------------- classification
# Registrable domains ("eTLD+1") need the Public Suffix List. This is the
# fraction of it the 12 sites need, and the reason a plain "last two labels"
# rule fails: for www.bbc.co.uk it compares "co.uk" with "co.uk".
TWO_LEVEL_SUFFIXES = {"co.uk", "ac.uk", "org.uk", "ac.kr", "co.kr", "or.kr",
                      "com.au", "co.jp", "com.cn"}

# Zones that exist to run somebody else's content delivery. A hand-kept list -
# it is the weakest part of the rule and the report says so.
CDN_ZONES = {"akamai.net", "akamaiedge.net", "akamaihd.net", "edgekey.net",
             "edgesuite.net", "fastly.net", "fastlylb.net", "cloudfront.net",
             "netlifyglobalcdn.com", "netlify.app", "cloudflare.net",
             "azureedge.net", "azurefd.net", "edgecastcdn.net", "llnwd.net",
             "b-cdn.net", "incapdns.net"}

# Words in an address's owner (ASN name) that mean "a CDN operator". Only used
# when the CNAME chain gives nothing away - the anycast case.
CDN_OPERATORS = ("AKAMAI", "FASTLY", "CLOUDFLARE", "EDGECAST", "LIMELIGHT",
                 "STACKPATH", "INCAPSULA", "IMPERVA")

# The human verdict. Written by looking at the chain AND at who owns the
# addresses (out/report.md prints both). "third" = a different organisation
# operates the servers you are sent to.
JUDGED = {
    "www.microsoft.com": ("third", "Akamai serves it (edgekey.net -> akamaiedge.net)"),
    "www.netflix.com":   ("own",   "Open Connect: the addresses belong to Netflix's own AS"),
    "www.adobe.com":     ("third", "Akamai (edgesuite.net -> akamai.net)"),
    "www.cnn.com":       ("third", "Fastly"),
    "www.apple.com":     ("third", "Apple's own aaplimg.com fronts it, but it ends on Akamai"),
    "www.korea.ac.kr":   ("own",   "no CNAME; the address is Korea University's own AS"),
    "www.stanford.edu":  ("third", "Netlify, whose addresses are Amazon's"),
    "www.bbc.co.uk":     ("third", "Fastly, behind the BBC's own pri.bbc.co.uk name"),
    "www.spotify.com":   ("third", "Fastly"),
    "www.github.com":    ("own",   "GitHub's own name; addresses are in its parent Microsoft's AS"),
    "www.wikipedia.org": ("own",   "wikimedia.org is the same organisation; its own AS"),
    "www.nytimes.com":   ("third", "Fastly, behind the NYT's own nyt.net name"),
}


def zone(name):
    """Registrable domain, approximately: last two labels, or three under co.uk etc."""
    labels = name.rstrip(".").lower().split(".")
    if len(labels) >= 3 and ".".join(labels[-2:]) in TWO_LEVEL_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def naive_zone(name):
    return ".".join(name.rstrip(".").lower().split(".")[-2:])


def naive_rule(site, chain, owners):
    """The rule the assignment warns about: compare the last two labels."""
    return "third" if naive_zone(chain[-1]) != naive_zone(site) else "own"


def my_rule(site, chain, owners):
    """Returns (verdict, reason). Three steps, in order:

    1. a hop lands in a known CDN zone                -> third party
    2. the chain ends in a different registrable zone -> third party
    3. the chain never left the site's zone (or has no CNAME): who owns the
       address? a CDN operator's AS                   -> third party (anycast)
    otherwise: own.
    """
    for hop in chain[1:]:
        if zone(hop) in CDN_ZONES:
            return "third", f"a hop is in the CDN zone {zone(hop)}"
    if zone(chain[-1]) != zone(site):
        return "third", f"the chain ends in {zone(chain[-1])}, not {zone(site)}"
    for owner in owners:
        if any(word in owner.upper() for word in CDN_OPERATORS):
            return "third", f"the address is owned by {owner}"
    return "own", "the chain stays inside the site's zone and no CDN owns the address"


# ---------------------------------------------------------------- the capture
def capture_summary():
    """Part A numbers, read from out/dns.pcapng with tshark. None if unavailable."""
    if not os.path.exists(CAPTURE):
        return None
    fields = ["frame.number", "frame.len", "ip.src", "ip.dst", "dns.id",
              "dns.flags.response", "dns.count.answers", "dns.count.auth_rr",
              "dns.count.add_rr", "dns.resp.type", "dns.qry.name", "udp.length"]
    cmd = ["tshark", "-r", CAPTURE, "-Y", "dns", "-T", "fields",
           "-E", "separator=/t", "-E", "occurrence=a", "-E", "aggregator=,"]
    for f in fields:
        cmd += ["-e", f]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    rows = []
    for line in out.splitlines():
        p = line.split("\t") + [""] * len(fields)
        rec = dict(zip(fields, p))
        if rec["frame.number"]:
            rec["is_response"] = rec["dns.flags.response"] in ("1", "True")
            rec["types"] = [t for t in rec["dns.resp.type"].split(",") if t]
            rows.append(rec)
    if not rows:
        return None

    def query_of(resp):
        for r in rows:
            if (not r["is_response"] and r["dns.id"] == resp["dns.id"]
                    and r["ip.src"] == resp["ip.dst"] and r["ip.dst"] == resp["ip.src"]
                    and int(r["frame.number"]) < int(resp["frame.number"])):
                return r

    responses = [r for r in rows if r["is_response"]]
    def first(pred):
        for r in responses:
            if pred(r):
                return r
    deleg = first(lambda r: r["dns.count.answers"] == "0" and "2" in r["types"])
    answer = first(lambda r: r["dns.count.answers"] not in ("", "0") and "1" in r["types"])
    biggest = max(responses, key=lambda r: int(r["frame.len"]), default=None)
    kinds = {"1": "A", "2": "NS", "5": "CNAME", "6": "SOA", "28": "AAAA", "41": "OPT"}
    return {"rows": rows, "queries": sum(1 for r in rows if not r["is_response"]),
            "responses": len(responses), "deleg": deleg, "answer": answer,
            "deleg_q": query_of(deleg) if deleg else None,
            "answer_q": query_of(answer) if answer else None,
            "biggest": biggest, "kinds": kinds,
            "names": sorted({r["dns.qry.name"] for r in rows if r["dns.qry.name"]})}


# ---------------------------------------------------------------------- report
def _span(x):
    return f"{x:g} ms" if x is not None else "-"


def report():
    """out/chains.json (+ out/dns.pcapng) -> out/report.md."""
    data = json.load(open(CHAINS, encoding="utf-8"))
    labels = sorted({l for r in data.values() for l in r["observations"]},
                    key=lambda l: min(r["observations"][l]["time"]
                                      for r in data.values() if l in r["observations"]))
    primary = labels[0]
    real = list(RESOLVERS)
    L = []
    w = L.append

    def obs(site, label=primary):
        return data[site]["observations"][label]

    def addrs(site, res, label=primary):
        return set(obs(site, label)["resolvers"][res]["addresses"])

    def owners(site, label=primary):
        return sorted({data[site]["asn"].get(ip, "unknown")
                       for r in obs(site, label)["resolvers"].values()
                       for ip in r["addresses"]})

    verdicts = {}
    for s in SITES:
        chain = obs(s)["chain"]
        v, why = my_rule(s, chain, owners(s))
        verdicts[s] = {"chain": chain, "rule": v, "why": why,
                       "naive": naive_rule(s, chain, owners(s)),
                       "truth": JUDGED[s][0]}
    cdn = [s for s in SITES if verdicts[s]["truth"] == "third"]
    n = len(cdn)

    w("# Week 3 · Task 2 report\n")
    w(f"Collected {min(o['time'] for r in data.values() for o in r['observations'].values())} "
      f"from network(s): {', '.join(labels)}. Resolvers: {', '.join(real)}, "
      f"each asked {RUNS} times per site, {GAP:g} s apart.\n")

    # ---- B1 / B4
    w("## 1. Who serves each site (B1, B4)\n")
    w("`third party?` is my judgement from the chain and the owner of the addresses; "
      "`my rule` is the code in `my_rule()`; `naive` is the last-two-labels rule the "
      "assignment warns about. **✗ marks a disagreement with the judgement.**\n")
    w("| site | chain length | final zone | third party? | my rule | naive (last 2 labels) | why the judgement |")
    w("|---|---|---|---|---|---|---|")
    for s in SITES:
        v = verdicts[s]
        mark = lambda x: f"{'third party' if x == 'third' else 'own'}{'' if x == v['truth'] else ' ✗'}"
        w(f"| {s} | {len(v['chain']) - 1} | {zone(v['chain'][-1])} | "
          f"{'yes' if v['truth'] == 'third' else 'no'} | {mark(v['rule'])} | "
          f"{mark(v['naive'])} | {JUDGED[s][1]} |")
    w("\nChains (each hop is one CNAME):\n")
    for s in SITES:
        w(f"- `{' -> '.join(verdicts[s]['chain'])}`  \n  owner of the addresses: "
          f"{'; '.join(owners(s)) or 'unknown'}")

    w("\n**My rule**, in order: (1) any hop inside a known CDN zone (`CDN_ZONES`) means third "
      "party; (2) otherwise, a chain that ends in a different registrable domain than the site "
      "means third party; (3) otherwise, if the address is owned by a CDN operator's AS, third "
      "party (the anycast case, no CNAME needed); else own. Registrable domains use a small "
      "two-level suffix list (`co.uk`, `ac.kr`, ...) because the Public Suffix List is not "
      "in the container.\n")

    # ---- errors
    w("## 2. Where the rules were wrong\n")
    wrong = [s for s in SITES if verdicts[s]["rule"] != verdicts[s]["truth"]]
    naive_wrong = [s for s in SITES if verdicts[s]["naive"] != verdicts[s]["truth"]]
    w(f"My rule got **{len(wrong)} of {len(SITES)}** wrong; the naive rule got "
      f"**{len(naive_wrong)} of {len(SITES)}** wrong.\n")
    for s in wrong:
        v = verdicts[s]
        w(f"- **{s}** — my rule said *{v['rule']}* because {v['why']}. It is *{v['truth']}*: "
          f"{JUDGED[s][1]}. Step (2) equates \"a different domain\" with \"a different "
          f"organisation\", and a domain name carries no information about who owns it.")
    for s in [x for x in naive_wrong if x not in wrong]:
        v = verdicts[s]
        w(f"- **{s}** — only the naive rule was wrong: it said *{v['naive']}*.")
    luck = [s for s in SITES if naive_zone(s) in TWO_LEVEL_SUFFIXES]
    if luck:
        w(f"- The naive rule's zone for {', '.join(luck)} is "
          f"{', '.join(repr(naive_zone(s)) for s in luck)} — the whole public suffix, which "
          "every other site under it shares. It happens to give the right verdict here, but it "
          "could not tell those sites from any other one under the same suffix.")
    hidden = [s for s in SITES if verdicts[s]["rule"] == verdicts[s]["truth"] == "third"
              and not any(zone(h) in CDN_ZONES for h in verdicts[s]["chain"][1:])]
    if hidden:
        w(f"- Right for a fragile reason: {', '.join(hidden)} — caught only by step (2)/(3), "
          "not by the CDN list.")
    w("\nThe weak points, honestly: the CDN list is hand-written and dated; step (2) is a "
      "guess about ownership; step (3) trusts an ASN name. A CDN that is not on the list, "
      "reached through a CNAME inside the site's own zone, on addresses the operator "
      "registered under its own name, would be missed.\n")

    # ---- B2 / B5
    w("## 3. Does DNS steer? (B2, B5)\n")
    per = {}
    for s in SITES:
        sets = {r: addrs(s, r) for r in real}
        pairs = [(a, b) for i, a in enumerate(real) for b in real[i + 1:]]
        per[s] = {"any": [(a, b) for a, b in pairs if sets[a] != sets[b]],
                  "disjoint": [(a, b) for a, b in pairs if not sets[a] & sets[b]],
                  "unstable": [r for r in real
                               if len({tuple(x) for x in obs(s)["resolvers"][r]["runs"]}) > 1]}
    x = sum(1 for s in cdn if per[s]["disjoint"])
    y = sum(1 for s in cdn if per[s]["any"])
    w(f"**{x} of {n} CDN-hosted sites answered differently to a different resolver** "
      f"(no address in common between at least two resolvers, all {RUNS} runs pooled). "
      f"{y} of {n} differed at all"
      f"{f'; the other {y - x} overlapped, which is what a rotating answer looks like' if y > x else ''}. "
      f"Counting all {len(SITES)} sites: "
      f"{sum(1 for s in SITES if per[s]['disjoint'])} disjoint, "
      f"{sum(1 for s in SITES if per[s]['any'])} different.\n")
    noisy = [s for s in SITES if per[s]["unstable"]]
    w(f"Control: within a single resolver, {len(noisy)} of {len(SITES)} sites changed their "
      f"answer between the {RUNS} runs"
      f"{' (' + ', '.join(noisy) + ')' if noisy else ''}. That is the noise a single-shot "
      "comparison would have counted as steering.\n")
    w("| site | " + " | ".join(real) + " | disjoint pairs |")
    w("|---|" + "---|" * (len(real) + 1))
    for s in SITES:
        cells = [", ".join(sorted(addrs(s, r), key=lambda ip: tuple(map(int, ip.split(".")))))
                 or "-" for r in real]
        pairs = "; ".join(f"{a}≠{b}" for a, b in per[s]["disjoint"]) or "-"
        w(f"| {s} | " + " | ".join(cells) + f" | {pairs} |")

    # ---- proximity
    w("\n### Is the different answer a *nearer* one? (claim b)\n")
    w("A different address only matters if it is somewhere else. TCP handshake time to the "
      "fastest address each resolver gave (from this network, best of 2):\n")
    w("| site | " + " | ".join(real) + " | fastest |")
    w("|---|" + "---|" * (len(real) + 1))
    close, far = 0, []
    for s in cdn:
        best = {r: min([v for v in obs(s)["resolvers"][r]["rtt_ms"].values() if v is not None],
                       default=None) for r in real}
        known = {r: v for r, v in best.items() if v is not None}
        fastest = min(known, key=known.get) if known else None
        spread = (max(known.values()) / min(known.values())) if len(known) > 1 else 1
        if per[s]["disjoint"] and spread < 1.5:
            close += 1
        elif per[s]["disjoint"]:
            slow = max(known, key=known.get)
            far.append(f"{s}: {min(known.values()):g} ms from {fastest}, "
                       f"**{known[slow]:g} ms from {slow}** ({spread:.0f}x)")
        w(f"| {s} | " + " | ".join(_span(best[r]) for r in real) + f" | {fastest or '-'} |")
    diff_sites = [s for s in cdn if per[s]["disjoint"]]
    w(f"\nOf the {len(diff_sites)} CDN sites that answered differently, **{close}** put every "
      f"resolver's replica within 1.5x of the others' handshake time from here: different "
      "address, same distance. Anycast CDNs hand out several address blocks that are all "
      "announced from many places, so a different address is not a different place.\n")
    if far:
        w("The other " + str(len(far)) + " are the case where the answer really did point somewhere "
          "else, and it was *farther* from this network, not nearer:\n")
        for f in far:
            w(f"- {f}")
        w("")

    # ---- ECS
    w("### What if the client looked like it was somewhere else? (EDNS Client Subnet probe)\n")
    ecs = list(ECS_PROBES)
    if all(e in obs(SITES[0])["resolvers"] for e in ecs):
        rows = []
        for s in cdn:
            a, b = (set(obs(s)["resolvers"][e]["addresses"]) for e in ecs)
            rows.append((s, a != b, not a & b))
        w(f"Same resolver (Google), told the client is in Korea or in the US. "
          f"{sum(r[2] for r in rows)} of {n} CDN sites gave disjoint answers, "
          f"{sum(r[1] for r in rows)} of {n} differed at all"
          f"{': ' + ', '.join(r[0] for r in rows if r[1]) if any(r[1] for r in rows) else ''}. "
          "This shows whether the CDN's authoritative servers act on the client's location; "
          "it is a probe from one network, not a second vantage point.\n")

    # ---- second network
    if len(labels) > 1:
        w("### Between networks (B3)\n")
        w("Same three resolvers, same sites, asked from each network. A site counts as "
          "different when the two address sets share no address (CDN sites only).\n")
        for other in labels[1:]:
            w(f"**{primary}  vs  {other}**\n")
            w("| resolver | sites with disjoint answers | which |")
            w("|---|---|---|")
            for r in real:
                d = [s for s in cdn if other in data[s]["observations"]
                     and not addrs(s, r) & addrs(s, r, other)]
                w(f"| {r} | {len(d)} of {n} | {', '.join(d) or '-'} |")
            # a different answer is only informative if it is stable inside each network
            movers = sorted({s for s in cdn for l in (primary, other) if l in data[s]["observations"]
                             for r in real if len({tuple(x) for x in
                                                   obs(s, l)["resolvers"][r]["runs"]}) > 1})
            w(f"\nInside a single network, the answer moved between the {RUNS} runs for: "
              f"{', '.join(movers) or 'no site'}. A difference on those sites cannot be told "
              "from the CDN's own rotation with this data.\n")
            shifts = []
            for site in SITES:
                for r in real:
                    a = obs(site, primary)["resolvers"][r]["rtt_ms"]
                    b = obs(site, other)["resolvers"][r]["rtt_ms"]
                    shifts += [b[ip] - a[ip] for ip in set(a) & set(b) if a[ip] and b[ip]]
            if shifts:
                shifts.sort()
                med = shifts[len(shifts) // 2]
                w(f"For the {len(shifts)} addresses that were timed from both, the median "
                  f"handshake time changed by **{med:+.1f} ms** "
                  f"(range {shifts[0]:+.1f} to {shifts[-1]:+.1f}). "
                  + ("A shift like that is present for every site, including a university "
                     "server in Korea, so it is the access link and not a nearer or farther "
                     "replica. Handshake times are only comparable *within* a network.\n"
                     if abs(med) >= 5 else
                     "No systematic shift, so the two runs saw the same distances.\n"))
        if {"system", "quad9"} <= set(real):
            # Handshake times cannot be compared between networks, but a gap INSIDE one
            # collection can: whatever the access link adds, it adds to both resolvers.
            gap = {}
            for site in cdn:
                gap[site] = {}
                for l in labels:
                    o = obs(site, l)["resolvers"]
                    a = [v for v in o["quad9"]["rtt_ms"].values() if v is not None]
                    b = [v for v in o["system"]["rtt_ms"].values() if v is not None]
                    if a and b:
                        gap[site][l] = min(a) - min(b)
            show = [s for s in cdn if any(abs(v) >= 50 for v in gap[s].values())]
            if show:
                w("**Does a far answer follow the resolver?** Fastest replica Quad9 gave minus "
                  "fastest replica the system resolver gave, in ms, measured inside each "
                  "collection (so the access link cancels out). Sites where any collection "
                  "differs by 50 ms or more:\n")
                w("| site | " + " | ".join(labels) + " |")
                w("|---|" + "---|" * len(labels))
                for site in show:
                    w(f"| {site} | " + " | ".join(
                        f"{gap[site][l]:+.0f}" if l in gap[site] else "-" for l in labels) + " |")
                w("")
    else:
        w("### Between networks (B3)\n")
        w(f"**Not measured.** Only one network was available (`{primary}`), so claim (b) has "
          "not been tested from two places. What stands in for it here: three resolvers at "
          "different distances, and the ECS probe. That weakens the conclusion: resolvers "
          "differ in *where they are*, but also in how they are configured, so a difference "
          "between them does not isolate location. To add the real thing, run "
          "`python3 task2_steering.py --collect --label \"phone tethering\"` on the other "
          "network and re-run `--report`.\n")

    # ---- Part A
    w("## 4. On the wire (Part A)\n")
    cap = capture_summary()
    if not cap:
        w("`out/dns.pcapng` is missing or tshark could not read it.\n")
    else:
        w(f"Capture: {cap['queries']} queries and {cap['responses']} responses, taken inside "
          "the container that ran `task1_resolve.py` (its own traffic only: the container "
          "cannot see the host's network card). Names asked: "
          f"{', '.join(cap['names'])}.\n")
        d, dq, a, aq, big = (cap["deleg"], cap["deleg_q"], cap["answer"], cap["answer_q"],
                             cap["biggest"])
        if d and dq:
            w(f"- **Delegation** — query #{dq['frame.number']} → response #{d['frame.number']}, "
              f"transaction ID `{dq['dns.id']}` on both, from {d['ip.src']}: answer count 0, "
              f"authority count {d['dns.count.auth_rr']} (NS), additional "
              f"{d['dns.count.add_rr']}.")
        if a and aq:
            w(f"- **Answer** — query #{aq['frame.number']} → response #{a['frame.number']}, "
              f"transaction ID `{aq['dns.id']}` on both, from {a['ip.src']}: answer count "
              f"{a['dns.count.answers']}.")
        if big:
            counts = {}
            for t in big["types"]:
                counts[cap["kinds"].get(t, t)] = counts.get(cap["kinds"].get(t, t), 0) + 1
            mix = ", ".join(f"{v} {k}" for k, v in sorted(counts.items()))
            msg = (f", of which {int(big['udp.length']) - 8} bytes are the DNS message"
                   if big["udp.length"].isdigit() else "")
            w(f"- **Largest response** — #{big['frame.number']}, **{big['frame.len']} bytes** on "
              f"the wire{msg}, from {big['ip.src']}, for `{big['dns.qry.name']}` "
              f"(answer/authority/additional = {big['dns.count.answers']}/"
              f"{big['dns.count.auth_rr']}/{big['dns.count.add_rr']}; records: {mix}). "
              "What made it large: it is a delegation, and a delegation lists every nameserver "
              "of the zone (NS) and, to save the client a lookup, glue addresses for each "
              "(A and AAAA). The actual answer in the same exchange is one address, four bytes.")
        w("")
    open(REPORT, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(f"  wrote {REPORT}")
    print(f"  {x} of {n} CDN-hosted sites answered differently to a different resolver "
          f"({y} of {n} differed at all); my rule wrong on {len(wrong)}: {', '.join(wrong) or '-'}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--collect", action="store_true")
    p.add_argument("--report", action="store_true")
    p.add_argument("--label", default="network-A",
                   help="name of the network you are on (default: %(default)s)")
    a = p.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if a.collect:
        collect(a.label)
    elif a.report:
        report()
    else:
        p.print_help()
