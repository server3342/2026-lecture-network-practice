#!/usr/bin/env python3
"""Week 3 · Task 3 — Beat the baseline cache.

Textbook §2.4.2 (caching) and §2.4.3 (TTL).

`BaselineCache` below works. It is also bad, in more than one way, and one of
its problems is worse than being slow. Find them, write `YourCache`, and prove
the improvement with the harness:

    python3 bench.py                 # baseline only
    python3 bench.py --yours         # baseline vs. yours, side by side

Rules
-----
* Do not change `bench.py`. If you need to change it to win, you are not
  winning. Say so in observation.md instead.
* `YourCache` must expose the same two methods as `BaselineCache`.
* Speed is not the only score. The harness also counts **stale answers** -
  times you served a record whose TTL had already run out. A cache that keeps
  everything forever is very fast and completely wrong.

Targets
-------
The baseline scores **325 upstream queries, 67.5% hit rate, 266 stale answers**.

  pass  : zero stale answers
  good  : zero stale, and no more upstream queries than the baseline
  strong: the above, plus you can say in observation.md **how few upstream
          queries a correct cache could possibly make on this workload, and
          why you cannot go below that number**

That last one is the real question. Read it before you start optimising -
it will tell you where to stop.
"""
import time


class BaselineCache:
    """A DNS cache that somebody wrote in a hurry.

    It caches. It is not correct, and it is not fast. Both are your problem.
    """

    FIXED_LIFETIME = 60          # seconds we keep anything, regardless of TTL

    def __init__(self, upstream):
        self.upstream = upstream  # upstream(name) -> (address, ttl)
        self.entries = []         # list of [name, address, stored_at]

    def lookup(self, name, now):
        """Return an address for `name`, asking upstream only if we have to."""
        for entry in self.entries:                      # linear scan
            if entry[0] == name:
                if now - entry[2] < self.FIXED_LIFETIME:
                    return entry[1]
                self.entries.remove(entry)
                break
        address, ttl = self.upstream(name)
        self.entries.append([name, address, now])
        return address

    def stats(self):
        return {"entries": len(self.entries)}


class YourCache:
    """Your cache.

    Same interface: __init__(upstream), lookup(name, now) -> address, stats().
    `upstream(name)` costs a network round trip and returns (address, ttl).
    The TTL is in seconds and it is the authoritative answer's own TTL -
    the baseline throws it away.

    The baseline has one root cause with two symptoms: it keeps every record for
    a fixed 60 s instead of for the TTL the record came with. A 20 s record is
    then served for 40 s after it expired (correctness); a 24 h record is
    thrown away and re-fetched every minute (performance). Its linear scan is a
    third, smaller problem: it changes the cost of a lookup, not the number of
    upstream queries.

    The fix is to store *when the answer stops being valid* and nothing else.
    """

    def __init__(self, upstream):
        self.upstream = upstream
        self.entries = {}                # name -> (address, valid until)
        self.hits = self.misses = 0

    def lookup(self, name, now):
        entry = self.entries.get(name)
        if entry is not None and now < entry[1]:     # strict: at expiry it is gone
            self.hits += 1
            return entry[0]
        self.misses += 1
        address, ttl = self.upstream(name)
        # The clock starts when we ASKED, not when the reply landed. The reply
        # arrives later, so this can only expire early - never late.
        if ttl > 0:
            self.entries[name] = (address, now + ttl)
        else:
            self.entries.pop(name, None)             # TTL 0: do not keep it
        return address

    def stats(self):
        return {"entries": len(self.entries), "hits": self.hits,
                "misses": self.misses}


def floor():
    """Fewest upstream queries ANY correct cache can make on the bench workload.

    A fetch made at time t is valid for exactly [t, t + ttl). A query that lands
    outside every window already fetched for its name must be answered by a new
    fetch, and that fetch cannot be made in the future. Making it any earlier
    than the query only ends its window earlier. So the best schedule is: fetch
    at the first uncovered query, and again at the next one that lands after the
    window closes. That is the classic greedy interval cover, and it is optimal.

    It is set by the workload and the TTLs. It is not set by the data structure,
    and no cleverness gets under it without serving an expired record.
    """
    import bench
    valid_until, count = {}, 0
    for t, name in bench.workload():
        if t >= valid_until.get(name, float("-inf")):
            count += 1
            valid_until[name] = t + bench.FIXTURE[name][1]
    return count


def per_name(cache_cls):
    """Replays the bench workload and counts, per name, upstream queries and
    stale answers - using the same rule as bench.run(). Read-only."""
    import bench
    from collections import Counter
    up = bench.Upstream()
    up.now = 0.0
    cache = cache_cls(up)
    asked, stale, fresh_until = Counter(), Counter(), {}
    for t, name in bench.workload():
        up.now, before = t, up.calls
        cache.lookup(name, t)
        if up.calls > before:
            asked[name] += 1
            fresh_until[name] = t + bench.FIXTURE[name][1]
        elif t > fresh_until.get(name, -1):
            stale[name] += 1
    return asked, stale


if __name__ == "__main__":
    import bench
    from collections import Counter
    b_asked, b_stale = per_name(BaselineCache)
    y_asked, y_stale = per_name(YourCache)
    seen = Counter(name for _, name in bench.workload())
    print(f"\n  {'name':<20}{'ttl':>7}{'queries':>9}{'baseline':>10}{'stale':>7}"
          f"{'yours':>7}{'stale':>7}")
    for name, (_, ttl) in bench.FIXTURE.items():
        print(f"  {name:<20}{ttl:>7}{seen[name]:>9}{b_asked[name]:>10}"
              f"{b_stale[name]:>7}{y_asked[name]:>7}{y_stale[name]:>7}")
    print(f"\n  {'total':<20}{'':>7}{sum(seen.values()):>9}{sum(b_asked.values()):>10}"
          f"{sum(b_stale.values()):>7}{sum(y_asked.values()):>7}"
          f"{sum(y_stale.values()):>7}")
    print(f"\n  floor: {floor()} upstream queries - no correct cache can make fewer\n")
