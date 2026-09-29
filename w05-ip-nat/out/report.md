# Week 5 · Task 2 report

Two networks, both measured from the same laptop, no VPN active (Cloudflare WARP disconnected; the Tailscale
interface is a private overlay and was not the default route, no exit node). Values are from
`out/addresses.json` (device-specific parts masked) and `out/dhcp.pcapng`.

| | **KUWIFI Sejong** (campus Wi-Fi) | **phone hotspot** (KT LTE) |
|---|---|---|
| A1 interface address / mask | `172.16.25.130` / `255.255.255.0` (/24) | `10.53.36.69` / `255.255.255.0` (/24) |
| A2 subnet, by hand | network `172.16.25.0`, hosts `.1`–`.254`, broadcast `172.16.25.255` | network `10.53.36.0`, hosts `.1`–`.254`, broadcast `10.53.36.255` |
| A3 default gateway | `172.16.25.1` (inside the range) | `10.53.36.187` (inside the range; it is the phone) |
| A4 public address seen outside | `163.152.233.xxx` (Korea University's block) | `118.235.95.xxx` (KT, AS4766) |
| RFC 1918? | `172.16.0.0/12` — yes | `10.0.0.0/8` — yes |

## A2 · The range
Worked by hand: a /24 leaves 8 host bits, so the 256 addresses of `172.16.25.0` are: `.0` network, `.255`
broadcast, `.1`–`.254` usable. Same for `10.53.36.0/24`. My Task 1 `network_range` agrees:
`('172.16.25.1', '172.16.25.254', '172.16.25.255')` and `('10.53.36.1', '10.53.36.254', '10.53.36.255')`.

## A3 · Is the gateway inside the range, and why must it be?
Yes on both. A host only sends a frame directly (ARP, then the MAC) to an address inside its own subnet; anything
outside goes to the gateway's MAC. So the gateway has to be reachable **on the same subnet**, otherwise there
would be no way to send it the first packet.

## A5 · How many NATs?
- Both private ranges differ from the public address, so there is at least one NAT on each network.
- **Campus:** one NAT is certain (`172.16.25.130` → `163.152.233.xxx`). No `100.64.0.0/10` address on the
  interface. `tracepath` (`out/tracepath-campus.txt`): `172.16.0.2` → `192.168.98.132` (private) → `163.152.233.129`
  (public, the same /24 as my translated address) → the ISP. The first public address appears at hop 3, right after the
  private ones, which fits a single NAT at the campus edge.
- **Hotspot:** at least **one** NAT, in the phone (the laptop's `10.53.36.69` is translated to whatever the phone
  holds on the cellular side). Whether there is a **second**, at the carrier, I could not establish. `tracepath`
  (`out/tracepath-hotspot.txt`) goes phone (`10.53.36.187`) → `255.0.0.1`…`255.0.0.4` (reserved 240/4 space) →
  `172.28.1.x` (RFC 1918) → first public address at hop 10. That is *consistent with* carrier-grade NAT, but it is
  not evidence for it: the campus path also passes private hops (`192.168.98.132`, later `10.103.1.142`, `10.222.x.x`)
  inside the provider's own network with no extra NAT implied. A traceroute shows where private space is used, not
  where translation happens. I could not read the phone's own cellular address from the laptop; that address is the
  discriminating fact.
- **How to tell one from two:** read the address on the phone's/router's *outside* interface. If it is private or in
  `100.64.0.0/10` (and differs from the public address seen by a server), there is a second NAT. A traceroute alone cannot count NATs.
- The interface on `tailscale0` has a `100.x` address. That is Tailscale's overlay (it uses the CGNAT block by
  design), not carrier-grade NAT, so I did not count it.
- The hotspot also gave the laptop a global **IPv6** address (`2001:e60:…`, KT). IPv6 has no NAT: on that address
  the laptop would be directly reachable in principle. NAT only applies to my IPv4 path.

## B · Comparison of the two networks
| # | Answer |
|---|---|
| B2 | Private address, mask (both /24), gateway and public address as in the table above. |
| B3 | **Both changed.** The *public* address changed because I left the campus's block and entered the carrier's; the *private* one changed because each network's DHCP server hands out from its own pool (`172.16.25.0/24` vs. `10.53.36.0/24`). They are unrelated: the private address is a local lease in one subnet, the public one belongs to whoever runs the NAT. The masks were equal (/24) by coincidence, the gateway differed (a router at `.1` vs. a phone at `.187`). |

## C · DHCP (`out/dhcp.pcapng`)
Six packets. **#3 Discover, #4 Offer, #5 Request, #6 Ack** are a full exchange on the hotspot. (I deleted the
hotspot's remembered lease so that the laptop had to start from scratch; with a remembered lease NetworkManager
sends only Request/Ack.) **#1–#2** are a Request/Ack from the campus network that happened when the laptop briefly
fell back to KUWIFI while I reconnected: a useful second data point.

| # | Answer |
|---|---|
| C1 | Discover **#3**, Offer **#4**, Request **#5**, Ack **#6**; all four present. |
| C2 | Discover: source **`0.0.0.0`**, destination **`255.255.255.255`** (UDP 68 → 67; Ethernet destination `ff:ff:ff:ff:ff:ff`). The client has no address yet, so it can only put "this host" (`0.0.0.0`) as the source; and it does not know the server's address (or even whether there is one), so the only destination that reaches whoever is listening is the limited broadcast. |
| C3 | Hotspot: **3600 s** (1 h) in the Offer and the Ack, with renewal (T1) at 1800 s and rebinding (T2) at 3150 s. Campus, from #2: **1800 s** (30 min). |
| C4 | The Ack (#6) is sent **unicast** to `10.53.36.69`. What changed: the Offer/Request exchange has now fixed the address — the server knows the client's hardware address from the message (`chaddr`) and the address it is assigning (`yiaddr`), so it can address the frame straight to that MAC and IP; the client did not set the broadcast flag, so it can receive unicast before it has configured the address. Discover had to be broadcast because none of that existed yet. |

The campus side of that renewal (#2): the reply came from `172.16.0.7`, but its *server identifier* option says
`192.168.98.23`, a different address — the answer is relayed, so the DHCP server is not on my subnet and the
router in between is doing the relaying. It also handed out the gateway `172.16.25.1` and three DNS servers.
