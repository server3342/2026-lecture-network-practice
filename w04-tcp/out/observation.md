# Week 4 · observation

## Task 1 · reliable delivery

**이 관측으로 확인한 것**
- selective-repeat 슬라이딩 윈도우(윈도우 8)를 골랐다 — stop-and-wait이었다면 항상 패킷이 하나만 날아다니므로 채널의 reorder(10%)를 데이터 패킷 쪽에서 전혀 시험하지 못했을 것이다. 그게 슬라이딩 윈도우를 사실상 강제한 지점.
- 가장 먼저, 그리고 가장 치명적으로 깨지는 건 duplication이다. ACK의 seq를 확인 안 하고 "아무 ACK나 오면 다음으로 넘어간다"는 stop-and-wait을 일부러 만들어 같은 채널로 돌려봤더니 2000바이트 중 8바이트만 도착하고 영구히 멈췄다(seq 1에서 멈춤). 중복 ACK 하나가 아직 전달되지도 않은 패킷을 "확인됨"으로 착각하게 만들면, 그 패킷은 다시는 전송되지 않는다.
- seed 246: 최소 250개 대비 실제 323개 전송(1.29배), seed 999: 317개(1.27배) — 27~29%가 신뢰성 유지 비용.

I chose selective repeat over stop-and-wait, and the deciding factor was structural rather than about speed: with only one packet ever outstanding, stop-and-wait would never give the channel's 10% reorder anything to reorder *relative to* on the data side — R2 ("the receiver reassembles in order even though the channel reorders") would go almost untested. A window forces the receiver to actually buffer by sequence number and reassemble out of arrival order, which is the point of §3.4.3.

R3 is real, and I checked it directly rather than taking the warning on faith: I wrote a deliberately buggy stop-and-wait sender that advances to the next packet on *any* incoming ACK without checking which seq it carries — exactly the trap task1.md names. Run through the same `UnreliableChannel(seed=246)`, it delivered 8 of 2000 bytes and stalled permanently, because one duplicate ACK convinced it packet 1 was delivered when it never was, and stop-and-wait has no window to give it a second chance to notice. My real sender keys everything on the seq *inside* the ACK, not on the mere fact that an ACK arrived, and the receiver deduplicates by buffering into a dict keyed by seq — a duplicate data packet just overwrites the same slot with the same bytes instead of being blindly appended.

Both seeds pass identically (`IDENTICAL`), using 627 and 647 of the 200,000-step budget — nowhere near a livelock. The channel carried 323 packets (seed 246) / 317 packets (seed 999) to move 250 packets' worth of data: a 27–29% overhead from retransmissions and duplicate deliveries, which is what reliability cost on a 10%-loss link.

## Task 2 · measure your own link, twice

### Part A — capture

**이 관측으로 확인한 것**
- Wireshark GUI 대신 `sudo tcpdump -i wlp0s20f3 -U -w out/tcp.pcapng 'tcp port 443'`로 직접 캡처(사용자 본인 터미널에서, WARP는 끈 상태). root가 없는 저는 캡처를 못 하는 부분이라 이건 사용자가 직접 실행했다.
- 3-way handshake: `172.16.16.214:44698 ↔ 13.89.179.15:443` (mobile.events.data.microsoft.com), SYN **#22** → SYN-ACK **#27** → ACK **#28**.
- 두 ISN: client 1960688647, server 3032846038 — 0도 아니고 서로 다르다. 서로 독립적으로 무작위 선택.
- MSS 1460(client)/1250(server), window scale shift 10(client)/8(server), 양쪽 다 SACK permitted.
- scaled window: client 최대 ~64,512B, server 최대 ~4,194,304B. 그런데 이 연결은 텔레메트리 하나 보내는 3.8초짜리 교환이라 실제로 한 번에 떠 있던 바이트는 최대 ~6KB 수준 — window가 제한한 게 아니라 보낼 데이터 자체가 그만큼뿐이었다.

Before committing the capture I listed every address and hostname in it: 7 unique IPs, all public service endpoints (`sync-v2.brave.com`, `mobile.events.data.microsoft.com`, `google.com`, `api.beacondb.net`) plus the machine's own private LAN address (172.16.16.214); no DNS-leaked hostnames, no `.ts.net`, nothing personally identifying. I read the capture back with `tshark` from inside the lab container (the container gotcha about `tshark -i` only blocks *live* capture in the container — reading an already-written file with `-r` works fine there).

One full, clean handshake is frames **22 (SYN) → 27 (SYN-ACK) → 28 (ACK)**. The client's initial sequence number is **1960688647**, the server's is **3032846038** — neither is zero, and they share nothing. RFC 793 originally tied the ISN to a slowly incrementing clock so old segments from a prior incarnation of the same 4-tuple couldn't be mistaken for new ones; RFC 6528 replaced that with a cryptographically unpredictable per-connection choice specifically so an off-path attacker can't guess the ISN and inject into or hijack the connection. Zero would defeat both purposes, and so would picking the same value twice.

The SYN (#22) carries **MSS 1460, window scale shift 10, SACK permitted**; the SYN-ACK (#27) carries **MSS 1250, window scale shift 8, SACK permitted**. The scale factor is per direction: it applies to whichever host announced it, in *that* host's own later segments — the SYN/SYN-ACK window fields themselves are sent unscaled by convention. Frame 28 shows this directly: the client's ACK carries a raw window field of 63, which resolves to **64,512 bytes** (`63 << 10`, the client's own shift of 10). The server's later segments (e.g. #48) carry raw window 16,384, resolving to **4,194,304 bytes** (`16384 << 8`, the server's shift of 8).

Neither number was ever close to being the limit. Over the whole ~3.8 s exchange (39 frames, ~25 kB total — 14 kB client→server, 10 kB server→client) the largest run of unacked client bytes before an ACK landed was about five TLS records back to back (~6 KB, frames 300–305) — roughly a tenth of a percent of the client's own advertised window and about a thousandth of the server's. §3.7's flow-control ceiling was nowhere near binding here; the sender simply had nothing more to send. A5's premise ("something else was the limit") holds, just not for a throughput reason — the limit was the size of a telemetry beacon, not the network.

### Part B — throughput on two networks

**이 관측으로 확인한 것**
- KUWIFI(WARP 끔) 중앙값 **151.3 Mbps**, 핸드셰이크 중앙값 **7.8ms**. KUWIFI+WARP(켬) 중앙값 **127.1 Mbps**, 핸드셰이크 중앙값 **10.1ms**.
- 두 라벨은 물리적으로 같은 링크(KUWIFI)고 논리적 경로만 다르다 — 테더링할 전화가 없어서 WARP on/off로 "두 번째 지점"을 만들었다. 접속 링크 자체(원시 용량, 혼잡)는 두 라벨 사이에 동일하다는 한계가 있고, 달라지는 건 WARP 터널을 거치느냐뿐이다.
- spread가 큰 이유(51%, 40%): 5MB는 몇 개의 RTT 안에 끝나는 짧은 전송이라, slow start의 창이 링크 용량까지 다 자란 실행과 아직 자라는 중에 끝난 실행이 섞인다. 게다가 KUWIFI는 캠퍼스 공유망이라 동시 사용자 트래픽도 측정마다 다르다.
- B5: WARP가 핸드셰이크를 +2.3ms 늦췄고, slow start는 라운드(=RTT)당 창을 키우므로 RTT가 길면 정해진 시간 안에 창이 링크 용량까지 자라는 속도 자체가 느려진다(§3.7). 짧은 전송일수록 이 효과가 크게 남는다.

Two labelled networks were needed and I had no second physical link available (nothing to tether from), so I used WARP on/off as the second vantage point: the same Wi-Fi link, two different logical paths. That is a real limitation — anything about the access link itself is identical between the labels; only what changes when traffic is tunneled through Cloudflare's WireGuard endpoint is actually being measured here.

KUWIFI: median **151.3 Mbps**, spread **51%** (114.7–191.5), handshake median **7.8 ms**. KUWIFI+WARP: median **127.1 Mbps**, spread **40%** (86.0–137.2), handshake median **10.1 ms**. Five runs isn't enough to make either spread tight — a 5 MB transfer finishes inside a handful of round trips, so whether TCP's slow-start window happened to reach the link's actual capacity before the transfer ended (a fast run) or was still growing when it finished (a slow run) depends on exactly how the first few round trips landed, and on a campus network the other traffic sharing the link changes between runs too.

B5's mechanism: slow start grows the congestion window roughly by doubling **once per round trip**, not once per unit of wall-clock time — so a longer RTT means the same doubling takes longer in real time to happen. WARP added about 2.3 ms to the handshake (10.1 vs 7.8 ms), and that same per-RTT tax applies to every doubling during the transfer, not just the handshake itself. For a short, fixed-size transfer like this 5 MB pull, that compounds into materially less time spent at full window before the transfer ends — consistent with the ~16% lower median throughput measured with WARP on.

## Task 3 · beat the fixed window

**이 관측으로 확인한 것**
- 왜 baseline이 최악의 sender인가(R5): 자기 goodput 986.8/1000을 얻으려고 큐를 항상 꽉 채우고(avg queue 8.8/10) 보낸 것의 37.4%를 버린다. 그 큐잉 지연은 baseline이 아니라 같은 링크를 나눠 쓰는 다른 모든 flow가 짊어진다. "내가 빠르다"가 아니라 "남을 느리게 만들어서 내가 빠르다".
- 내 window는 대략 19~32 사이 톱니로 수렴, 평균 ~25.8 — 파이프 용량(RTT 20 × 1pkt/slot = 20)보다 살짝 위, 큐를 평균 4.9/10만 채우는 지점.
- backoff를 0.5(교과서 AIMD)에서 0.75로 완화하니 goodput이 87%→99%로 뛰었고, 대신 평균 큐가 3.23→4.86으로 늘었다(그래도 5.0 밑). 0.8까지 더 완화하면 큐가 5.74로 한도를 넘겨버린다 — 0.75가 R4 안에서 낼 수 있는 최댓값에 가깝다.

R5: the baseline is the worst sender precisely *because* it has the highest goodput here, not despite it. It gets 986.8/1000 by keeping the tail-drop queue permanently near full (avg 8.8/10) and simply resending whatever gets dropped — 37.4% of everything it transmits. That queueing delay is paid by every other flow sharing the link, not by the baseline itself; it wins its own throughput by making everyone behind it slower. A sender judged only on its own goodput can't see this cost, which is exactly why R3/R4 exist as separate requirements from goodput.

My controller converges to a sawtooth between roughly **19 and 32**, averaging **~25.8** (traced by instrumenting `on_ack`/`on_loss` around a run without touching `bench.py`). The link's bandwidth-delay product is `RTT(20) × capacity(1/slot) = 20` packets — the minimum needed to keep the pipe full with no queueing at all. My window sits a bit above that, at the point where it's putting a small, bounded amount into the queue (avg 4.9/10) rather than none — tracking the pipe size, not the baseline's 64, which is more than triple what the link can hold before it starts dropping.

Sweeping the decrease factor (holding everything else fixed) shows the tradeoff directly:

| decrease factor | goodput share | loss | avg queue |
|---|---|---|---|
| 0.50 (Reno) | 87% | 0.4% | 3.23 |
| 0.60 | 92% | 0.4% | 3.75 |
| 0.70 | 97% | 0.5% | 4.30 |
| **0.75 (used)** | **99%** | **0.5%** | **4.86** |
| 0.80 | 99% | 0.6% | 5.74 (fails R4) |
| 0.90 | 99% | 1.0% | 7.69 (fails R4) |

Standard Reno's 0.5 cut is a "pass," not a "good" (87% < 93%): it throws away half the window on every loss and climbs back with only +1-per-RTT additive increase, so most of the run is spent below the pipe size rather than at it. Gentler backoff keeps the window closer to its working point after a loss, and goodput climbs steeply up to 0.75. Past that the goodput gain is basically gone (99% either way) while the queue cost keeps climbing — 0.75 is the last factor still inside the 5.0 queue budget, so it isn't just "gentler is better," it's specifically the edge of what R4 allows.
