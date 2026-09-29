## Reading the numbers (what the tables do and do not show)

**Networks.** *KUWIFI Sejong* = campus Wi-Fi. *phone hotspot* = phone tethering on a mobile carrier
(the phone's own Wi-Fi was off, and the public address was in the carrier's block, not the campus's).
No VPN was running on either (WARP disconnected, no Tailscale exit node). The "system" resolver is
different on each network (campus resolver vs. the carrier's), which is why it is compared separately.

**Third-party rule.** Third party if the CNAME chain ends outside the site's registrable domain, or,
when it does not, if the address's AS owner is on a CDN/cloud list. Where it was wrong or arguable:

- **`www.wikipedia.org` — wrong.** The chain ends in `wikimedia.org`, a different zone, so my rule (and
  the naive last-two-labels rule) says *third party*. But Wikimedia Foundation owns both names and runs
  the servers itself (AS14907). A zone comparison cannot see ownership.
- **`www.github.com` — arguable, and my second clause caused it.** The chain stays in `github.com`, but the
  address sits in Microsoft's AS8075, and my AS list contains "MICROSOFT", so it was flagged. GitHub is
  owned by Microsoft and served from Azure, so "third party" depends on whether you count a parent company;
  the rule cannot answer that.
- `www.netflix.com` correctly comes out *not* third party (own AS, Open Connect) and `www.korea.ac.kr` has
  no CNAME and its own AS. **None of the 12 sites is an anycast-without-CNAME case**, so that branch of my rule
  was never tested by this list.

**Steering.** 8 of 10 CDN-hosted sites answered differently to a different resolver on the same network, and 3 of 10
(the Akamai sites: microsoft, adobe, apple) answered differently on the phone network than on campus.

- *Is that time drift?* I re-measured campus after the hotspot run (`KUWIFI Sejong (after)`). Campus vs. campus-after:
  0 of 10 differ for the system and Google resolvers, so the 3 Akamai sites did not move with time; they moved when
  I changed network (system and Google, 3 of 10 each). Quad9 differed 2 of 10 between the two campus runs, so
  Quad9 answers are not stable enough to use as evidence either way.
- *Rotation exists:* asking the same public resolver twice back to back changed the answer for 1 of 10 sites
  (Google, in one run) and 1–3 of 10 (Quad9), so some of the resolver-to-resolver differences are ordinary rotation.
  The system resolver's 0 of 10 is a stub-cache hit and proves nothing.

What it does **not** show:

- Different addresses are not the same as *nearer* addresses. I measured no latency, so claim (b) is only
  supported as "the answer depends on who asks", not as "the answer is nearby".
- For Fastly sites (cnn, bbc, spotify, nytimes) the campus resolver and the carrier's resolver returned the
  *same* `146.75.x.x` address while Google and Quad9 returned `151.101.x.x`. The difference follows the
  resolver family, not my location. And `www.wikipedia.org` and `www.stanford.edu` never changed at all.
- Public anycast resolvers (8.8.8.8, 9.9.9.9) changed their answers between my two networks for the Akamai
  sites (Google: campus `23.x` vs. hotspot `104.94.x`/`23.32.x`), which means a different resolver instance answered
  — the CDN sees the resolver's location, not mine.
- My own iterative resolver reached `www.microsoft.com` at `23.49.206.40` on campus (from my own address, straight to
  Akamai's servers), matching what the campus resolver gave in the collection runs.
