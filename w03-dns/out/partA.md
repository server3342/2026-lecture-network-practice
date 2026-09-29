## Part A · The capture (`out/dns.pcapng`)

Taken on the laptop's Wi-Fi interface (KUWIFI, campus) with capture filter `port 53`, excluding the
three campus/ISP recursive resolvers so that only my own Task 1 resolver's conversations are in the file
(88 packets = 44 query/response pairs; the run was `task1_resolve.py --verify` plus two single names).
Ethernet addresses are masked (vendor prefix kept); the unmasked original is kept locally, not submitted.

| # | Answer |
|---|---|
| A1 | Source of every query is my own private address; the destinations are root, TLD and authoritative servers — no recursive resolver appears. |
| A2 | Query **#1** and response **#2**, both with transaction ID `0xa837` (`www.korea.ac.kr` asked to `198.41.0.4`, a root server). |
| A3 | **Delegation: #2** — Answer RRs 0, Authority RRs 6 (`kr` `NS` records), Additional RRs 11 (glue). **Answer: #6** — from the authoritative server for korea.ac.kr, Answer RRs 1 (the `A` record). |
| A4 | Largest response: **#50**, 897 bytes on the wire (855 bytes of DNS payload), the root's referral for `www.microsoft.com-c-3.edgekey.net`. It is large because a referral to a big TLD carries **13 NS records plus 27 additional records** (A and AAAA glue for all 13 `gtld-servers.net`, plus the EDNS OPT record). Names in it are compressed (an NS RDATA of 4 bytes is one label plus a pointer); without compression it would be larger. |
