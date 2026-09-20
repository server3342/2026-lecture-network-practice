# Week 3 · observation

## Task 1 · iterative resolver

**이 관측으로 확인한 것**
- 루트는 주소가 아니라 "다음에 물을 서버(NS)"만 알려 준다. DNS는 답을 한 곳이 아니라 위임으로 나눠 가진 계층이다(`www.korea.ac.kr`: 루트 → `kr.` → `korea.ac.kr`, 서버 3곳).
- glue 없는 위임이 12곳 중 4곳에서 나왔고, 그때마다 네임서버 이름을 루트부터 다시 해석해 질의가 3번씩 늘었다. 리졸버에 재귀가 필요한 이유다.
- 노트북은 리졸버에 한 번만 묻지만, 그 뒤에서는 이름 하나에 서버를 3~17곳 물어본다(캐시 없이).

The root server does not hold the address because it only knows who runs each top-level zone: for `www.korea.ac.kr` it answered with 0 answers and 6 `NS` records for `kr.` plus glue addresses for them, which is a pointer, not a result. Each zone answers only for what it owns, so the walk is root → `kr.` server → `korea.ac.kr` server, 3 servers for one name, while my laptop normally asks one (its resolver) and lets that do the 3.
A delegation without glue happened on 4 of the 12 sites (netflix, adobe, apple, nytimes): the parent gave `NS` names but no addresses, e.g. `a10-64.akam.net` for adobe. I resolved that nameserver's own name with a nested walk from the root, and it cost 3 extra queries each time (adobe: 13 queries in total, 3 of them spent on the glueless name).
R4, R5 and R6 are not luck: `--selftest` runs a fake hierarchy with a dead root, a CNAME loop, a circular glueless delegation and a referral pointing back up the tree, and all stop cleanly. `www.microsoft.com` happened to match `dig` this time (104.94.218.45), but it is CDN-hosted and Quad9 gave a different Akamai address (23.0.194.92), so a mismatch there would be expected, not a bug.

## Task 2 · steering

**이 관측으로 확인한 것**
- (a) 12곳 중 8곳이 CNAME 체인 끝에서 다른 조직의 CDN(Akamai·Fastly·Netlify)이 서비스하므로 대체로 맞다. 다만 "제3자"는 도메인 이름이 아니라 운영 주체로 판정해야 해서, 내 규칙은 같은 조직의 다른 도메인인 `wikipedia.org`에서 틀렸다.
- 리졸버마다 주소가 다른 CDN은 8곳 중 7곳이었지만, 같은 Wi-Fi를 76분 뒤에 다시 재도 비슷하게 갈렸다(Akamai가 시간에 따라 재매핑). "주소가 다르다"만으로는 steering의 증거가 못 된다.
- (b) 같은 수집 안에서 비교하면 먼 replica는 먼 리졸버를 따라갔다(Quad9: KT에서 +118~196 ms, 한국 인스턴스가 된 WARP에서 -5~0 ms). 즉 리졸버 위치 기준으로는 확인됐지만, 사용자 위치 자체의 효과는 통신사와 출구가 모두 한국이라 확인하지 못했다.

My rule has three steps: a hop inside a known CDN zone means third party; otherwise a chain that ends in a different registrable domain means third party; otherwise the address's owning AS decides. It was wrong on **www.wikipedia.org**: the chain ends in `wikimedia.org`, a different domain, so the rule said third party, but it is the same organisation (AS14907 is Wikimedia's own). A domain name says nothing about who owns it, and the last-two-labels rule fails on the same site. It is right on `www.bbc.co.uk` and `www.korea.ac.kr` only by luck, since it reduces both to the bare suffix `co.uk` / `ac.kr`.
The steering number is **7 of 8** CDN-hosted sites answering differently (no shared address) to a different resolver, but that number alone would overstate claim (b), so I measured the distance too. For 4 of the 7 (all Fastly) the replicas differ but sit at the same distance, about 6-7 ms from everyone: anycast, a different address is not a different place. For the other 3 (all Akamai) Quad9 sent me to a replica 16-26 times farther away (154 ms vs 9.5 ms for microsoft, 131 vs 6 for adobe, 204 vs 8 for apple). So DNS does steer, but by where the *resolver* is, not by where I am. It only helps me when my resolver is near me.
Between networks (B3) I collected four times, one after another and never at the same time: KT GiGA Wi-Fi, KT mobile tethering (+65 min), the KT Wi-Fi again (+76 min), and a second Wi-Fi with Cloudflare WARP exiting in Incheon (+158 min).
A different answer alone proves nothing: Wi-Fi vs tethering had 3 resolver/site cases with no address in common, but the Wi-Fi compared with **itself** 76 minutes later also had 3 (adobe and apple: Akamai's answer changes over time by itself). Handshake times cannot be compared between networks either: the median for the same address was +26.4 ms on the tether (+0.3 ms between the two Wi-Fi runs), and about 100 ms higher under WARP on every address, even `www.korea.ac.kr` in Seoul (11 ms to 199 ms), so that is the access link or the tunnel and not a farther replica.
What does survive is a comparison inside one collection, where the access link adds the same to both resolvers. In the three KT collections the Akamai replica that Quad9 gave was 118-196 ms slower than the system resolver's for microsoft, adobe and apple (apple on the tether: +40), and under WARP that gap was -5, -7 and 0 ms. In that one collection Quad9 answered from a Korean instance (KINX, AS9286) instead of the i3D.net one in the Netherlands that I identified on the tether, and the system resolver was Cloudflare's. So a far replica followed a far resolver, which fits "steered by where the resolver is, not by where I am". Limits: it is one VPN run; the resolver instances come from `whoami.akamai.net` checks I ran next to each collection and are not stored in `chains.json` (on the Wi-Fi I only saw a neighbouring `103.194.167.x` address); WARP changed the system and Google resolvers as well as Quad9, so the resolver's location is the best explanation, not the only one; and the exit was Incheon, so this says nothing about a client in another country.
The ECS probe (Google told I was in Korea or the US) changed only 2 of 8 sites and none disjointly. Within one resolver 2 of 12 sites changed between the 3 runs, so a single-shot comparison would have overcounted.
In the capture, a delegation and an answer are the same packet format with different sections filled: response #2 (from the root, ID `0xe782`) has answer count 0, authority 6 `NS`, while response #6 (from `163.152.11.6`, ID `0xd693`) has answer count 1. The largest response is 891 bytes, a root delegation with 13 `NS` plus 13 `A` and 13 `AAAA` glue records.

## Task 3 · cache

**이 관측으로 확인한 것**
- baseline의 적중률 67.5%는 정확성을 무시한 숫자다. 1,000개 응답 중 266개가 TTL이 지난 답이었고, TTL을 지키면 stale은 0이 된다.
- 정확한 캐시의 upstream 하한은 구현의 영리함이 아니라 워크로드와 TTL이 정한다. 각 이름을 만료 뒤 처음 오는 질의에서만 가져오는 것이 최소이고, 그 값이 275다.
- 내 캐시는 275로 그 하한과 같고 stale이 0이다. 여기서 더 줄이려면 만료된 답을 내줘야 하므로, 더 줄이는 것은 곧 틀리는 것이다.

The baseline keeps every record for a fixed 60 s and ignores the TTL: for a 20 s record that is 40 s of serving an expired answer (correctness), for a 24 h record it is a re-fetch every minute (performance). They are one bug, the TTL is thrown away. The linear scan is a third, smaller problem: it costs time per lookup, not upstream queries.
The floor is **275** upstream queries, and my cache makes exactly 275 with 0 stale. A fetch at time t is good for exactly `[t, t+ttl)`, and it cannot be made in the future, so the first query outside every window already fetched for a name needs a new fetch, and fetching earlier only ends the window earlier. That greedy choice is optimal, so the number is set by the workload and the TTLs, not by the data structure. The baseline's 325 is 50 above it, but it is under the floor on the short records (microsoft: 52 vs 118), which is only possible by serving expired answers.
The baseline handles `www.microsoft.com` (TTL 20 s) worst: it is the most-asked name (322 of 1,000 queries), and 189 of the 266 stale answers are its. On the other end, `dns.google`, `a.root-servers.net`, `www.korea.ac.kr` and `www.stanford.edu` should each be fetched once and the baseline fetched them 20 to 27 times.
