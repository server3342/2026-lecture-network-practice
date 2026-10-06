#!/usr/bin/env python3
"""Week 6 · Task 3 — Reconverge without recomputing the world.

Textbook §5.2.1, §5.3.

A link flaps. Every router in the area has to decide what changed. `FullRecompute`
does the honest thing: throw the table away and run Dijkstra again, from scratch,
for every event. It is correct and it is what the first implementations did.

It is also why a single flapping link in a large area used to melt the CPU of
every router that could see it.

Beat it:

    python3 bench.py
    python3 bench.py --yours

Correctness first. `bench.py` compares your table against a full recompute after
**every single event**. A router that is fast and wrong black-holes traffic.
"""
import heapq

# The harness counts how many times you run a full SPF. This is the score:
# wall-clock time in Python says more about dictionary overhead than about
# routing, but "how many times did the CPU have to recompute the world" is
# exactly what melted real routers.
SPF_RUNS = 0


def dijkstra_table(graph, source):
    """Reference shortest-path-first. Returns {destination: first_hop}.

    Use THIS function whenever you need a full recompute. Rolling your own to
    dodge the counter is not an optimisation, it is cheating the meter.
    """
    global SPF_RUNS
    SPF_RUNS += 1
    best = {source: (0, None)}
    pq, done = [(0, source, None)], set()
    while pq:
        cost, node, first_hop = heapq.heappop(pq)
        if node in done:
            continue
        done.add(node)
        best[node] = (cost, first_hop)
        for nbr, w in sorted(graph[node].items()):
            if nbr in done:
                continue
            hop = nbr if node == source else first_hop
            if cost + w < best.get(nbr, (float("inf"), None))[0]:
                best[nbr] = (cost + w, hop)
                heapq.heappush(pq, (cost + w, nbr, hop))
    return {d: h for d, (_, h) in best.items() if d != source and h}


class FullRecompute:
    """On every event, forget everything and run SPF again."""

    def __init__(self, graph, source):
        self.graph = {n: dict(e) for n, e in graph.items()}
        self.source = source
        self.table = dijkstra_table(self.graph, source)

    def link_change(self, a, b, cost):
        """cost=None means the link went down."""
        if cost is None:
            self.graph[a].pop(b, None)
            self.graph[b].pop(a, None)
        else:
            self.graph[a][b] = cost
            self.graph[b][a] = cost
        self.table = dijkstra_table(self.graph, self.source)


class YourRouter:
    """Your router. Same two methods, same table, less work per event.

    What is actually true after one link changes:

      * most destinations are not affected at all
      * a link that is not on any of your shortest paths, going *up*, can only
        matter if it creates something shorter
      * a link going *down* only matters if you were using it

    Deciding which of those applies, cheaply, without getting it wrong, is the
    task. Getting it wrong is worse than being slow - the harness will catch it
    on the event where it happens.
    """

    # What is kept between events: dist[node], the cost of the shortest path
    # from source. dijkstra_table() breaks ties deterministically - a node
    # inherits the first hop of its tight predecessor with the smallest
    # (dist, name), because that is the order the heap pops them - so the
    # whole table is a function of dist and the graph. If an event leaves
    # dist alone, the table can be re-derived from it without SPF.

    def __init__(self, graph, source):
        self.graph = {n: dict(e) for n, e in graph.items()}
        self.source = source
        self._spf()

    def _spf(self):
        """Full recompute: the counted SPF for the table, plus the distances.

        dijkstra_table() throws its costs away, so they are rebuilt here in
        the same breath. This runs only alongside a counted SPF, never
        instead of one.
        """
        self.table = dijkstra_table(self.graph, self.source)
        dist = {self.source: 0}
        pq, done = [(0, self.source)], set()
        while pq:
            cost, node = heapq.heappop(pq)
            if node in done:
                continue
            done.add(node)
            for nbr, w in self.graph[node].items():
                if cost + w < dist.get(nbr, float("inf")):
                    dist[nbr] = cost + w
                    heapq.heappush(pq, (cost + w, nbr))
        self.dist = dist
        self.order = sorted(dist, key=lambda n: (dist[n], n))

    def _improve(self, start, cost):
        """A link got cheaper and `start` is now reachable for `cost`.

        Distances can only fall, so push the improvement outward and stop at
        every node it does not beat. Nodes it never reaches are not touched -
        this is the part of the area that did not need SPF.
        """
        dist = self.dist
        dist[start] = cost
        pq = [(cost, start)]
        while pq:
            c, node = heapq.heappop(pq)
            if c > dist[node]:
                continue
            for nbr, w in self.graph[node].items():
                if c + w < dist.get(nbr, float("inf")):
                    dist[nbr] = c + w
                    heapq.heappush(pq, (c + w, nbr))
        self.order = sorted(dist, key=lambda n: (dist[n], n))

    def _rederive(self):
        """Distances unchanged, tight edges changed: rebuild hops, no SPF."""
        dist, src, hop = self.dist, self.source, {}
        for d in self.order[1:]:
            p = min((q for q, w in self.graph[d].items()
                     if q in dist and dist[q] + w == dist[d]),
                    key=lambda q: (dist[q], q))
            hop[d] = d if p == src else hop[p]
        self.table = hop

    def _has_other_tight_pred(self, node, excluded):
        dist = self.dist
        return any(q != excluded and q in dist and dist[q] + w == dist[node]
                   for q, w in self.graph[node].items())

    def link_change(self, a, b, cost):
        """cost=None means the link went down."""
        inf = float("inf")
        old = self.graph[a].get(b)
        new = cost
        if old == new:
            return
        da, db = self.dist.get(a, inf), self.dist.get(b, inf)
        o = inf if old is None else old
        n = inf if new is None else new

        # Which direction of the link, if any, was / will be on a shortest path
        was_tight = [(x, y) for x, y, dx, dy in ((a, b, da, db), (b, a, db, da))
                     if dx < inf and dx + o == dy]
        will_tight = [(x, y) for x, y, dx, dy in ((a, b, da, db), (b, a, db, da))
                      if dx < inf and dx + n == dy]

        if new is None:
            self.graph[a].pop(b, None)
            self.graph[b].pop(a, None)
        else:
            self.graph[a][b] = new
            self.graph[b][a] = new

        if n < o:
            # up / cheaper: matters only if it makes something strictly shorter
            if da + n < db or db + n < da:
                if da + n < db:
                    self._improve(b, da + n)
                else:
                    self._improve(a, db + n)
                self._rederive()
                return
            dist_changed = False
        else:
            # down / dearer: matters only if a node loses its only tight way in
            dist_changed = any(not self._has_other_tight_pred(y, x)
                               for x, y in was_tight)

        if dist_changed:
            self._spf()
        elif was_tight or will_tight:
            self._rederive()            # same costs, different ties
        # else: the link was off every shortest path and stays off
