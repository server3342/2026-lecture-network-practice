#!/usr/bin/env python3
"""Week 7 · Task 3 — A switch that runs out of room.

Textbook §6.4.3.

A switch does not have room for every station on the network. Its forwarding
table sits in a fixed amount of fast memory, and when that fills, something has
to go. Whatever goes gets **flooded** the next time anyone sends to it - out of
every port, to every station that did not ask for it.

`NaiveSwitch` handles a full table the simplest way: throw out whichever entry
has been there longest. That is a perfectly reasonable first idea and it is
close to the worst thing you can do with this traffic.

    python3 bench.py
    python3 bench.py --yours

Correctness first: every frame whose destination is reachable must still reach
it. A switch that floods less because it delivers less is not a switch.
"""
import hashlib
from collections import OrderedDict


class NaiveSwitch:
    """Correct. Evicts the oldest entry, which is not the least useful one."""

    BROADCAST = "ff:ff:ff:ff:ff:ff"

    def __init__(self, ports, capacity):
        self.ports = ports
        self.capacity = capacity
        self.table = OrderedDict()                 # mac -> port, insertion order

    def handle(self, frame, in_port):
        src, dst, now = frame
        if src not in self.table and len(self.table) >= self.capacity:
            self.table.popitem(last=False)         # throw out the oldest arrival
        self.table[src] = in_port

        if dst == self.BROADCAST or dst not in self.table:
            return [p for p in range(self.ports) if p != in_port]
        out = self.table[dst]
        return [] if out == in_port else [out]


class YourSwitch:
    """Your switch. Same interface, same deliveries, far less flooding.

        __init__(ports, capacity)
        handle((src, dst, time), in_port) -> ports to forward out of

    `self.table` must exist and must never hold more than `capacity` entries.
    The harness checks this after every frame.

    What the baseline gets wrong: it decides what to keep by **when the entry
    arrived**, and that has nothing to do with whether it is about to be needed.
    On this trace a handful of stations carry most of the traffic, and the
    baseline keeps throwing them out to make room for stations that spoke once.

    Two questions worth separating:

      * which entry should leave when the table is full?
      * should learning a new source ever be *declined*?

    The second one is less obvious and is worth thinking about before you
    dismiss it.

    Note what you are NOT allowed to do: you cannot look at `where`, you cannot
    see the future, and you cannot hold more than `capacity` entries. Everything
    you know comes from the frames you have already handled.
    """

    BROADCAST = "ff:ff:ff:ff:ff:ff"

    # Evidence kept: how often each MAC has been seen, as source or as unicast
    # destination, in a count-min sketch - ROWS x WIDTH small counters, fixed
    # size no matter how many MACs show up. A per-MAC counter would be exact,
    # but it grows with every address anyone invents, which is the very thing
    # the table is too small for. Each row hashes independently (blake2b with
    # the row as part of the key); CRC with different seeds is not enough,
    # since on equal-length input it only XORs a constant and every row then
    # collides the same way.
    #
    # Eviction: the table entry with the smallest estimate leaves.
    # Admission: a new source gets in only if it is seen more often than that
    # victim. Otherwise learning is declined and the table stays as it is;
    # frames to it are flooded, which is what would have happened anyway once
    # it was evicted again.
    # Every HALVE_EVERY counted sightings all counters are halved, so a station
    # that was busy an hour ago does not hold its place forever.

    ROWS, WIDTH, HALVE_EVERY = 4, 256, 20_000

    def __init__(self, ports, capacity):
        self.ports = ports
        self.capacity = capacity
        self.table = {}                            # mac -> port
        self.sketch = [[0] * self.WIDTH for _ in range(self.ROWS)]
        self.counted = 0
        self.declined = 0

    def _slots(self, mac):
        d = hashlib.blake2b(mac.encode(), digest_size=8 * self.ROWS).digest()
        return [int.from_bytes(d[8 * r:8 * r + 8], "big") % self.WIDTH
                for r in range(self.ROWS)]

    def _count(self, mac):
        for row, i in zip(self.sketch, self._slots(mac)):
            row[i] += 1
        self.counted += 1
        if self.counted >= self.HALVE_EVERY:
            self.counted = 0
            self.sketch = [[c >> 1 for c in row] for row in self.sketch]

    def _estimate(self, mac):
        return min(row[i] for row, i in zip(self.sketch, self._slots(mac)))

    def handle(self, frame, in_port):
        src, dst, now = frame
        self._count(src)
        if dst != self.BROADCAST:
            self._count(dst)                       # demand is what an entry is for

        if src in self.table:
            self.table[src] = in_port              # refresh, or follow a move
        elif len(self.table) < self.capacity:
            self.table[src] = in_port
        else:
            victim = min(self.table, key=self._estimate)
            if self._estimate(victim) < self._estimate(src):
                del self.table[victim]
                self.table[src] = in_port
            else:
                self.declined += 1

        if dst == self.BROADCAST or dst not in self.table:
            return [p for p in range(self.ports) if p != in_port]
        out = self.table[dst]
        return [] if out == in_port else [out]
