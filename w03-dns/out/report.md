# Week 3 · Task 2 report

Measured from: **KUWIFI Sejong**, **KUWIFI Sejong (after)**, **phone hotspot**. Resolvers: system, google, quad9 (system = the OS stub, see `resolvectl`).

## B4 · The rule

*Naive rule*: compare the last two labels of the end of the CNAME chain with the site's.
*My rule*: third party if the chain leaves the site's **registrable domain** (public-suffix aware, so `co.uk`/`ac.kr` count as one suffix), **or**, when there is no zone change, if the address sits in a CDN/cloud AS (Team Cymru origin lookup).

| site | chain length | final zone | naive rule | my rule | why |
|---|---|---|---|---|---|
| www.microsoft.com | 2 | akamaiedge.net | yes | yes | chain leaves microsoft.com for akamaiedge.net |
| www.netflix.com | 1 | netflix.com | no | no | chain stays in own zone |
| www.adobe.com | 2 | akamai.net | yes | yes | chain leaves adobe.com for akamai.net |
| www.cnn.com | 1 | fastly.net | yes | yes | chain leaves cnn.com for fastly.net |
| www.apple.com | 3 | akamaiedge.net | yes | yes | chain leaves apple.com for akamaiedge.net |
| www.korea.ac.kr | 0 | korea.ac.kr | no | no | no CNAME, address in a non-CDN AS |
| www.stanford.edu | 1 | netlifyglobalcdn.com | yes | yes | chain leaves stanford.edu for netlifyglobalcdn.com |
| www.bbc.co.uk | 2 | fastly.net | yes | yes | chain leaves bbc.co.uk for fastly.net |
| www.spotify.com | 1 | fastly.net | yes | yes | chain leaves spotify.com for fastly.net |
| www.github.com | 1 | github.com | no | yes | no zone change, but address is in microsoft-corp-msn-as-block - microsoft corporation, us |
| www.wikipedia.org | 1 | wikimedia.org | yes | yes | chain leaves wikipedia.org for wikimedia.org |
| www.nytimes.com | 3 | fastly.net | yes | yes | chain leaves nytimes.com for fastly.net |

AS owners seen (first network, system resolver):

- www.microsoft.com: AS16625 akamai-as - akamai technologies, inc., us
- www.netflix.com: AS40027 netflix-asn - netflix streaming services inc., us
- www.adobe.com: AS20940 akamai-asn1 - akamai international b.v., nl
- www.cnn.com: AS54113 fastly - fastly, inc., us
- www.apple.com: AS16625 akamai-as - akamai technologies, inc., us
- www.korea.ac.kr: AS9452 kunet-as-kr - korea university, kr
- www.stanford.edu: AS16509 amazon-02 - amazon.com, inc., us
- www.bbc.co.uk: AS54113 fastly - fastly, inc., us
- www.spotify.com: AS54113 fastly - fastly, inc., us
- www.github.com: AS8075 microsoft-corp-msn-as-block - microsoft corporation, us
- www.wikipedia.org: AS14907 wikimedia - wikimedia foundation inc., us
- www.nytimes.com: AS54113 fastly - fastly, inc., us

## B5 · The steering number

CDN-hosted by my rule: **N = 10** of 12 sites (www.microsoft.com, www.adobe.com, www.cnn.com, www.apple.com, www.stanford.edu, www.bbc.co.uk, www.spotify.com, www.github.com, www.wikipedia.org, www.nytimes.com).

A different address set is not proof of steering: a CDN rotates addresses even for the *same* resolver asked twice. So each cell below shows differs / disjoint, and the noise row is the same resolver against itself.

| comparison | differs (sets not equal) | disjoint (no shared address) |
|---|---|---|
| KUWIFI Sejong: system vs. system asked again (noise) (stub cache: always equal) | 0 of 10 | 0 of 10 |
| KUWIFI Sejong: google vs. google asked again (noise) | 1 of 10 | 1 of 10 |
| KUWIFI Sejong: quad9 vs. quad9 asked again (noise) | 2 of 10 | 2 of 10 |
| KUWIFI Sejong: system vs. google | 4 of 10 | 4 of 10 |
| KUWIFI Sejong: system vs. quad9 | 8 of 10 | 8 of 10 |
| KUWIFI Sejong: google vs. quad9 | 4 of 10 | 4 of 10 |
| KUWIFI Sejong (after): system vs. system asked again (noise) (stub cache: always equal) | 0 of 10 | 0 of 10 |
| KUWIFI Sejong (after): google vs. google asked again (noise) | 0 of 10 | 0 of 10 |
| KUWIFI Sejong (after): quad9 vs. quad9 asked again (noise) | 3 of 10 | 3 of 10 |
| KUWIFI Sejong (after): system vs. google | 4 of 10 | 4 of 10 |
| KUWIFI Sejong (after): system vs. quad9 | 8 of 10 | 8 of 10 |
| KUWIFI Sejong (after): google vs. quad9 | 4 of 10 | 4 of 10 |
| phone hotspot: system vs. system asked again (noise) (stub cache: always equal) | 0 of 10 | 0 of 10 |
| phone hotspot: google vs. google asked again (noise) | 1 of 10 | 1 of 10 |
| phone hotspot: quad9 vs. quad9 asked again (noise) | 1 of 10 | 1 of 10 |
| phone hotspot: system vs. google | 5 of 10 | 5 of 10 |
| phone hotspot: system vs. quad9 | 8 of 10 | 8 of 10 |
| phone hotspot: google vs. quad9 | 4 of 10 | 4 of 10 |
| system: KUWIFI Sejong vs. phone hotspot | 3 of 10 | 3 of 10 |
| google: KUWIFI Sejong vs. phone hotspot | 3 of 10 | 3 of 10 |
| quad9: KUWIFI Sejong vs. phone hotspot | 3 of 10 | 3 of 10 |
| system: KUWIFI Sejong vs. KUWIFI Sejong (after) | 0 of 10 | 0 of 10 |
| google: KUWIFI Sejong vs. KUWIFI Sejong (after) | 0 of 10 | 0 of 10 |
| quad9: KUWIFI Sejong vs. KUWIFI Sejong (after) | 2 of 10 | 2 of 10 |
| system: phone hotspot vs. KUWIFI Sejong (after) | 3 of 10 | 3 of 10 |
| google: phone hotspot vs. KUWIFI Sejong (after) | 3 of 10 | 3 of 10 |
| quad9: phone hotspot vs. KUWIFI Sejong (after) | 1 of 10 | 1 of 10 |

**8 of 10 CDN-hosted sites answered differently to a different resolver** (www.microsoft.com, www.adobe.com, www.cnn.com, www.apple.com, www.bbc.co.uk, www.spotify.com, www.github.com, www.nytimes.com).
**3 of 10 answered differently from a different network** (KUWIFI Sejong vs phone hotspot, same resolver; www.microsoft.com, www.adobe.com, www.apple.com). The `(after)` row, if present, re-measures the first network later: differences there are drift in time, not location.

Per site (addresses, first two shown):

- www.microsoft.com @ KUWIFI Sejong: system=23.49.206.40; google=23.49.206.40; quad9=23.199.22.71
- www.microsoft.com @ KUWIFI Sejong (after): system=23.49.206.40; google=23.49.206.40; quad9=184.28.10.89
- www.microsoft.com @ phone hotspot: system=104.94.218.45; google=104.94.218.45; quad9=184.28.10.89
- www.adobe.com @ KUWIFI Sejong: system=23.76.153.115,23.76.153.121; google=23.76.153.115,23.76.153.121; quad9=23.215.106.160,23.215.106.161
- www.adobe.com @ KUWIFI Sejong (after): system=23.76.153.115,23.76.153.121; google=23.76.153.115,23.76.153.121; quad9=23.46.228.10,23.46.228.12
- www.adobe.com @ phone hotspot: system=23.67.53.168,23.67.53.176; google=23.32.4.104,23.32.4.105; quad9=23.46.228.10,23.46.228.12
- www.cnn.com @ KUWIFI Sejong: system=146.75.51.5; google=151.101.131.5,151.101.195.5; quad9=151.101.131.5,151.101.195.5
- www.cnn.com @ KUWIFI Sejong (after): system=146.75.51.5; google=151.101.131.5,151.101.195.5; quad9=151.101.131.5,151.101.195.5
- www.cnn.com @ phone hotspot: system=146.75.51.5; google=151.101.131.5,151.101.195.5; quad9=151.101.131.5,151.101.195.5
- www.apple.com @ KUWIFI Sejong: system=23.49.205.28; google=23.49.205.28; quad9=23.63.77.47
- www.apple.com @ KUWIFI Sejong (after): system=23.49.205.28; google=23.49.205.28; quad9=23.63.77.47
- www.apple.com @ phone hotspot: system=104.94.216.37; google=104.94.216.37; quad9=184.28.3.43
- www.stanford.edu @ KUWIFI Sejong: system=15.197.167.90,3.33.186.135; google=15.197.167.90,3.33.186.135; quad9=15.197.167.90,3.33.186.135
- www.stanford.edu @ KUWIFI Sejong (after): system=15.197.167.90,3.33.186.135; google=15.197.167.90,3.33.186.135; quad9=15.197.167.90,3.33.186.135
- www.stanford.edu @ phone hotspot: system=15.197.167.90,3.33.186.135; google=15.197.167.90,3.33.186.135; quad9=15.197.167.90,3.33.186.135
- www.bbc.co.uk @ KUWIFI Sejong: system=146.75.48.81; google=151.101.0.81,151.101.128.81; quad9=151.101.0.81,151.101.128.81
- www.bbc.co.uk @ KUWIFI Sejong (after): system=146.75.48.81; google=151.101.0.81,151.101.128.81; quad9=151.101.0.81,151.101.128.81
- www.bbc.co.uk @ phone hotspot: system=146.75.48.81; google=151.101.0.81,151.101.128.81; quad9=151.101.0.81,151.101.128.81
- www.spotify.com @ KUWIFI Sejong: system=146.75.51.42; google=151.101.131.42,151.101.195.42; quad9=151.101.131.42,151.101.195.42
- www.spotify.com @ KUWIFI Sejong (after): system=146.75.51.42; google=151.101.131.42,151.101.195.42; quad9=151.101.131.42,151.101.195.42
- www.spotify.com @ phone hotspot: system=146.75.51.42; google=151.101.131.42,151.101.195.42; quad9=151.101.131.42,151.101.195.42
- www.github.com @ KUWIFI Sejong: system=20.200.245.247; google=20.200.245.247; quad9=20.27.177.113
- www.github.com @ KUWIFI Sejong (after): system=20.200.245.247; google=20.200.245.247; quad9=20.27.177.113
- www.github.com @ phone hotspot: system=20.200.245.247; google=20.200.245.247; quad9=20.27.177.113
- www.wikipedia.org @ KUWIFI Sejong: system=103.102.166.224; google=103.102.166.224; quad9=103.102.166.224
- www.wikipedia.org @ KUWIFI Sejong (after): system=103.102.166.224; google=103.102.166.224; quad9=103.102.166.224
- www.wikipedia.org @ phone hotspot: system=103.102.166.224; google=103.102.166.224; quad9=103.102.166.224
- www.nytimes.com @ KUWIFI Sejong: system=146.75.49.164; google=151.101.1.164,151.101.129.164; quad9=151.101.1.164,151.101.129.164
- www.nytimes.com @ KUWIFI Sejong (after): system=146.75.49.164; google=151.101.1.164,151.101.129.164; quad9=151.101.1.164,151.101.129.164
- www.nytimes.com @ phone hotspot: system=146.75.49.164; google=151.101.1.164,151.101.129.164; quad9=151.101.1.164,151.101.129.164

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

## Part A · The capture (`out/dns.pcapng`)

Taken on the laptop's Wi-Fi interface (KUWIFI, campus) with capture filter `port 53`, excluding the
three campus/ISP recursive resolvers so that only my own Task 1 resolver's conversations are in the file
(88 packets = 44 query/response pairs; the run was `task1_resolve.py --verify` plus two single names).
Ethernet addresses are masked (vendor prefix kept); the unmasked original is kept locally, not submitted.

| # | Answer |
|---|---|
| A1 | Source of every query is my own private address; the destinations are root, TLD and authoritative servers — no recursive resolver appears. |
| A2 | Query **#1** and response **#2**, both with transaction ID `0xa837` (`www.korea.ac.kr` asked to `198.41.0.4`, a root server). |
| A3 | **Delegation: #2** — Answer RRs 0, Authority RRs 6 (`kr` `NS` records), Additional RRs 11 (glue). **Answer: #6** — from the authoritative server for korea.ac.kr, Answer RRs 1 (the `A` record). |
| A4 | Largest response: **#50**, 897 bytes on the wire (855 bytes of DNS payload), the root's referral for `www.microsoft.com-c-3.edgekey.net`. It is large because a referral to a big TLD carries **13 NS records plus 27 additional records** (A and AAAA glue for all 13 `gtld-servers.net`, plus the EDNS OPT record). Names in it are compressed (an NS RDATA of 4 bytes is one label plus a pointer); without compression it would be larger. |
