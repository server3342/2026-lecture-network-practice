# Week 3 · observation

## 요약 (태스크별 2–3줄, 이론 연결)

- **Task 1 · 반복 리졸버 (§2.4.2 DNS 계층).** 루트 서버는 호스트 주소를 갖고 있지 않고 TLD 서버 위치(NS + glue)만 알려 주는 위임(referral)을 돌려줍니다. 그래서 루트 → TLD → 권한 서버로 직접 내려가며 `www.korea.ac.kr`을 3번의 질의로 풀었고, 평소에는 재귀 리졸버가 이 일을 대신하고 캐시합니다. glue가 없는 위임(`www.nytimes.com`, `nsone.net`)은 NS 이름부터 새로 풀어야 해서 질의가 3건 더 들었습니다.
- **Task 2 · 측정 (§2.4.3 레코드, §2.5 CDN).** 캡처에서 위임 응답(Answer 0, Authority에 NS, AA 꺼짐)과 답변 응답(Answer에 A, AA 켜짐)은 같은 패킷 형식에 채워진 섹션만 다릅니다. CDN은 CNAME 체인으로 제3자 도메인에 연결되고, 12개 중 10개가 CDN이었습니다. 리졸버가 달라지면 10곳 중 8곳의 답이 달랐지만, 지연 시간을 재지 않았으므로 "가까운 곳으로 유도"까지는 증명하지 못했습니다.
- **Task 3 · 캐시 (§2.4.2 캐싱, TTL).** baseline은 TTL을 버리고 60초로 고정해서, TTL이 짧은 레코드는 만료된 채 내주고(정확성, 266건) 긴 레코드는 불필요하게 다시 가져옵니다(성능). 같은 원인입니다. `만료 시각 = 저장 시각 + TTL`로 저장하면 stale 0, 상류 질의 275건이 되고, 이 275가 하한입니다. 만료 전에는 답이 맞고 만료 후에는 반드시 다시 물어야 하기 때문입니다.

---

## 상세 (실측값과 근거)

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
sites, so some resolver-to-resolver differences are plain rotation). That supports "the answer depends on the asker" but not "the answer is *near*": I did not measure
latency, and for the Fastly sites the difference followed the resolver family, not my location.

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
