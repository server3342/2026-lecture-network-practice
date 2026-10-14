# Week 7 · detailed observations

The short version is in `observation.md`. This file has the numbers and the reasoning behind each line.
The Task 3 run is in `bench.txt`.

**Task 1 — the learning switch.**
Each entry is `mac -> (port, last_seen)`. Learning overwrites both fields, so a station that moves is believed on
the next frame it sends (R3), and a station that keeps talking keeps its entry fresh. Aging (R4) reads the same
timestamp the other way: on every `handle()` and every `table()` call, entries with `last_seen < now - 300` are
deleted. The switch's clock is the newest frame time it has seen; it has no other. The broadcast address is never
learned as a source. A known destination behind the arrival port returns `[]`: that segment already heard the frame.
`--verify` passes all seven checks.

**Task 2 — the ARP table, emptied and refilled.**
Measured 2026-10-13 ~13:10 KST on campus Wi-Fi (`wlp0s20f3`, `172.16.19.21/24`, gateway `172.16.19.1`). Tailscale
was up; it is a NOARP point-to-point interface, so it never appears in the neighbour table. Linux has no `arp`
command here, so the tables are `ip neigh show dev wlp0s20f3`. The table was flushed with `ip neigh flush`, then I
pinged the gateway and fetched `https://www.korea.ac.kr`. MACs other than the gateway's virtual MAC were masked
with `mask.py` (my MAC → `f8:cf:52:00:00:01`).
- *before:* `172.16.19.1 REACHABLE` and `172.16.0.7 STALE` (last used about 1,028 s earlier). `172.16.0.7` is outside
  my /24, is not the DHCP server (`dhcp_server_identifier = 192.168.98.23`), and is not a next hop for anything I
  sent, so it did not come back after the flush. Where it came from is not visible in my data.
- *after:* only `172.16.19.1 REACHABLE`. Every destination off the /24 (the DNS servers `163.152.213.9` and
  `168.126.63.1`, and the web server `163.152.6.10`) is reached through the gateway, so the gateway is the one
  neighbour all of it needs.
- *capture* (`arp.pcapng`, `tcpdump arp` for 70 s):

| t (s) | eth src → dst | op | sender | target |
|---:|---|---|---|---|
| 0.000 | `f8:cf:52:00:00:01` → `ff:ff:ff:ff:ff:ff` | request | 172.16.19.21 | `00:00:00:00:00:00` / 172.16.19.1 |
| 0.088 | `00:00:0c:07:ac:fa` → `f8:cf:52:00:00:01` | reply | 172.16.19.1 | `f8:cf:52:00:00:01` / 172.16.19.21 |

  The request's target hardware address is all zeros, because that is the unknown being asked for. The reply is
  60 bytes against the request's 42, because the router pads to the Ethernet minimum and my own outgoing frame is
  captured before padding. `00:00:0c:07:ac:xx` is the reserved HSRP v1 virtual MAC range (group 0xfa = 250). The first ping took 90.6 ms against 1.9–3.2 ms for the next two,
  which is the 88 ms ARP wait.
- *B4:* those two frames were the only ARP in 70 s. No other station's ARP request was captured, and my machine sent
  none after the one I caused. Scaling: at one broadcast per host per minute, a /24 means about 254 frames/min for
  every host, which is harmless. A flat /16 means about 65,000/min, roughly 1,000/s that every host's CPU must look
  at. On Wi-Fi, broadcasts also go out at the lowest basic rate with no ACK.

**Task 3 — what to keep in 64 entries.**
In this bench, flooding a unicast frame wastes 46 deliveries and a hit wastes none, so the score is almost exactly
46 × (unicast table misses). Only the destination lookups count, and a station's value is how often it is a
**destination**. The trace draws sources and destinations from the same Zipf weights, so I count both.

| policy (same trace, capacity 64) | wasted | cut |
|---|---:|---:|
| baseline: evict oldest arrival (FIFO) | 323,380 | — |
| LRU: evict least recently seen | 218,500 | 32.4% |
| LFU, counts only for entries in the table (dropped on eviction) | 187,772 | 41.9% |
| LFU, exact counter per MAC ever seen (unbounded memory) | 156,998 | 51.5% |
| **sketch 4×256, evict min, decline if newcomer ≤ victim, halve every 20k** | **159,712** | **50.6%** |
| same sketch, never decline | 161,506 | 50.1% |
| static top-64 by true destination count (future knowledge), approx. | ~152,000 | ~53% |

- *Why not exact per-MAC counters:* they are the best number in the table, but their memory grows with every MAC
  address that appears, including made-up ones. The point of the task is that the switch has fixed memory. The
  count-min sketch is 1,024 small counters regardless of input, and on this trace it loses 0.9 points against exact counts.
- *Sketch width matters more than depth:* 1×256 → 25.8%, 4×64 → 39.4%, 4×128 → 46.5%, 4×256 → 50.8%, 4×1024 →
  51.4% (no halving). With only 64 counters per row, the 400 stations collide too much to rank them.
- *A hashing mistake I made first:* rows built from `crc32(mac, seed_i)` collided identically. CRC is affine, so for
  equal-length inputs a different seed only XORs a constant, and row *i* is a relabelling of row 0. Depth 2 and depth
  4 gave identical numbers. Independent rows (blake2b, one 8-byte slice per row) fixed it.
- *Halving:* every 20,000 counted sightings, every counter is shifted right by one. On this stationary trace that
  costs about 0.5 points (no halving 50.8%, every 2,000 → 48.8%). I kept it because without it a station that was
  busy last week holds its entry forever, and a sketch that only grows also saturates.
- *Declining admission:* 3,599 newcomers were turned away. The honest trace barely needs it (+0.5 points), because
  with frequency eviction a station that spoke once is already the next victim. It costs at most one flood per
  declined station, and it is what protects the table under attack.

**R6 — MAC flooding, measured.**
I added one frame from a fresh random source MAC (`02:...`, locally administered) on port 0 after every second frame
from frame 20,000 onwards (about 14,500 forged MACs) and scored only the legitimate unicast frames:

| | wasted (legitimate traffic) |
|---|---:|
| baseline | 508,254 |
| mine | 172,684 |

For the baseline, every forged frame pushes a real station out, so after a few dozen forged frames the table holds
nothing but forged MACs. Every real frame is then flooded to every port, including the attacker's: the switch
behaves like a hub and the attacker reads everyone's unicast traffic. Mine declines each forged MAC, since it has
been seen once and every resident has been seen more. Limits: an attacker who repeats each forged MAC a few dozen
times can outscore the tail of the table, and sketch collisions can inflate a newcomer's count. A real switch adds
**port security**: a cap on learned MACs per port, after which that port stops learning, drops unknown sources, or
is shut down. 802.1X goes further by authenticating the device before any of its MACs is learned.
