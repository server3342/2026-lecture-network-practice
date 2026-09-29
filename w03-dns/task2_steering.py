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
"""
import argparse, json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

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


def dig(name, rtype="A", server=None):
    """Raw lookup. Transport only - the thinking is yours."""
    args = ["dig", "+short", name, rtype]
    if server:
        args.insert(1, f"@{server}")
    out = subprocess.run(args, capture_output=True, text=True).stdout
    return [l.strip() for l in out.splitlines() if l.strip()]


def dig_full(name, server=None, rtype="A"):
    """Answer section as (owner, type, rdata) rows - shows the whole CNAME chain."""
    args = ["dig", "+nocmd", "+nocomments", "+nostats", "+noquestion",
            "+time=3", "+tries=2", name, rtype]
    if server:
        args.insert(1, f"@{server}")
    out = subprocess.run(args, capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines():
        f = line.split()
        if len(f) >= 5 and not line.startswith(";"):
            rows.append((f[0].rstrip(".").lower(), f[3], " ".join(f[4:]).strip('"').rstrip(".").lower()))
    return rows


def asn_of(ip):
    """(asn, name) from Team Cymru's DNS interface - the address's *owner*, not its name."""
    rev = ".".join(reversed(ip.split(".")))
    rows = dig_full(f"{rev}.origin.asn.cymru.com", rtype="TXT")
    if not rows:
        return None
    asn = rows[0][2].split("|")[0].strip().split()[0]
    named = dig_full(f"AS{asn}.asn.cymru.com", rtype="TXT")
    name = named[0][2].split("|")[-1].strip() if named else "?"
    return [asn, name]


def collect(label="campus wifi"):
    """Add one network's measurements to out/chains.json (B1, B2, B3).

    Each site keeps its CNAME chain and, per network label and per resolver,
    two lookups (the second one measures how much the answer moves on its own).
    Run it once per network, with a different --label.
    """
    path = os.path.join(OUT, "chains.json")
    data = json.load(open(path)) if os.path.exists(path) else {}
    asn_cache = {}
    for site in SITES:
        entry = data.setdefault(site, {"networks": {}})
        per_res = {}
        for rname, server in RESOLVERS.items():
            rows = dig_full(site, server)
            rows2 = dig_full(site, server)                   # noise control
            addrs = sorted(v for _, t, v in rows if t == "A")
            addrs2 = sorted(v for _, t, v in rows2 if t == "A")
            chain = [[o, t, v, ] for o, t, v in rows if t == "CNAME"]
            for a in addrs:
                if a not in asn_cache:
                    asn_cache[a] = asn_of(a)
            per_res[rname] = {"chain": chain, "addrs": addrs, "addrs_again": addrs2,
                              "asn": sorted({tuple(asn_cache[a]) for a in addrs if asn_cache[a]})}
        entry["networks"][label] = per_res
        entry["chain"] = per_res["system"]["chain"]
        print(f"  {site:<20} {len(entry['chain'])} CNAME hop(s)   "
              + "  ".join(f"{r}={','.join(v['addrs'][:2]) or '-'}" for r, v in per_res.items()))
    os.makedirs(OUT, exist_ok=True)
    json.dump(data, open(path, "w"), indent=2)
    print(f"\n  -> out/chains.json  (networks so far: "
          f"{sorted({n for e in data.values() for n in e['networks']})})")


# ------------------------------------------------------------- the analysis
# Suffixes with more than one label. Without this, www.bbc.co.uk -> "co.uk".
MULTI_SUFFIX = {"co.uk", "ac.uk", "ac.kr", "co.kr", "or.kr", "go.kr", "com.au", "co.jp"}

# ASN owners that are CDNs / clouds rather than the site's own network.
CDN_ASN_WORDS = ("AKAMAI", "CLOUDFLARE", "FASTLY", "AMAZON", "CLOUDFRONT",
                 "EDGECAST", "EDGIO", "LIMELIGHT", "INCAPSULA", "IMPERVA", "STACKPATH",
                 "AZURE", "MICROSOFT", "GOOGLE")


def zone(name):
    """Registrable domain: last two labels, or last three under a known 2-label suffix."""
    labels = name.split(".")
    n = 3 if ".".join(labels[-2:]) in MULTI_SUFFIX else 2
    return ".".join(labels[-n:])


def naive_third_party(site, chain):
    """The tempting rule: last two labels of the end of the chain vs. the site."""
    end = chain[-1][2] if chain else site
    return ".".join(end.split(".")[-2:]) != ".".join(site.split(".")[-2:])


def my_rule(site, chain, asns):
    """Third party if EITHER the chain leaves the site's registrable domain,
    OR (no CNAME evidence) the address belongs to a known CDN/cloud AS.

    Returns (verdict, reason)."""
    end = chain[-1][2] if chain else site
    if zone(end) != zone(site):
        return True, f"chain leaves {zone(site)} for {zone(end)}"
    hit = [n for _, n in asns if any(w in n.upper() for w in CDN_ASN_WORDS)]
    if hit:
        return True, f"no zone change, but address is in {hit[0]}"
    return False, "chain stays in own zone" if chain else "no CNAME, address in a non-CDN AS"


# Which two networks the headline "different network" number compares, and (optionally) a drift check.
NETWORK_PAIRS = [("KUWIFI Sejong", "phone hotspot"), ("KUWIFI Sejong", "KUWIFI Sejong (after)"),
                 ("phone hotspot", "KUWIFI Sejong (after)")]


def _differs(a, b):
    return set(a) != set(b)


def report():
    """Read out/chains.json and write out/report.md."""
    data = json.load(open(os.path.join(OUT, "chains.json")))
    networks = sorted({n for e in data.values() for n in e["networks"]})
    L = ["# Week 3 · Task 2 report", "",
         "Measured from: " + ", ".join(f"**{n}**" for n in networks) +
         f". Resolvers: {', '.join(RESOLVERS)} (system = the OS stub, see `resolvectl`).", "",
         "## B4 · The rule", "",
         "*Naive rule*: compare the last two labels of the end of the CNAME chain with the site's.",
         "*My rule*: third party if the chain leaves the site's **registrable domain** "
         "(public-suffix aware, so `co.uk`/`ac.kr` count as one suffix), **or**, when there is no "
         "zone change, if the address sits in a CDN/cloud AS (Team Cymru origin lookup).", "",
         "| site | chain length | final zone | naive rule | my rule | why |", "|---|---|---|---|---|---|"]
    verdicts = {}
    first = networks[0]
    for site in SITES:
        e = data[site]
        chain = e["chain"]
        asns = e["networks"][first]["system"]["asn"]
        naive = naive_third_party(site, chain)
        mine, why = my_rule(site, chain, asns)
        verdicts[site] = mine
        end = chain[-1][2] if chain else site
        L.append(f"| {site} | {len(chain)} | {zone(end)} | {'yes' if naive else 'no'} | "
                 f"{'yes' if mine else 'no'} | {why} |")

    L += ["", "AS owners seen (first network, system resolver):", ""]
    for site in SITES:
        asns = data[site]["networks"][first]["system"]["asn"]
        L.append(f"- {site}: " + ("; ".join(f"AS{a} {n}" for a, n in asns) or "-"))

    cdn = [s for s in SITES if verdicts[s]]
    L += ["", "## B5 · The steering number", ""]
    L.append(f"CDN-hosted by my rule: **N = {len(cdn)}** of {len(SITES)} sites "
             f"({', '.join(cdn)}).")
    L.append("")
    L.append("A different address set is not proof of steering: a CDN rotates addresses even for "
             "the *same* resolver asked twice. So each cell below shows differs / disjoint, and the "
             "noise row is the same resolver against itself.")
    L.append("")
    L.append("| comparison | differs (sets not equal) | disjoint (no shared address) |")
    L.append("|---|---|---|")

    def count(pairs):
        d = j = 0
        for s in cdn:
            a, b = pairs(s)
            d += _differs(a, b)
            j += not (set(a) & set(b))
        return d, j

    for n in networks:
        R = lambda s, r: data[s]["networks"][n][r]["addrs"]
        R2 = lambda s, r: data[s]["networks"][n][r]["addrs_again"]
        names = list(RESOLVERS)
        for r in RESOLVERS:
            d, j = count(lambda s: (R(s, r), R2(s, r)))
            note = " (stub cache: always equal)" if r == "system" else ""
            L.append(f"| {n}: {r} vs. {r} asked again (noise){note} | {d} of {len(cdn)} | {j} of {len(cdn)} |")
        for i in range(len(names)):
            for k in range(i + 1, len(names)):
                d, j = count(lambda s: (R(s, names[i]), R(s, names[k])))
                L.append(f"| {n}: {names[i]} vs. {names[k]} | {d} of {len(cdn)} | {j} of {len(cdn)} |")
    for a, b in NETWORK_PAIRS:
        if a in networks and b in networks:
            for r in RESOLVERS:
                d, j = count(lambda s: (data[s]["networks"][a][r]["addrs"], data[s]["networks"][b][r]["addrs"]))
                L.append(f"| {r}: {a} vs. {b} | {d} of {len(cdn)} | {j} of {len(cdn)} |")
    # The headline number: a site counts if ANY two resolvers (same network) disagreed.
    by_resolver = [s for s in cdn if any(
        _differs(data[s]["networks"][n][a]["addrs"], data[s]["networks"][n][b]["addrs"])
        for n in networks for a in RESOLVERS for b in RESOLVERS if a < b)]
    A, B = NETWORK_PAIRS[0]
    by_network = [s for s in cdn if A in networks and B in networks and any(
        _differs(data[s]["networks"][A][r]["addrs"], data[s]["networks"][B][r]["addrs"])
        for r in RESOLVERS)]
    L += ["", f"**{len(by_resolver)} of {len(cdn)} CDN-hosted sites answered differently to a different resolver** "
              f"({', '.join(by_resolver)}).",
          f"**{len(by_network)} of {len(cdn)} answered differently from a different network** "
          f"({A} vs {B}, same resolver; {', '.join(by_network) or 'none'}). "
          f"The `(after)` row, if present, re-measures the first network later: differences there are drift in time, "
          f"not location.", ""]
    L += ["Per site (addresses, first two shown):", ""]
    for s in cdn:
        for n in networks:
            row = "; ".join(f"{r}={','.join(data[s]['networks'][n][r]['addrs'][:2]) or '-'}"
                            for r in RESOLVERS)
            L.append(f"- {s} @ {n}: {row}")

    for extra in ("notes.md", "partA.md"):       # hand-written sections, kept out of the generator
        path = os.path.join(OUT, extra)
        if os.path.exists(path):
            L += ["", open(path, encoding="utf-8").read().rstrip()]
    open(os.path.join(OUT, "report.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("  -> out/report.md")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--collect", action="store_true")
    p.add_argument("--report", action="store_true")
    p.add_argument("--label", default="campus wifi",
                   help="which network you are on (used with --collect)")
    a = p.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if a.collect:
        collect(a.label)
    elif a.report:
        report()
    else:
        p.print_help()
