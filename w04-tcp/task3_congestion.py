#!/usr/bin/env python3
"""Week 4 · Task 3 — Beat the fixed window.

Textbook §3.7.

`FixedWindow` is a sender that never adapts. It picks a window and keeps it,
forever, no matter what the network says back. It is not a strawman: it is what
you get if you skip congestion control entirely, and it was the internet's
actual failure mode in October 1986.

Write `YourControl` and beat it on the harness:

    python3 bench.py
    python3 bench.py --yours

The interface is two events and one number:

    .window        how many packets you are willing to have in flight
    .on_ack()      one packet made it there and back
    .on_loss()     a packet was dropped, or timed out waiting for its ACK

That is all the information a real TCP sender has. It cannot see the queue,
it cannot see the link rate, and neither can you. You infer them from these
two events, which is the entire idea of §3.7.
"""


class FixedWindow:
    """Send 64 packets at a time and never listen."""

    def __init__(self):
        self.window = 64

    def on_ack(self):
        pass

    def on_loss(self):
        pass


class YourControl:
    """Your congestion control.

    Things worth knowing before you start:

    * The link drains one packet per slot and the round trip is 20 slots, so
      the pipe holds about 20 packets. Above that you are only filling a queue.
    * The queue is 10 packets deep and drops from the tail. Filling it does not
      make you faster - it makes you slower, and everybody behind you too.
    * Cutting hard on every loss costs you throughput. Not cutting costs you
      correctness. §3.7 is the argument about where between those to sit.
    * You are allowed to grow differently before and after your first loss.
      That distinction has a name in the textbook.
    """

    BACKOFF = 0.5            # multiplicative decrease on a congestion event
    GROW = 0.25              # additive increase: GROW packets per round trip
    QUIET = 3                # acks (x window) during which further losses are ignored

    def __init__(self):
        self.window = 1.0
        self.slow_start = True      # before the first loss we do not know where the pipe ends
        self.quiet = 0              # acks still to come before another loss counts

    def on_ack(self):
        if self.quiet > 0:
            self.quiet -= 1
        if self.slow_start:
            self.window += 1        # +1 per ack = double per round trip
        else:
            self.window += self.GROW / self.window   # ~ +GROW per round trip

    def on_loss(self):
        # One queue overflow drops a burst, and the timeouts trickle in one by one.
        # That is one congestion event, so it earns one cut, not one per packet.
        if self.quiet > 0:
            return
        self.slow_start = False
        self.window = max(2.0, self.window * self.BACKOFF)
        self.quiet = int(self.window) * self.QUIET
