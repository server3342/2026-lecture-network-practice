# Week 6 · detailed observations

The short version is in `observation.md`. This file has the numbers and the reasoning behind each line.
Raw per-router timings are in `reconverge.txt`, and the tables are in `route-before.txt`, `route-after.txt` and `cost-change.txt`.

**Task 1 — link state by hand.**
`dijkstra()` is a plain heap Dijkstra. `forwarding_table()` does not rebuild paths. Each heap entry carries
`(cost, first_hop, node)`; a neighbour of the source gets itself as first hop, and every other node inherits its
predecessor's. **Tie rule:** a node's entry is replaced only by a strictly smaller `(cost, first_hop)` tuple, so on
equal cost the first hop with the **smallest name** wins. That is deterministic: every run, and every router, installs
the same single next hop. A real OSPF router does not pick one. It installs **all** equal-cost next hops (ECMP, up
to `maximum-paths`) and hashes each flow onto one, so traffic is split while a single flow stays on one path (no
reordering). The FRR routers in Task 2 did exactly this: `172.20.0.0/16 via 172.18.0.3, eth1` *and* `via 172.21.0.3, eth0`.
- `u`'s next hop for `w` is `x`: `u-x-y-w` costs 1+1+1 = 3 against 5 for the direct `u-w` link. Using the `w`
  interface would be adjacency, not routing.
- After `u-x` fails, the costs from `u` become `v 2, x 4, w 5, y 5, z 7`. Every destination that went through `x`
  (`x, w, y, z`) now leaves via `v`. Only `v` keeps its hop. `w` is an actual tie after the cut (direct `u-w` = 5,
  `u-v-w` = 2+3 = 5). My rule chooses `v` because `"v" < "w"`. An ECMP router would use both.

**Task 2 — Part A, somebody else's routing.**
Measured 2026-10-06 ~13:00 KST on campus Wi-Fi, with WARP off and Tailscale up but no exit node. I checked that the
public egress is campus `163.152.x` and that Cloudflare's trace says `warp=off, colo=ICN`. traceroute 2.1.5 ran from the
lab image with `--network host`, so the container adds no bridge hop. Two of the suggested targets do not do what the
task needs, so I swapped them and kept them as reference:
- `www.korea.ac.kr` is `163.152.6.10`, which is our own university, so the path never leaves campus. I used
  `www.snu.ac.kr` (AS9488) as the domestic target.
- `www.stanford.edu` is `3.33.186.135`, an **AWS Global Accelerator anycast** address, so it is not a single overseas
  host. I used `mirrors.mit.edu` (18.7.29.125, Boston).

*A2 — leaving campus:* hop 3 `163.152.233.129` is the last campus hop, and hop 4 `175.121.235.141` is
**SK Broadband (AS9318)**, the first hop outside. All three off-campus paths leave there. Even the on-campus
`korea.ac.kr` path goes through `163.152.205.206`, a KU /24 that SK Broadband originates (looked up via RIPEstat).
That is probably the leased link between the two campuses, at +6 ms (inference).

*A3 — the ocean:* on the MIT path, hop 7 `10.222.10.159` answers in about 10 ms and hop 8 `10.222.1.91` in about
**124 ms**. One hop adds +114 ms, and every other hop adds 0–8 ms. Hop 10 is `be2.core1.sea1.he.net` (Hurricane
Electric, **Seattle**, 127 ms), and hop 13 `core2.bos2.he.net` (Boston, 182 ms) adds the US continental crossing
(+55 ms). So the Pacific is crossed inside SK Broadband's network, between hops 7 and 8. Those hops are private 10.x
addresses with no hostnames, so the trace cannot name the cable. The US Pacific Northwest landing points to one of the
Korea–Oregon systems (NCP or TPE), with HE's Seattle node as the first named hop after landing. That is an
inference, not something the trace shows.

*A4 — anycast:* the UDP run reached `one.one.one.one` in **13 hops** at about **12 ms**. Hop 12, `141.101.82.x`, is
Cloudflare AS13335 at about 6–17 ms. The path goes SK Broadband → DREAMLINE (AS9457) → Cloudflare. 13 hops looks
"far", but 12 ms cannot leave Korea: Tokyo would be at least 30 ms. The `colo=ICN` in Cloudflare's trace confirms that
the replica is in Seoul/Incheon. With anycast the hop count reflects the ISP's peering arrangement. The RTT tells you
where the server is.

*A5 — `* * *`, two different problems:*
1. **The router forwards but does not answer.** It does not send ICMP Time Exceeded, or rate-limits or filters it,
   which is common for private-address (10.x) core hops. The proof is that later hops answer again: SNU hops 6–9 are
   silent but hop 10 replies, and MIT hops 9, 11 and 12 are silent between named hops.
2. **The probes are dropped from some point on.** That is a firewall at or near the destination, or a destination
   that does not answer that probe type. Nothing beyond that point ever answers: SNU after hop 11, korea.ac.kr after
   hop 7, MIT after hop 17 (inside MIT). The probe type matters too. For 1.1.1.1, UDP reached the destination but ICMP
   echo stopped answering after hop 12, and the UDP run to the Stanford anycast died at hop 8.

**Task 2 — Part B/C, our own OSPF area.**
Setup notes. Each of these changes what the measurement means:
- `frrouting/frr:v9.1.0` does not exist on Docker Hub. I pulled the official `quay.io/frrouting/frr:9.1.0` and tagged it
  locally under the name `compose.yml` expects. The version is the same, and the repo is unchanged.
- Docker attached the networks to r1 in a different order than `frr.conf`'s descriptions say. r1 `eth0` is net_b
  (to r2) and r1 `eth1` is net_a (to r3). So `ip link set eth1 down` on r1 cuts **r1–r3**, not r1–r2 as
  `scenario.sh` prints. The headers of `route-*.txt` give the real mapping.
- I did not use `scenario.sh cut` for the timing. It compares the raw `show ip route ospf` text, which includes an
  uptime column (`00:00:49`) that changes every second, so it would report "reconverged in 1 s" whether or not any
  route moved. It also watches only r1. Instead I polled all three routers in parallel, about every 0.25 s, with the
  uptime stripped, and logged each table and neighbour change with a timestamp. The resolution is one poll cycle.
- Timers: Hello 10 s, Dead 40 s, Wait 40 s. `frr.conf` sets none, so these are the defaults. All costs are 10.

*B2:* every router learned the one subnet it is **not** attached to, as an OSPF route of cost 20 through **two** equal
next hops: r1 learned 172.20/16 (net_c), r2 learned 172.18/16 (net_a), and r3 learned 172.21/16 (net_b).

*B4 — cutting the link (4 runs):* every router's table was right again **within one poll, < 0.4 s**:
r1 +0.07…+0.32, r2 +0.06…+0.28, r3 +0.03…+0.28. That is **not** governed by the hello/dead intervals. `ip link set
down` drops the carrier on r1, so r1 learns of the failure locally and immediately, re-originates its router-LSA and
floods it to r3 through r2. r3 never saw a carrier change, and it kept listing r1 as a `Full` neighbour for another
**32–39 s**. That is the dead interval. But r3's SPF already ignores the r1–net_a link, because the two-way check fails:
r1's new LSA no longer lists net_a. So the config's timers explain the neighbour state, not the route change.
To see the timers govern the routes, I ran one **silent failure**: `tc netem loss 100%` on both ends, so the
interfaces stay up but nothing gets through. Now nobody learns anything until the dead timer fires. Routes moved at
**+37.9 to +38.1 s** on all three routers, and the neighbours were dropped at +37.7 s (r3) and +38.6 s (r1). That fits
Dead 40 s minus the 0–10 s since the last hello. During those 38 s, the flows ECMP had hashed onto the r1–r3 link
were black-holed.

*B5 — restoring (3 runs):* the whole area was right again only after **18.0, 11.9 and 6.2 s**. That is 20–60× slower
than the cut, and the times vary a lot. A neighbour that disappears is noticed by one event: the carrier drops, or
the dead timer fires. A neighbour that comes back has to build an adjacency step by step. Each side must first see a
hello that lists itself (2-Way). The next hello can be up to 10 s away, which is why the runs differ (Full at +8.4,
+6.6 and +5.8 s). Then the routers exchange database descriptions, request and load the LSAs they are missing
(Loading → Full), re-originate the router-LSA and network-LSA, flood them, and only then run SPF. r2 regained ECMP
at +0.3 s, because r1 immediately advertised net_a as a stub (it is directly attached) and that needs no adjacency.
In runs 1 and 2, r3 changed its route 5–10 s *after* reaching Full. LSA ages and `show ip ospf` put r3's last SPF at
the same moment as its route change, so the wait is between LSA arrival and SPF. Likely causes are the MinLSInterval
(5 s) on re-origination and the SPF throttle. I tried to confirm this with `debug ospf`, but FRR could not open the log
file, so it remains unconfirmed.

*C — changing a cost:* raising r1 `eth0` (r1–r2) from 10 to 100 moved r1's path to net_c onto r3 only, and r3's path to
net_b onto r2 only (ECMP → single path). It took **+0.27 s and +0.23 s**, and setting it back took +0.22 s and +0.29 s.
r2's table did not change, and that is correct: OSPF cost belongs to the *outgoing* interface, and r2's path to net_a
via r1 leaves r1 by `eth1`, whose cost did not change. *C3:* a cost change is a configuration act on a live router.
The router that changes knows immediately, and the new LSA floods over adjacencies that are all still up, so the
total time is flood plus SPF. A failure first has to be **noticed**: instantly if the carrier drops, after 30–40 s if
it fails silently, and a repair waits for a full adjacency build. The routing algorithm is fast. Detecting the
change is what costs seconds, and that is why real networks add BFD (sub-second hellos) on top of OSPF.

**Task 3 — reconverge without recomputing the world.**
Between events I keep `dist` (the shortest-path cost from the source to every reachable node) and the nodes sorted by
`(dist, name)`. That costs two extra entries per router, about 400 numbers here, which is O(V) and small next to the
graph copy both versions already hold. The key observation: `dijkstra_table()`'s output is fully determined by `dist`.
A node inherits the first hop of its *tight* predecessor (`dist[p] + w == dist[d]`) with the smallest `(dist, name)`,
because that is the order the heap pops nodes in. So:
- **Link down / dearer, not on any shortest path** (not tight either way): nothing changes, so I skip (293 downs
  and 139 dearer events took no SPF).
- **Down / dearer on a tight edge, but the far end has another equal-cost way in:** distances are unchanged. Only the
  tie-break can move, so I re-derive the hops from `dist` without running SPF.
- **Down / dearer, and the far end loses its only shortest way in:** distances grow for a subtree I do not track.
  That is a **full SPF** through `dijkstra_table()`. These are the 176 SPF runs left.
- **Up / cheaper:** if `dist[a] + c >= dist[b]` in both directions, nothing gets shorter, so I skip, or re-derive the
  hops when the result is an exact tie. If it *is* shorter, distances can only fall. I push the improvement outward
  from the improved end and stop at every node it does not beat (`_improve`), then re-derive the hops. Across the 115
  such events this touched a median of **1 node** and at most 33 out of 400.

Result: **177 SPF runs instead of 1,001 (82% avoided), table correct after all 1,000 events**. On bench seeds 1–8
it also avoids 82–84% with 0 wrong. Two judgement calls I want to be explicit about:
- `_improve` is a bounded relaxation, the "partial/incremental SPF" real routers run. It never visits a node whose
  distance does not improve, but the meter does not count it. If it counted as a full SPF, the score would be 292
  runs (71%, "good").
- `dijkstra_table()` throws its costs away, so `_spf()` rebuilds `dist` in the same breath. That pass runs only
  next to a counted SPF, never instead of one.

*R5 — wall time:* `bench.txt` shows mine at 2.1 s against 1.4 s, but the harness times the "yours" run *including*
its own correctness check, which is a full `dijkstra_table()` after every event. Timed without the check, my router
takes **0.7 s against 1.4–1.75 s**. Per event it pays an O(E) pass (re-deriving the hops: 0.5 ms against 1.5 ms for
one SPF), plus a second pass whenever it does run SPF. In Python each of those is dictionary and interpreter
overhead, so the gap is small, and on a smaller area or with a different event mix it could go the other way. On a
router it would still be the right choice. The scarce resource there is **control-plane CPU**, which also has to keep
sending hellos, flooding LSAs and running BGP. A full SPF runs on *every* router in the area for *every* flap, and its
cost grows with the area (E log V), while most events change nothing. Every SPF also triggers a FIB re-download to the
forwarding hardware. A busy CPU misses hellos, adjacencies drop, and that causes more flaps. Memory for one cost per
node is cheap. Recomputing the world on every flap is what pinned router CPUs, and the comparisons that let you skip
it are cheap in C.
