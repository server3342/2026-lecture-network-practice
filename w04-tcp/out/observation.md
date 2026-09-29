# Week 4 · observation

## 요약 (태스크별 2–3줄, 이론 연결)

- **Task 1 · 신뢰적 전송 (§3.4 rdt, §3.5 순번).** 손실 10%, 중복 3%, 재정렬이 있는 채널 위에 selective repeat(윈도우 8, 패킷별 ACK와 타이머, 수신 측 버퍼)를 만들었습니다. 중복 데이터는 다시 ACK하되 두 번 이어 붙이면 안 되고, 손실이 가장 먼저 깨졌습니다. 250개 패킷을 보내는 데 326개가 필요했습니다(1.3배).
- **Task 2 · 링크 측정 (§3.5 핸드셰이크, §3.7 처리량).** SYN의 ISN은 0이 아니고 양쪽이 서로 다릅니다(예측 불가능하게 고르는 이유는 위조와 옛 세그먼트 혼입 방지). 수신 윈도우는 4.6 MB까지 열렸지만 실제 전송 중인 양은 약 193 KB였고, 제한 요인은 혼잡 윈도우(slow start)와 링크 자체였습니다. 캠퍼스 178.8 Mbps(핸드셰이크 7.5 ms)와 핫스팟 57.8 Mbps(38.1 ms)로, RTT가 길수록 윈도우가 채워지는 시간이 길어져 처리량이 낮아집니다.
- **Task 3 · 혼잡 제어 (§3.7).** 고정 윈도우 64는 처리량이 가장 높지만 패킷의 37%를 버리고 큐를 8.8로 채워 다른 흐름을 해칩니다(혼잡 붕괴 방식). slow start 후 AIMD(감소 ×0.5, 증가 0.25/RTT)로 윈도우가 파이프 크기 20 근처인 15~30을 오가게 해서 처리량 96%, 손실 2.0%, 큐 4.1을 얻었습니다. 감소를 ×0.7 이상으로 완만하게 하면 처리량은 99%까지 오르지만 큐가 5.6 이상, 손실이 4% 이상으로 조건을 어깁니다.

---

## 상세 (실측값과 근거)

**Task 1 — reliable delivery.**
I chose selective repeat (window 8, one ACK per packet, a timer per packet, 40-step timeout, receiver buffers
out-of-order packets). Stop-and-wait would also pass; the case that made me pick a window was that with 10 %
loss and a timeout each lost packet would idle the whole channel for a timeout. The one case that forced the
receiver's design was duplication: a duplicate *data* packet must be re-ACKed (its first ACK may have been the
lost one) but must not be appended twice, and a duplicate *ACK* must just be ignored — they fail differently.
For 2,000 bytes = 250 packets of 8 bytes the data channel carried 326 packets (1.30× the minimum; 42 lost, 13
duplicated) and the ACK channel another 297, so 623 packets crossed the network for 250 that mattered. To answer
"what breaks first" I tried a receiver that just appends what arrives: it is wrong at the 4th packet (the first
loss is the 2nd packet sent), whereas the first duplicate only appears at the 9th send. **Loss breaks first**,
then duplication, then reordering. It also passes seeds 1, 2, 3, 7, 42 and 999.

**Task 2 — my own link.** (packet numbers are from `out/tcp.pcapng`, stream 0, campus Wi-Fi)
- **A2:** SYN **#1**, SYN-ACK **#2**, ACK **#3** (client port → server `443`).
- **A3:** client ISN `1111356914`, server ISN `3798358670`. Neither is 0 and they differ, because the ISN is
  chosen unpredictably (per connection): a predictable one lets an off-path attacker forge segments, and a
  fixed 0 would let old segments from an earlier connection on the same 4-tuple be mistaken for new data.
  The ACK in #2 is `1111356915` = client ISN + 1: the SYN uses one sequence number.
- **A4:** SYN options: MSS 1460, SACK permitted, timestamps, **window scale 10** (×1024). SYN-ACK: MSS **1250**
  (the path/server side is smaller), window scale **13** (×8192), SACK permitted.
- **A5:** the SYN's own window field is 64,240 (never scaled in a SYN). After the handshake the client's
  window is 63 × 1024 = 64,512 and it grows to about **4.6 MB** during the transfer. The most the server ever
  had in flight in that stream was **≈193 KB**, so the receive window was never the limit. What limited it was
  the sender's congestion window: the whole 5 MB took 0.153 s, about 17 round trips of 9 ms, most of it spent
  ramping up in slow start. The bandwidth-delay product at ~179 Mbps × 7.5 ms is ≈ 168 KB, which is the same
  order as that 193 KB.
- **B3 (medians, 5 runs each):** campus Wi-Fi **178.8 Mbps**, range 116.7–273.8 (spread 88 %), handshake median
  **7.5 ms**; phone hotspot (KT LTE) **57.8 Mbps**, range 51.0–67.6 (spread 29 %), handshake median **38.1 ms**.
  Only the campus run was captured; the hotspot run was measured with `curl` alone. On campus the laptop had no
  global IPv6 address, so that was IPv4; on the hotspot I checked afterwards and curl connected to the server's
  **IPv6** address, so the two labels differ in IP version as well as in link (an IPv6 path avoids the carrier's NAT).
- **B4 spread:** each run is a new TCP connection with a 5 MB transfer of only 0.15–0.3 s on campus, so it is
  dominated by slow start and by whatever else the Wi-Fi and the server were doing at that moment (time to
  first byte varied 48–214 ms). The LTE link is the bottleneck for the whole transfer, so it is steadier.
- **B5:** with about 5× the handshake time (≈ RTT) the hotspot's window takes 5× longer wall-clock to reach the
  pipe size (slow start doubles once per RTT), and throughput of a window-limited flow is window ÷ RTT — so a
  worse RTT lowers throughput even at equal raw capacity. The two are not independent; here the hotspot is also
  simply slower, so I cannot separate the two effects with this data.

**Task 3 — congestion control.**
R5: the baseline's goodput is highest because keeping 64 packets in flight keeps the link busy every slot, but it
does so by sending 37 % of its packets into a full queue to be dropped (2,340 retransmissions) and holding the
queue at 8.8 of 10, so every other flow through that link sees a permanent queue delay and loses packets too.
Goodput counts only what arrives; it does not count the harm to others. If everyone behaved this way the
link would spend its capacity on retransmissions — congestion collapse. My window converges to a sawtooth
between about 15 and 30 with a mean of about 24 (measured from the window trace after the initial ramp), against a pipe of 20
(RTT 20 slots × 1 packet/slot) plus a 10-packet queue that overflows beyond ~30: it lives a few packets above the pipe,
so the queue stays short. Result: 946 goodput (96 % of the baseline, "strong"), 2.0 % loss, queue 4.1. Backing off more
gently, measured on this same controller by changing only the backoff factor: ×0.7 gives 98.7 % goodput but loss 4.0 %
and queue 5.6 (queue limit fails); ×0.8 gives 99.1 %, loss 6.6 %, queue 7.1 (loss and queue both fail); ×0.9 gives 99.1 %,
loss 14.9 %, queue 8.4 (mean window 35: it sits in the queue). Gentler backoff buys the last 3 % of goodput with other flows' delay.
