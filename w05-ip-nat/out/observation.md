# Week 5 · observation

## 요약 (태스크별 2–3줄, 이론 연결)

- **Task 1 · 서브넷과 LPM (§4.3.2 CIDR, §4.3.3 포워딩).** 주소를 32비트 정수로 보고 마스크(`0xFFFFFFFF << (32-plen)`)로 네트워크·브로드캐스트를 계산하며, 호스트 비트가 켜진 `a.b.c.d/24`는 네트워크가 아니므로 거부합니다. `/31`은 RFC 3021대로 두 주소 모두 호스트, `/32`는 범위 없음입니다. 여러 경로가 겹치면 가장 긴 접두사가 이깁니다(`10.20.30.70`은 기본 경로 포함 5개에 일치, 승자는 `/26`).
- **Task 2 · 내 주소 (§4.3.2 DHCP, §4.3.3 NAT).** 캠퍼스는 사설 `172.16.25.130`이 공인 `163.152.233.x`로, 핫스팟은 `10.53.36.69`가 `118.235.95.x`로 바뀌어 각각 NAT가 최소 한 겹 있습니다(traceroute만으로는 겹수를 셀 수 없음). DHCP Discover는 주소가 없어 출발지 `0.0.0.0`, 서버를 모르므로 목적지 `255.255.255.255`(브로드캐스트)이고, Offer/Ack는 chaddr·yiaddr를 알아 유니캐스트로 옵니다. lease는 핫스팟 3600초, 캠퍼스 1800초입니다.
- **Task 3 · 빠른 LPM (§4.3.3).** 24비트로 직접 인덱싱하는 배열(DIR-24-8, 64 MB)로 조회를 "배열 한 번 읽기"로 만들었습니다. 작업량이 라우트 수(5,000)에 비례하던 선형 탐색과 달리 테이블 크기와 무관하게 일정하고, 약 2,000배 이상 빠릅니다. 하드웨어는 최악 32단계로 상한이 보장되고 메모리가 라우트 수에 비례하는 비트 트라이를 쓰지만, 파이썬에서는 해시·배열 한 번이 32번 반복보다 빠릅니다.

---

## 상세 (실측값과 근거)

**Task 1 — subnets and longest-prefix match.**
`/31` returns `(net, net+1, None)` and `/32` returns `(addr, addr, None)`: RFC 3021 lets both addresses of a
/31 be hosts on a point-to-point link, so first usable is the network address itself and there is no broadcast
address to give; a /32 is a single host, with no range. `10.20.30.70` matches **five** entries — the default
route plus four 10.x entries: `0.0.0.0/0`, `10.0.0.0/8`, `10.20.0.0/16`, `10.20.30.0/24` and `10.20.30.64/26` —
and the **longest prefix (the /26, `lab-rack-2`) wins**, because the more specific route is the one that knows
the most about the destination; the default route is the shortest and only wins when nothing else matches. For
two entries with the same network and length but different next hops I raise `ValueError` in `add()`, because
the table is ambiguous and silently keeping one would forward some packets to a hop nobody meant. (Adding the
identical entry twice is harmless; different networks of equal length never both match one address.)

**Task 2 — where am I.** Full answers, with the table, are in `out/report.md`.
- *NATs:* at least one on each network (a private address inside, a different public address outside). I can prove
  only one on each: the campus traceroute goes from private to public in three hops; the hotspot's traceroute shows
  carrier-internal private/reserved hops that are consistent with carrier-grade NAT on top of the phone's own, but the
  campus path has private hops too, so a traceroute does not prove it. What would settle it is the phone's cellular-side
  address, which I could not read.
- *What changed:* both the private address (`172.16.25.130` → `10.53.36.69`) and the public one
  (`163.152.233.x` → `118.235.95.x`) changed, because each is handed out by a different network's DHCP/NAT.
  The mask (/24) was the same by coincidence.
- *Discover's source is `0.0.0.0`:* the client does not have an address yet, so nothing else could go there,
  and that forces the destination to be the broadcast `255.255.255.255` because it does not know who the
  server is.

**Task 3 — fast lookup.**
I chose a direct-indexed table (the "DIR-24-8" idea): every prefix up to /24 is expanded into an array with one
slot per /24 (2^24 slots of 4 bytes = **64 MB**), so a lookup is one array read on the top 24 bits. Longer
prefixes would go in a small per-length dict checked first (none in this table). Memory is the price: 64 MB
regardless of the number of routes, and adding a short prefix rewrites up to 65,536 slots (the build took
0.14 s, not counted in the lookup time). **What the lookup time is proportional to:** nothing that grows with the
table — it is constant, one memory read (plus at most 8 dict probes for prefixes longer than /24), against
the baseline's work proportional to the number of routes (5,000). Measured: about 4 million lookups/s against
1,559, roughly 2,600× (the baseline runs slower on this machine than the ~7 s in the assignment text, so the
ratio is a little larger than the ratio someone else would see). Hardware still builds the bit-by-bit trie
because it needs a *bounded* lookup — at most 32 steps regardless of the table — in memory that scales with
the number of routes (not a flat 64 MB), and each level can be its own pipeline stage doing one lookup per clock.
In Python that is the wrong trade: one C-level dict or array access is one interpreted operation, while walking
32 bits is 32 interpreted iterations, so the "worse" structure wins here.
