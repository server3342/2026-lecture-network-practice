# Week 3 · detailed observations

The short version is in `observation.md`. This file has the numbers and the reasoning behind each line.

**Task 1 — resolver.**
The root server does not have the address because the hierarchy splits the work: it only knows who runs each
top-level zone, so all it can return is a referral (`NS` records for `kr`, with glue `A` records), never a
host's address. My resolver asked three servers for `www.korea.ac.kr` (root → `.kr` server → the university's
own nameserver), against the single question my laptop normally asks its resolver — the other two hops are
work the recursive resolver does for me and then caches. Without glue I resolve the nameserver's own name with
a fresh walk from the root; this happened for `www.nytimes.com` (its chain passes through `xovr.nyt.net`, a zone whose
NS is in another domain, `dns1.p06.nsone.net`, given without glue), and it cost 3 extra queries (root, `.net`, `nsone.net`'s
server) and made the total 13 queries for one name. `www.microsoft.com` is CDN-hosted: in the harness run my address (`23.49.206.40`) differed from `dig`'s
(`104.94.218.45`). I reached Akamai's servers directly from my own address and `dig` came through the campus
resolver; I cannot say which of the two moved, since a CDN answers by who asks *and* changes over time (the later
collection runs on campus gave `23.49.206.40` every time).

**Task 2 — measurement.**
Delegation vs. answer, from the capture: a delegation (packet #2) has Answer RRs = 0, `NS` records in the
Authority section, glue in Additional and the AA flag off; an answer (#6) is the same packet layout with the
`A` record in the Answer section and the AA flag on. My third-party rule is "the CNAME chain leaves the site's
registrable domain, or, with no zone change, the address is in a CDN/cloud AS". It got `www.wikipedia.org`
wrong (`wikimedia.org` is a different zone but the same owner) and `www.github.com` is arguable (Microsoft-owned,
in Microsoft's AS, but its own service). Steering: 8 of 10 CDN-hosted sites answered differently to a different
resolver and 3 of 10 (Akamai) answered differently on the phone network; those 3 were stable across two
campus runs, so it is the network and not time (asking Google or Quad9 twice back to back differed for 1–3 of 10
sites, so some resolver-to-resolver differences are plain rotation). That supports "the answer depends on the asker". For "the answer is *near*" I measured latency afterwards
(2026-10-13, campus Wi-Fi, `latency.txt`): TCP connect time to port 443, 7 tries per address, to every address each
resolver returned. The campus (system) resolver's answer was within 1.3 ms of the fastest answer set for all 10 sites
(4.9–6.5 ms, except `www.wikipedia.org`, where all three resolvers returned the same address at 67 ms). Where the
resolvers disagreed on Akamai- and Microsoft-hosted sites, Quad9's answers were far slower: `www.adobe.com` 292 ms against
5–6 ms, `www.apple.com` 36 ms (Google 37 ms) against 5.5 ms, `www.microsoft.com` 33 ms, `www.github.com` 29 ms. For
the Fastly sites the different address families (`146.75.x` vs. `151.101.x`) gave the same 5–6 ms. So on this
network, asking the local resolver got a near replica every time, and asking a public resolver sometimes got a far
one. The phone-network side of this was not re-measured.

**Task 3 — cache.**
The baseline has two faults with one root cause, it throws the TTL away (`FIXED_LIFETIME = 60`): correctness —
records with a TTL under 60 s (`www.microsoft.com` 20 s, `www.cnn.com` 30 s) were served expired, 266 of 1,000
answers; performance — long-TTL names were refetched every minute (`dns.google` 21 times when once would do),
plus a linear scan over a list. My cache stores `now + ttl` per name in a dict and refetches only after
expiry: 0 stale, 275 upstream. **The floor is 275**: a record fetched at time *t* may only answer queries in
[*t*, *t*+TTL), so a correct cache must fetch again for the first query after each expiry and can never do better
than that greedy count (microsoft 118, cnn 76, netflix 37, spotify 23, github 11, wikipedia 6, and 1 each for
the four long-TTL names). Fetching earlier only adds queries; serving later is stale. Note the cost of
correctness: microsoft went from 52 upstream to 118, because the baseline's saving there was made of expired
answers. The baseline handles `www.microsoft.com` worst (189 of its 322 answers stale) because 20 s is the
shortest TTL and it is also the most popular name.
