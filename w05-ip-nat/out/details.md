# Week 5 · detailed observations

The short version is in `observation.md`. This file has the numbers and the reasoning behind each line.

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
