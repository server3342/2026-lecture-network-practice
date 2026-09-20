# Week 3 · Task 2 report

Collected 2026-09-20T07:22:41+00:00 from network(s): KT GiGA Wi-Fi, KT mobile tethering, KT GiGA Wi-Fi (recheck), Wi-Fi 2 + Cloudflare WARP (ICN). Resolvers: system, google, quad9, each asked 3 times per site, 1 s apart.

## 1. Who serves each site (B1, B4)

`third party?` is my judgement from the chain and the owner of the addresses; `my rule` is the code in `my_rule()`; `naive` is the last-two-labels rule the assignment warns about. **✗ marks a disagreement with the judgement.**

| site | chain length | final zone | third party? | my rule | naive (last 2 labels) | why the judgement |
|---|---|---|---|---|---|---|
| www.microsoft.com | 2 | akamaiedge.net | yes | third party | third party | Akamai serves it (edgekey.net -> akamaiedge.net) |
| www.netflix.com | 1 | netflix.com | no | own | own | Open Connect: the addresses belong to Netflix's own AS |
| www.adobe.com | 2 | akamai.net | yes | third party | third party | Akamai (edgesuite.net -> akamai.net) |
| www.cnn.com | 1 | fastly.net | yes | third party | third party | Fastly |
| www.apple.com | 3 | akamaiedge.net | yes | third party | third party | Apple's own aaplimg.com fronts it, but it ends on Akamai |
| www.korea.ac.kr | 0 | korea.ac.kr | no | own | own | no CNAME; the address is Korea University's own AS |
| www.stanford.edu | 1 | netlifyglobalcdn.com | yes | third party | third party | Netlify, whose addresses are Amazon's |
| www.bbc.co.uk | 2 | fastly.net | yes | third party | third party | Fastly, behind the BBC's own pri.bbc.co.uk name |
| www.spotify.com | 1 | fastly.net | yes | third party | third party | Fastly |
| www.github.com | 1 | github.com | no | own | own | GitHub's own name; addresses are in its parent Microsoft's AS |
| www.wikipedia.org | 1 | wikimedia.org | no | third party ✗ | third party ✗ | wikimedia.org is the same organisation; its own AS |
| www.nytimes.com | 3 | fastly.net | yes | third party | third party | Fastly, behind the NYT's own nyt.net name |

Chains (each hop is one CNAME):

- `www.microsoft.com -> www.microsoft.com-c-3.edgekey.net -> e13678.dscb.akamaiedge.net`  
  owner of the addresses: AS16625 AKAMAI-AS - Akamai Technologies, Inc., US
- `www.netflix.com -> www.prod.ftl.netflix.com`  
  owner of the addresses: AS40027 NETFLIX-ASN - Netflix Streaming Services Inc., US
- `www.adobe.com -> www.adobe.com.edgesuite.net -> a1319.dscr.akamai.net`  
  owner of the addresses: AS20940 AKAMAI-ASN1 - Akamai International B.V., NL
- `www.cnn.com -> cnn-tls.map.fastly.net`  
  owner of the addresses: AS54113 FASTLY - Fastly, Inc., US
- `www.apple.com -> www-apple-com.v.aaplimg.com -> www.apple.com.edgekey.net -> e6858.dsce9.akamaiedge.net`  
  owner of the addresses: AS16625 AKAMAI-AS - Akamai Technologies, Inc., US
- `www.korea.ac.kr`  
  owner of the addresses: AS9452 KUNET-AS-KR - Korea University, KR
- `www.stanford.edu -> stanford.netlifyglobalcdn.com`  
  owner of the addresses: AS16509 AMAZON-02 - Amazon.com, Inc., US
- `www.bbc.co.uk -> www.bbc.co.uk.pri.bbc.co.uk -> bbc.map.fastly.net`  
  owner of the addresses: AS54113 FASTLY - Fastly, Inc., US
- `www.spotify.com -> atc.spotify.map.fastly.net`  
  owner of the addresses: AS54113 FASTLY - Fastly, Inc., US
- `www.github.com -> github.com`  
  owner of the addresses: AS8075 MICROSOFT-CORP-MSN-AS-BLOCK - Microsoft Corporation, US
- `www.wikipedia.org -> dyna.wikimedia.org`  
  owner of the addresses: AS14907 WIKIMEDIA - Wikimedia Foundation Inc., US
- `www.nytimes.com -> www.prd.map.nytimes.com -> www.prd.map.nytimes.xovr.nyt.net -> nytimes.map.fastly.net`  
  owner of the addresses: AS54113 FASTLY - Fastly, Inc., US

**My rule**, in order: (1) any hop inside a known CDN zone (`CDN_ZONES`) means third party; (2) otherwise, a chain that ends in a different registrable domain than the site means third party; (3) otherwise, if the address is owned by a CDN operator's AS, third party (the anycast case, no CNAME needed); else own. Registrable domains use a small two-level suffix list (`co.uk`, `ac.kr`, ...) because the Public Suffix List is not in the container.

## 2. Where the rules were wrong

My rule got **1 of 12** wrong; the naive rule got **1 of 12** wrong.

- **www.wikipedia.org** — my rule said *third* because the chain ends in wikimedia.org, not wikipedia.org. It is *own*: wikimedia.org is the same organisation; its own AS. Step (2) equates "a different domain" with "a different organisation", and a domain name carries no information about who owns it.
- The naive rule's zone for www.korea.ac.kr, www.bbc.co.uk is 'ac.kr', 'co.uk' — the whole public suffix, which every other site under it shares. It happens to give the right verdict here, but it could not tell those sites from any other one under the same suffix.

The weak points, honestly: the CDN list is hand-written and dated; step (2) is a guess about ownership; step (3) trusts an ASN name. A CDN that is not on the list, reached through a CNAME inside the site's own zone, on addresses the operator registered under its own name, would be missed.

## 3. Does DNS steer? (B2, B5)

**7 of 8 CDN-hosted sites answered differently to a different resolver** (no address in common between at least two resolvers, all 3 runs pooled). 7 of 8 differed at all. Counting all 12 sites: 8 disjoint, 8 different.

Control: within a single resolver, 2 of 12 sites changed their answer between the 3 runs (www.adobe.com, www.apple.com). That is the noise a single-shot comparison would have counted as steering.

| site | system | google | quad9 | disjoint pairs |
|---|---|---|---|---|
| www.microsoft.com | 104.94.218.45 | 104.94.218.45 | 23.0.194.92 | system≠quad9; google≠quad9 |
| www.netflix.com | 207.45.72.1, 207.45.73.1 | 207.45.72.1, 207.45.73.1 | 207.45.72.1, 207.45.73.1 | - |
| www.adobe.com | 23.76.153.91, 23.76.153.169, 23.76.153.176, 23.76.153.202, 23.76.153.208 | 23.50.121.9, 23.50.121.11, 23.50.121.24, 23.50.121.43, 23.50.121.57 | 2.22.234.137, 2.22.234.155 | system≠google; system≠quad9; google≠quad9 |
| www.cnn.com | 146.75.51.5 | 151.101.3.5, 151.101.67.5, 151.101.131.5, 151.101.195.5 | 151.101.3.5, 151.101.67.5, 151.101.131.5, 151.101.195.5 | system≠google; system≠quad9 |
| www.apple.com | 23.41.89.203 | 23.41.89.203, 23.217.69.53, 23.217.180.246 | 23.0.193.49 | system≠quad9; google≠quad9 |
| www.korea.ac.kr | 163.152.6.10 | 163.152.6.10 | 163.152.6.10 | - |
| www.stanford.edu | 3.33.186.135, 15.197.167.90 | 3.33.186.135, 15.197.167.90 | 3.33.186.135, 15.197.167.90 | - |
| www.bbc.co.uk | 146.75.48.81 | 151.101.0.81, 151.101.64.81, 151.101.128.81, 151.101.192.81 | 151.101.0.81, 151.101.64.81, 151.101.128.81, 151.101.192.81 | system≠google; system≠quad9 |
| www.spotify.com | 146.75.51.42 | 151.101.3.42, 151.101.67.42, 151.101.131.42, 151.101.195.42 | 151.101.3.42, 151.101.67.42, 151.101.131.42, 151.101.195.42 | system≠google; system≠quad9 |
| www.github.com | 20.200.245.247 | 20.200.245.247 | 20.27.177.113 | system≠quad9; google≠quad9 |
| www.wikipedia.org | 103.102.166.224 | 103.102.166.224 | 103.102.166.224 | - |
| www.nytimes.com | 146.75.49.164 | 151.101.1.164, 151.101.65.164, 151.101.129.164, 151.101.193.164 | 151.101.1.164, 151.101.65.164, 151.101.129.164, 151.101.193.164 | system≠google; system≠quad9 |

### Is the different answer a *nearer* one? (claim b)

A different address only matters if it is somewhere else. TCP handshake time to the fastest address each resolver gave (from this network, best of 2):

| site | system | google | quad9 | fastest |
|---|---|---|---|---|
| www.microsoft.com | 9.5 ms | 9.5 ms | 154.4 ms | system |
| www.adobe.com | 6.3 ms | 7.2 ms | 130.6 ms | system |
| www.cnn.com | 7.1 ms | 6 ms | 6 ms | google |
| www.apple.com | 7.9 ms | 7.9 ms | 204.2 ms | system |
| www.stanford.edu | 8.2 ms | 8.2 ms | 8.2 ms | system |
| www.bbc.co.uk | 6.5 ms | 6.1 ms | 6.1 ms | google |
| www.spotify.com | 6.8 ms | 6.5 ms | 6.5 ms | google |
| www.nytimes.com | 7.4 ms | 6.3 ms | 6.3 ms | google |

Of the 7 CDN sites that answered differently, **4** put every resolver's replica within 1.5x of the others' handshake time from here: different address, same distance. Anycast CDNs hand out several address blocks that are all announced from many places, so a different address is not a different place.

The other 3 are the case where the answer really did point somewhere else, and it was *farther* from this network, not nearer:

- www.microsoft.com: 9.5 ms from system, **154.4 ms from quad9** (16x)
- www.adobe.com: 6.3 ms from system, **130.6 ms from quad9** (21x)
- www.apple.com: 7.9 ms from system, **204.2 ms from quad9** (26x)

### What if the client looked like it was somewhere else? (EDNS Client Subnet probe)

Same resolver (Google), told the client is in Korea or in the US. 0 of 8 CDN sites gave disjoint answers, 2 of 8 differed at all: www.adobe.com, www.apple.com. This shows whether the CDN's authoritative servers act on the client's location; it is a probe from one network, not a second vantage point.

### Between networks (B3)

Same three resolvers, same sites, asked from each network. A site counts as different when the two address sets share no address (CDN sites only).

**KT GiGA Wi-Fi  vs  KT mobile tethering**

| resolver | sites with disjoint answers | which |
|---|---|---|
| system | 2 of 8 | www.adobe.com, www.apple.com |
| google | 1 of 8 | www.adobe.com |
| quad9 | 0 of 8 | - |

Inside a single network, the answer moved between the 3 runs for: www.adobe.com, www.apple.com. A difference on those sites cannot be told from the CDN's own rotation with this data.

For the 64 addresses that were timed from both, the median handshake time changed by **+26.4 ms** (range -52.6 to +73.4). A shift like that is present for every site, including a university server in Korea, so it is the access link and not a nearer or farther replica. Handshake times are only comparable *within* a network.

**KT GiGA Wi-Fi  vs  KT GiGA Wi-Fi (recheck)**

| resolver | sites with disjoint answers | which |
|---|---|---|
| system | 2 of 8 | www.adobe.com, www.apple.com |
| google | 1 of 8 | www.apple.com |
| quad9 | 0 of 8 | - |

Inside a single network, the answer moved between the 3 runs for: www.adobe.com, www.apple.com. A difference on those sites cannot be told from the CDN's own rotation with this data.

For the 65 addresses that were timed from both, the median handshake time changed by **+0.3 ms** (range -50.1 to +22.0). No systematic shift, so the two runs saw the same distances.

**KT GiGA Wi-Fi  vs  Wi-Fi 2 + Cloudflare WARP (ICN)**

| resolver | sites with disjoint answers | which |
|---|---|---|
| system | 7 of 8 | www.microsoft.com, www.adobe.com, www.cnn.com, www.apple.com, www.bbc.co.uk, www.spotify.com, www.nytimes.com |
| google | 3 of 8 | www.microsoft.com, www.adobe.com, www.apple.com |
| quad9 | 3 of 8 | www.microsoft.com, www.adobe.com, www.apple.com |

Inside a single network, the answer moved between the 3 runs for: www.adobe.com, www.apple.com, www.microsoft.com. A difference on those sites cannot be told from the CDN's own rotation with this data.

For the 50 addresses that were timed from both, the median handshake time changed by **+97.7 ms** (range +45.7 to +188.1). A shift like that is present for every site, including a university server in Korea, so it is the access link and not a nearer or farther replica. Handshake times are only comparable *within* a network.

**Does a far answer follow the resolver?** Fastest replica Quad9 gave minus fastest replica the system resolver gave, in ms, measured inside each collection (so the access link cancels out). Sites where any collection differs by 50 ms or more:

| site | KT GiGA Wi-Fi | KT mobile tethering | KT GiGA Wi-Fi (recheck) | Wi-Fi 2 + Cloudflare WARP (ICN) |
|---|---|---|---|---|
| www.microsoft.com | +145 | +176 | +161 | -5 |
| www.adobe.com | +124 | +118 | +132 | -7 |
| www.apple.com | +196 | +40 | +147 | +0 |

## 4. On the wire (Part A)

Capture: 16 queries and 16 responses, taken inside the container that ran `task1_resolve.py` (its own traffic only: the container cannot see the host's network card). Names asked: a10-64.akam.net, a1319.dscr.akamai.net, www.adobe.com, www.adobe.com.edgesuite.net, www.korea.ac.kr.

- **Delegation** — query #1 → response #2, transaction ID `0xe782` on both, from 198.41.0.4: answer count 0, authority count 6 (NS), additional 11.
- **Answer** — query #5 → response #6, transaction ID `0xd693` on both, from 163.152.11.6: answer count 1.
- **Largest response** — #20, **891 bytes** on the wire, of which 849 bytes are the DNS message, from 198.41.0.4, for `www.adobe.com.edgesuite.net` (answer/authority/additional = 0/13/27; records: 13 A, 13 AAAA, 13 NS, 1 OPT). What made it large: it is a delegation, and a delegation lists every nameserver of the zone (NS) and, to save the client a lookup, glue addresses for each (A and AAAA). The actual answer in the same exchange is one address, four bytes.

