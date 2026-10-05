# Week 4 · detailed observations

The short version is in `observation.md`. This file has the numbers and the reasoning behind each line.

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
