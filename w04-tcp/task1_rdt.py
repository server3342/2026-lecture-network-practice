#!/usr/bin/env python3
"""Week 4 · Task 1 — Build reliable delivery on top of an unreliable channel.

Textbook §3.4 (reliable data transfer) and §3.5 (TCP's sequence numbers).

`UnreliableChannel` below loses packets, reorders them, duplicates them, and
delays them. It is the network as §3.4 models it. Your job is to move a file
across it and have the bytes arrive intact and in order.

That is the whole of TCP's reliability story with the congestion control taken
out, and it is worth building once by hand before you ever trust a socket again.

    python3 task1_rdt.py --verify
"""
import argparse, hashlib, random

PAYLOAD = 8            # bytes per packet - small, so you see the sequencing


class UnreliableChannel:
    """Loses 10%, duplicates 3%, reorders, and delays. Deterministic by seed.

    You may not make it nicer. You may not read its internals. It is the only
    way your sender can reach your receiver.
    """

    def __init__(self, seed=246, loss=0.10, dup=0.03, reorder=0.10):
        self.rng = random.Random(seed)
        self.loss, self.dup, self.reorder = loss, dup, reorder
        self.wire = []          # packets in flight, in no particular order
        self.stats = {"sent": 0, "lost": 0, "duplicated": 0, "delivered": 0}

    def send(self, packet):
        """Hand a packet to the network. It may never come out."""
        self.stats["sent"] += 1
        if self.rng.random() < self.loss:
            self.stats["lost"] += 1
            return
        copies = 2 if self.rng.random() < self.dup else 1
        self.stats["duplicated"] += copies - 1
        for _ in range(copies):
            if self.rng.random() < self.reorder and self.wire:
                self.wire.insert(self.rng.randrange(len(self.wire)), packet)
            else:
                self.wire.append(packet)

    def receive(self):
        """Take the next packet out, or None if the network has nothing."""
        if not self.wire:
            return None
        self.stats["delivered"] += 1
        return self.wire.pop(0)


class Sender:
    """Your sender.

    Selective-repeat sliding window. A packet on the wire is `(seq, payload)`;
    an ACK on the wire is just `seq` (an int) - the receiver acks whatever it
    got, in order or not, so a lost ACK never blocks anything but its own seq.

    `base` is the oldest seq not yet acked - the left edge of the window. We
    are allowed `next_seq` up to `base + WINDOW`. Anything unacked that has sat
    longer than TIMEOUT gets resent on its own, independent of the others -
    that is the point of selective repeat over stop-and-wait: one loss does
    not stall the rest of the window.
    """

    WINDOW = 8
    TIMEOUT = 20   # in units of Sender.step() calls - generous, see task1.md

    def __init__(self, data_channel, ack_channel, data):
        self.dc, self.ac = data_channel, ack_channel
        self.chunks = [data[i:i + PAYLOAD] for i in range(0, len(data), PAYLOAD)]
        self.total = len(self.chunks)
        self.time = 0
        self.next_seq = 0
        self.acked = set()
        self.sent_at = {}   # seq -> time of its last (re)send, unacked only

    def _base(self):
        seq = 0
        while seq in self.acked:
            seq += 1
        return seq

    def step(self):
        """Do one unit of work. Return False when you believe you are done."""
        self.time += 1

        # drain every ACK the channel currently has for us
        while True:
            ack = self.ac.receive()
            if ack is None:
                break
            seq = ack
            if isinstance(seq, int) and 0 <= seq < self.total:
                self.acked.add(seq)
                self.sent_at.pop(seq, None)   # a dup ACK for an acked seq: no-op

        # anything unacked that has waited too long goes again
        for seq in list(self.sent_at):
            if self.time - self.sent_at[seq] >= self.TIMEOUT:
                self.dc.send((seq, self.chunks[seq]))
                self.sent_at[seq] = self.time

        # fill the window with new packets
        base = self._base()
        while self.next_seq < self.total and self.next_seq - base < self.WINDOW:
            seq = self.next_seq
            self.dc.send((seq, self.chunks[seq]))
            self.sent_at[seq] = self.time
            self.next_seq += 1

        return len(self.acked) < self.total


class Receiver:
    """Your receiver. Hands back the reassembled bytes via `.data()`.

    Buffers whatever arrives (in-order or not) keyed by seq, acks every packet
    it sees - including a second copy of one it already has, since that ACK
    may be the one that survives the channel - and pops off the front of the
    buffer into the assembled output whenever it becomes contiguous.
    """

    def __init__(self, data_channel, ack_channel):
        self.dc, self.ac = data_channel, ack_channel
        self.buffer = {}          # seq -> payload, for seqs received out of order
        self.next_expected = 0
        self.assembled = bytearray()

    def step(self):
        while True:
            packet = self.dc.receive()
            if packet is None:
                break
            seq, payload = packet
            if seq not in self.buffer and seq >= self.next_expected:
                self.buffer[seq] = payload
            self.ac.send(seq)   # ack it either way - R3: a dup must not corrupt anything

        while self.next_expected in self.buffer:
            self.assembled.extend(self.buffer.pop(self.next_expected))
            self.next_expected += 1

    def data(self):
        """The bytes reassembled so far."""
        return bytes(self.assembled)


# ------------------------------------------------------------------- harness
def verify(seed=246, size=2000, max_steps=200_000):
    original = bytes(random.Random(seed).getrandbits(8) for _ in range(size))
    up, down = UnreliableChannel(seed), UnreliableChannel(seed + 1)

    # Data goes out over `up`, ACKs come back over `down`. Both are unreliable.
    sender = Sender(up, down, original)
    receiver = Receiver(up, down)

    for _ in range(max_steps):
        alive = sender.step()
        receiver.step()
        if not alive and len(receiver.data() or b"") >= size:
            break

    got = receiver.data() or b""
    ok = hashlib.sha256(got).hexdigest() == hashlib.sha256(original).hexdigest()
    print(f"  bytes    sent {size}   received {len(got)}")
    print(f"  channel  {up.stats}")
    print(f"  result   {'IDENTICAL' if ok else 'CORRUPTED OR INCOMPLETE'}")
    return 0 if ok else 1


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--verify", action="store_true")
    p.add_argument("--seed", type=int, default=246)
    a = p.parse_args()
    raise SystemExit(verify(a.seed) if a.verify else p.print_help())
