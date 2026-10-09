// 용어, IP 주소, MAC 주소에 마우스를 올리면 설명 창을 띄웁니다.
// 용어는 절마다 처음 나온 곳에만 붙입니다. 주소는 나올 때마다 붙입니다.
(function () {
  "use strict";

  // ---------- 용어 사전: [별칭들, 제목, 설명, 자세히 링크] ----------
  var TERMS = [
    // 공통
    [["호스트"], "호스트 (host)", "네트워크에 연결된 컴퓨터입니다. 노트북, 서버, 휴대폰이 호스트입니다.", "index.html#how"],
    [["데이터그램"], "데이터그램 (datagram)", "네트워크 계층(IP)의 전송 단위입니다. 헤더에 출발지와 목적지 IP 주소가 있습니다.", "w05-ip-nat.html#dgram"],
    [["세그먼트"], "세그먼트 (segment)", "전송 계층(TCP)의 전송 단위입니다. 헤더에 포트 번호와 순서 번호가 있습니다.", "w04-tcp.html#seg"],
    [["프레임"], "프레임 (frame)", "링크 계층의 전송 단위입니다. 링크 하나를 건넙니다. 헤더에 MAC 주소가 있습니다.", "w07-ethernet-arp.html#frame"],
    [["RTT", "왕복 시간"], "RTT (round-trip time)", "보낸 뒤 답이 돌아올 때까지의 시간입니다. TCP의 타임아웃과 처리량을 정합니다.", "w04-tcp.html#rtt"],
    [["TTL"], "TTL (time to live)", "이름이 같은 두 값이 있습니다. IP 헤더의 TTL은 홉 수입니다. 라우터마다 1씩 줄고 0이면 버립니다. DNS 레코드의 TTL은 초입니다. 캐시에 둘 수 있는 시간입니다.", "w05-ip-nat.html#dgram"],
    [["캡슐화"], "캡슐화 (encapsulation)", "아래 계층이 위 계층의 데이터에 자기 헤더를 붙이는 일입니다. 받는 쪽은 아래에서 위로 헤더를 뗍니다.", "index.html#layers"],
    // 3주차 DNS
    [["DNS"], "DNS (Domain Name System)", "이름을 IP 주소로 바꾸는 분산 데이터베이스입니다. 보통 UDP 53번 포트를 씁니다.", "w03-dns.html#problem"],
    [["리졸버", "resolver"], "리졸버 (resolver)", "호스트 대신 이름을 해석하는 DNS 서버입니다. 답을 캐시에 둡니다.", "w03-dns.html#hier"],
    [["스텁 리졸버"], "스텁 리졸버 (stub resolver)", "호스트 안에서 응용의 질의를 받아 리졸버로 넘기는 작은 프로그램입니다. Linux에서는 systemd-resolved(127.0.0.53)입니다.", "flow.html#s-dns"],
    [["재귀 질의"], "재귀 질의 (recursive query)", "받은 서버가 답을 끝까지 찾아 주는 질의입니다. 호스트가 리졸버에게 보냅니다.", "w03-dns.html#rec"],
    [["반복 질의"], "반복 질의 (iterative query)", "받은 서버가 답 대신 다음에 물을 서버를 알려 주는 질의입니다. 리졸버가 루트, TLD, 권한 서버에 차례로 보냅니다.", "w03-dns.html#rec"],
    [["루트 서버"], "루트 서버 (root server)", "DNS 계층의 맨 위입니다. 각 최상위 도메인(TLD) 서버의 목록만 압니다. 13개 이름으로 운영합니다.", "w03-dns.html#hier"],
    [["TLD"], "TLD (top-level domain)", "최상위 도메인입니다. 예: .com, .kr. TLD 서버는 그 아래 도메인의 권한 서버를 알려 줍니다.", "w03-dns.html#hier"],
    [["권한 서버", "권한 DNS 서버"], "권한 서버 (authoritative server)", "한 영역(zone)의 레코드를 실제로 가진 서버입니다. 응답에 AA 플래그를 켭니다.", "w03-dns.html#hier"],
    [["자원 레코드"], "자원 레코드 (resource record)", "DNS가 저장하는 항목입니다. (이름, TTL, 클래스, 타입, 값)으로 이루어집니다.", "w03-dns.html#rr"],
    [["위임"], "위임 (delegation)", "\"이 이름은 저 서버에 물으십시오\"라고 하는 응답입니다. Answer는 비고, Authority에 NS 레코드가 있습니다.", "w03-dns.html#deleg"],
    [["glue"], "glue 레코드", "위임과 함께 오는 네임서버의 A 레코드입니다. 없으면 네임서버의 이름을 따로 해석해야 합니다.", "w03-dns.html#deleg"],
    [["CNAME"], "CNAME (canonical name)", "한 이름이 다른 이름의 별칭이라는 레코드입니다. CDN이 사용자를 유도할 때 자주 씁니다.", "w03-dns.html#cname"],
    [["CDN"], "CDN (content distribution network)", "여러 위치에 복사본을 두고, 사용자를 그중 한 곳으로 보내는 망입니다.", "w03-dns.html#cdn"],
    [["애니캐스트", "anycast"], "애니캐스트 (anycast)", "여러 위치의 서버가 같은 IP 주소를 씁니다. 라우팅이 가까운 위치로 보냅니다.", "w03-dns.html#cdn"],
    [["DASH"], "DASH", "비디오를 여러 품질의 조각으로 나누고, 클라이언트가 대역폭에 맞춰 조각을 고르는 방식입니다.", "w03-dns.html#dash"],
    // 4주차 TCP
    [["포트 번호"], "포트 번호 (port number)", "한 호스트 안의 프로세스(소켓)를 구별하는 16비트 번호입니다. 예: HTTPS 443, DNS 53.", "w04-tcp.html#mux"],
    [["소켓"], "소켓 (socket)", "프로세스와 전송 계층 사이의 문입니다. TCP 소켓은 (출발지 IP, 출발지 포트, 목적지 IP, 목적지 포트)로 구별합니다.", "w04-tcp.html#mux"],
    [["역다중화"], "역다중화 (demultiplexing)", "받은 세그먼트의 헤더를 보고 맞는 소켓에 데이터를 넘기는 일입니다.", "w04-tcp.html#mux"],
    [["다중화"], "다중화 (multiplexing)", "여러 소켓의 데이터에 헤더를 붙여 한 네트워크로 내보내는 일입니다.", "w04-tcp.html#mux"],
    [["UDP"], "UDP (User Datagram Protocol)", "연결 설정, 재전송, 혼잡 제어가 없는 전송 프로토콜입니다. 헤더는 8바이트입니다.", "w04-tcp.html#udp"],
    [["TCP"], "TCP (Transmission Control Protocol)", "연결형, 신뢰적, 순서 보장 전송 프로토콜입니다. 흐름 제어와 혼잡 제어를 합니다.", "w04-tcp.html#seg"],
    [["QUIC"], "QUIC", "UDP 위의 전송 프로토콜입니다. 스트림마다 따로 복구해서 HOL 블로킹을 줄입니다. 암호화가 기본입니다.", "w04-tcp.html#quic"],
    [["순서 번호"], "순서 번호 (sequence number)", "데이터에 붙인 번호입니다. TCP는 바이트마다 번호를 셉니다. 손실, 중복, 순서 바뀜을 구별합니다.", "w04-tcp.html#rdt"],
    [["ISN"], "ISN (initial sequence number)", "연결의 첫 순서 번호입니다. 예측하기 어렵게 고릅니다. 위조 세그먼트와 이전 연결의 세그먼트를 막습니다.", "w04-tcp.html#seg"],
    [["ACK"], "ACK (acknowledgment)", "받았다는 확인입니다. TCP의 ACK 번호는 다음에 기다리는 바이트 번호입니다. DHCP의 ACK는 임대를 확정하는 메시지입니다.", "w04-tcp.html#seg"],
    [["SYN"], "SYN", "TCP 연결을 여는 세그먼트의 플래그입니다. 데이터가 없어도 순서 번호 하나를 씁니다.", "w04-tcp.html#hs"],
    [["FIN"], "FIN", "TCP 연결의 한쪽 방향을 닫는 플래그입니다. 양쪽이 각자 FIN을 보냅니다.", "flow.html#s-close"],
    [["MSS"], "MSS (maximum segment size)", "한 세그먼트에 담을 데이터의 최대 크기입니다. SYN의 옵션으로 알립니다. 이더넷에서 보통 1460바이트입니다.", "w04-tcp.html#hs"],
    [["윈도우 스케일"], "윈도우 스케일 (window scale)", "16비트 윈도우 필드에 곱할 2의 거듭제곱입니다. SYN에서 정합니다. 예: 10이면 ×1024.", "w04-tcp.html#hs"],
    [["SACK"], "SACK (selective acknowledgment)", "받은 데이터 구간을 따로 알리는 TCP 옵션입니다. 빠진 부분만 다시 보내게 합니다.", "w04-tcp.html#seg"],
    [["3-way handshake", "핸드셰이크"], "3-way handshake", "SYN → SYN+ACK → ACK로 연결을 엽니다. 양쪽의 ISN과 옵션을 교환합니다.", "w04-tcp.html#hs"],
    [["수신 윈도우", "rwnd"], "수신 윈도우 (rwnd)", "받는 쪽 버퍼의 남은 공간입니다. 보내는 쪽은 이보다 많이 보내지 않습니다(흐름 제어).", "w04-tcp.html#flow"],
    [["혼잡 윈도우", "cwnd"], "혼잡 윈도우 (cwnd)", "보내는 쪽이 네트워크를 위해 스스로 제한하는 양입니다. 보내는 양은 min(rwnd, cwnd)입니다.", "w04-tcp.html#cc"],
    [["흐름 제어"], "흐름 제어 (flow control)", "받는 쪽 버퍼가 넘치지 않게 보내는 양을 줄이는 일입니다. 수신 윈도우를 씁니다.", "w04-tcp.html#flow"],
    [["혼잡 제어"], "혼잡 제어 (congestion control)", "네트워크의 큐가 넘치지 않게 보내는 양을 조절하는 일입니다. 혼잡 윈도우를 씁니다.", "w04-tcp.html#cc"],
    [["슬로 스타트"], "슬로 스타트 (slow start)", "연결 초기에 cwnd를 RTT마다 두 배로 늘리는 단계입니다. 손실이나 임계값에서 멈춥니다.", "w04-tcp.html#cc"],
    [["AIMD"], "AIMD", "additive increase, multiplicative decrease. RTT마다 cwnd를 1씩 늘리고, 손실이 나면 절반으로 줄입니다.", "w04-tcp.html#cc"],
    [["BDP"], "BDP (bandwidth-delay product)", "대역폭 × RTT입니다. 링크를 가득 채우려면 이만큼 전송 중이어야 합니다.", "w04-tcp.html#bdp"],
    [["선택적 반복"], "선택적 반복 (selective repeat)", "패킷마다 ACK와 타이머를 두고, 받는 쪽이 순서가 바뀐 패킷을 버퍼에 두는 파이프라이닝입니다.", "w04-tcp.html#pipe"],
    [["GBN", "Go-Back-N"], "Go-Back-N", "누적 ACK와 타이머 하나를 쓰는 파이프라이닝입니다. 손실이 나면 그 뒤를 모두 다시 보냅니다.", "w04-tcp.html#pipe"],
    [["정지-대기", "stop-and-wait"], "정지-대기 (stop-and-wait)", "패킷 하나를 보내고 ACK를 받을 때까지 기다리는 방식입니다. 이용률이 낮습니다.", "w04-tcp.html#pipe"],
    [["파이프라이닝"], "파이프라이닝 (pipelining)", "ACK를 기다리지 않고 여러 패킷을 연달아 보내는 방식입니다.", "w04-tcp.html#pipe"],
    [["HOL 블로킹"], "HOL 블로킹 (head-of-line blocking)", "맨 앞 항목이 막혀서 뒤의 항목이 처리될 수 있어도 기다리는 현상입니다.", "w04-tcp.html#quic"],
    [["TLS"], "TLS (Transport Layer Security)", "TCP 위에서 암호화와 서버 인증을 하는 프로토콜입니다. HTTPS가 씁니다. 이 강의의 범위 밖입니다.", "flow.html#s-tls"],
    [["GRO", "TSO"], "GRO / TSO", "NIC과 커널이 세그먼트를 합치거나(GRO, 받을 때) 나누는(TSO, 보낼 때) 기능입니다. 그래서 캡처에 MSS보다 큰 패킷이 보입니다.", "flow.html#s-data"],
    // 5주차 IP
    [["포워딩"], "포워딩 (forwarding)", "라우터 하나가 들어온 패킷을 알맞은 출력 링크로 보내는 일입니다. 데이터 평면입니다.", "w05-ip-nat.html#plane"],
    [["라우팅"], "라우팅 (routing)", "출발지에서 목적지까지의 경로를 정하는 일입니다. 포워딩 테이블을 만듭니다. 제어 평면입니다.", "w06-routing.html#control"],
    [["포워딩 테이블"], "포워딩 테이블 (forwarding table)", "목적지 프리픽스마다 출력 링크(다음 홉)를 적은 표입니다. 라우팅이 만들고 포워딩이 읽습니다.", "w05-ip-nat.html#plane"],
    [["데이터 평면"], "데이터 평면 (data plane)", "패킷마다 하는 일입니다. 나노초 단위의 포워딩입니다.", "w05-ip-nat.html#plane"],
    [["제어 평면"], "제어 평면 (control plane)", "경로를 계산하고 포워딩 테이블을 만드는 일입니다. 초 단위입니다.", "w06-routing.html#control"],
    [["서브넷"], "서브넷 (subnet)", "라우터를 거치지 않고 서로 직접 닿는 인터페이스들의 집합입니다. 주소의 앞부분(프리픽스)이 같습니다.", "w05-ip-nat.html#cidr"],
    [["프리픽스"], "프리픽스 (prefix)", "주소의 네트워크 부분입니다. /x는 앞 x비트를 뜻합니다.", "w05-ip-nat.html#cidr"],
    [["CIDR"], "CIDR", "a.b.c.d/x 표기입니다. 앞 x비트가 네트워크, 나머지가 호스트 부분입니다.", "w05-ip-nat.html#cidr"],
    [["마스크", "서브넷 마스크"], "서브넷 마스크 (subnet mask)", "네트워크 비트는 1, 호스트 비트는 0인 32비트 값입니다. 주소와 AND 하면 네트워크 주소가 나옵니다.", "w05-ip-nat.html#cidr"],
    [["최장 프리픽스 일치", "LPM"], "최장 프리픽스 일치 (LPM)", "목적지 주소와 일치하는 항목 중 프리픽스가 가장 긴 항목을 고르는 규칙입니다.", "w05-ip-nat.html#lpm"],
    [["경로 집약"], "경로 집약 (route aggregation)", "여러 프리픽스를 더 짧은 프리픽스 하나로 묶어 광고하는 일입니다.", "w05-ip-nat.html#lpm"],
    [["기본 게이트웨이", "게이트웨이"], "기본 게이트웨이 (default gateway)", "서브넷 밖으로 갈 패킷을 받는 첫 홉 라우터입니다. 반드시 같은 서브넷 안에 있습니다.", "w05-ip-nat.html#private"],
    [["기본 경로"], "기본 경로 (default route)", "0.0.0.0/0 항목입니다. 길이가 0이라 모든 주소와 일치합니다. 다른 일치가 없을 때만 씁니다.", "w05-ip-nat.html#lpm"],
    [["다음 홉", "첫 홉"], "다음 홉 (next hop)", "패킷을 다음에 넘길 이웃 라우터입니다. 라우터는 경로 전체가 아니라 다음 홉만 저장합니다.", "w06-routing.html#hop"],
    [["사설 주소"], "사설 주소 (private address)", "인터넷에서 라우팅되지 않는 주소입니다. 10/8, 172.16/12, 192.168/16 (RFC 1918).", "w05-ip-nat.html#private"],
    [["공인 주소"], "공인 주소 (public address)", "인터넷에서 라우팅되는 주소입니다. 전 세계에서 하나뿐입니다.", "w05-ip-nat.html#private"],
    [["DHCP"], "DHCP", "호스트가 네트워크에 들어올 때 주소, 마스크, 게이트웨이, DNS 서버를 자동으로 받는 프로토콜입니다. UDP 67/68번 포트.", "w05-ip-nat.html#dhcp"],
    [["DORA"], "DORA", "DHCP의 네 메시지입니다: Discover → Offer → Request → Ack.", "w05-ip-nat.html#dhcp"],
    [["임대"], "임대 (lease)", "DHCP가 주소를 빌려주는 기간입니다. 절반(T1)이 지나면 갱신을 요청합니다.", "w05-ip-nat.html#dhcp"],
    [["릴레이"], "DHCP 릴레이 (relay)", "다른 서브넷의 DHCP 서버로 메시지를 전달하는 라우터의 기능입니다.", "w05-ip-nat.html#dhcp"],
    [["NAT"], "NAT (Network Address Translation)", "내부의 사설 주소와 포트를 공인 주소와 새 포트로 바꿉니다. 변환 표로 응답을 되돌립니다.", "w05-ip-nat.html#nat"],
    [["CGNAT"], "CGNAT (carrier-grade NAT)", "통신사가 고객 여러 명에게 공인 주소 하나를 나누어 주는 NAT입니다. 100.64.0.0/10을 씁니다.", "w05-ip-nat.html#nat"],
    [["IPv6"], "IPv6", "128비트 주소를 쓰는 IP입니다. 헤더는 40바이트로 고정입니다. 라우터 단편화와 헤더 체크섬이 없습니다.", "w05-ip-nat.html#v6"],
    [["듀얼 스택"], "듀얼 스택 (dual stack)", "호스트와 라우터가 IPv4와 IPv6를 함께 쓰는 방식입니다.", "w05-ip-nat.html#v6"],
    [["MTU"], "MTU (maximum transmission unit)", "링크가 한 번에 나를 수 있는 최대 데이터 크기입니다. 이더넷은 1,500바이트입니다.", "w05-ip-nat.html#dgram"],
    [["단편화"], "단편화 (fragmentation)", "MTU보다 큰 데이터그램을 조각으로 나누는 일입니다. IPv4는 목적지 호스트에서만 다시 합칩니다.", "w05-ip-nat.html#dgram"],
    [["브로드캐스트"], "브로드캐스트 (broadcast)", "같은 링크(서브넷)의 모두에게 보내는 것입니다. IP는 255.255.255.255, MAC은 FF:FF:FF:FF:FF:FF.", "w07-ethernet-arp.html#mac"],
    [["유니캐스트"], "유니캐스트 (unicast)", "한 대상에게만 보내는 것입니다.", "w07-ethernet-arp.html#mac"],
    [["TCAM"], "TCAM", "모든 항목을 한 클록에 동시에 비교하는 메모리입니다. 라우터의 LPM에 씁니다. 비싸고 전력이 큽니다.", "w05-ip-nat.html#fast"],
    [["DIR-24-8"], "DIR-24-8", "상위 24비트로 2^24칸 배열을 직접 찾는 LPM 구조입니다. 조회가 배열 읽기 한 번입니다. 메모리는 64 MB입니다.", "w05-ip-nat.html#fast"],
    [["트라이"], "트라이 (trie)", "주소를 비트 하나씩 따라 내려가는 트리입니다. 최악에도 32단계로 끝납니다.", "w05-ip-nat.html#fast"],
    [["traceroute", "tracepath"], "traceroute / tracepath", "IP TTL을 1부터 늘려 보내고, TTL이 0이 된 라우터의 ICMP 응답으로 경로를 찾는 도구입니다.", "w06-routing.html#trace"],
    [["ICMP"], "ICMP", "IP의 오류와 진단 메시지입니다. 예: TTL 초과(Time Exceeded), echo(ping).", "w06-routing.html#trace"],
    // 6주차 라우팅
    [["링크 상태"], "링크 상태 (link state, LS)", "모든 라우터가 망 전체의 지도를 가지고, 각자 다익스트라를 실행하는 라우팅 방식입니다.", "w06-routing.html#ls"],
    [["LSA", "링크 상태 광고"], "LSA (link-state advertisement)", "라우터가 자기 링크와 비용을 담아 영역의 모든 라우터에 플러딩하는 메시지입니다.", "w06-routing.html#ls"],
    [["다익스트라"], "다익스트라 (Dijkstra)", "한 출발지에서 모든 노드까지의 최소 비용을 구합니다. 가장 가까운 노드부터 하나씩 확정합니다.", "w06-routing.html#ls"],
    [["SPF"], "SPF (shortest path first)", "OSPF에서 다익스트라 계산을 부르는 이름입니다.", "w06-routing.html#ls"],
    [["ECMP"], "ECMP (equal-cost multi-path)", "비용이 같은 다음 홉을 모두 설치하고, 흐름마다 해시로 하나를 고르는 방식입니다.", "w06-routing.html#hop"],
    [["거리 벡터"], "거리 벡터 (distance vector, DV)", "각 라우터가 이웃이 알려 준 거리로 벨만-포드 식을 반복 계산하는 라우팅 방식입니다.", "w06-routing.html#dv"],
    [["벨만-포드"], "벨만-포드 (Bellman-Ford)", "D_x(y) = min_v { c(x,v) + D_v(y) }. 이웃까지의 비용과 이웃이 말한 거리의 합 중 최소입니다.", "w06-routing.html#dv"],
    [["무한 카운트"], "무한 카운트 (count-to-infinity)", "거리 벡터에서 링크 비용이 크게 늘 때, 두 라우터가 서로를 경유지로 믿고 거리를 조금씩 올리는 문제입니다.", "w06-routing.html#dv"],
    [["독성 역전"], "독성 역전 (poisoned reverse)", "어떤 이웃을 거쳐 가는 목적지는, 그 이웃에게 거리를 ∞로 알립니다. 두 라우터 사이의 순환을 막습니다.", "w06-routing.html#dv"],
    [["OSPF"], "OSPF (Open Shortest Path First)", "AS 안에서 쓰는 링크 상태 라우팅 프로토콜입니다. Hello로 이웃을 찾고 LSA를 플러딩합니다.", "w06-routing.html#ospf"],
    [["BGP"], "BGP (Border Gateway Protocol)", "AS 사이의 라우팅 프로토콜입니다. 교재 §5.4.", "w06-routing.html#ospf"],
    [["자율 시스템", "AS"], "자율 시스템 (autonomous system, AS)", "한 기관이 운영하는 라우터들의 묶음입니다. 번호(ASN)가 있습니다. 예: SK브로드밴드 AS9318.", "w06-routing.html#ospf"],
    [["Hello"], "Hello", "OSPF 라우터가 이웃에게 주기적으로 보내는 메시지입니다. 기본 10초마다 보냅니다.", "w06-routing.html#ospf"],
    [["Dead"], "Dead 간격 (dead interval)", "이 시간 동안 Hello가 없으면 이웃이 죽었다고 봅니다. 기본 40초입니다.", "w06-routing.html#ospf"],
    [["인접 관계"], "인접 관계 (adjacency)", "두 OSPF 라우터가 데이터베이스를 맞춘 관계입니다. Init → 2-Way → Exchange → Loading → Full.", "w06-routing.html#ospf"],
    [["재수렴"], "재수렴 (reconvergence)", "망이 바뀐 뒤 모든 라우터의 테이블이 다시 맞을 때까지의 과정입니다.", "w06-routing.html#reconv"],
    [["수렴"], "수렴 (convergence)", "모든 라우터의 테이블이 현재 망의 상태와 맞는 상태입니다.", "w06-routing.html#control"],
    [["반송파"], "반송파 (carrier)", "링크의 물리적 신호입니다. 케이블이 빠지면 어댑터가 반송파가 끊긴 것을 바로 압니다.", "w06-routing.html#reconv"],
    [["BFD"], "BFD (Bidirectional Forwarding Detection)", "이웃을 1초보다 훨씬 짧은 간격으로 확인하는 프로토콜입니다. 고장 감지를 빠르게 합니다.", "w06-routing.html#reconv"],
    [["플래핑", "flapping"], "플래핑 (flapping)", "링크가 계속 끊겼다 살아나는 상태입니다. 그때마다 모든 라우터가 SPF를 다시 실행합니다.", "w06-routing.html#incr"],
    [["블랙홀"], "블랙홀 (black hole)", "패킷이 오류 메시지 없이 버려지는 곳입니다.", "w06-routing.html#reconv"],
    [["SDN"], "SDN (software-defined networking)", "원격 컨트롤러가 포워딩 테이블을 계산해 라우터에 내려 주는 방식입니다.", "w06-routing.html#control"],
    [["FRR"], "FRR (FRRouting)", "OSPF, BGP 등을 구현한 공개 라우팅 소프트웨어입니다. Task 2에서 9.1.0을 썼습니다.", "w06-routing.html#ospf"],
    // 7주차 링크 계층
    [["링크 계층"], "링크 계층 (link layer)", "데이터그램을 프레임에 넣어 이웃한 노드로 링크 하나를 건넙니다.", "w07-ethernet-arp.html#link"],
    [["NIC", "어댑터"], "어댑터 (NIC)", "링크 계층을 구현한 하드웨어입니다. MAC 주소가 붙습니다.", "w07-ethernet-arp.html#link"],
    [["MAC 주소"], "MAC 주소 (MAC address)", "어댑터에 붙는 48비트 주소입니다. 평평해서 위치를 알려 주지 않습니다.", "w07-ethernet-arp.html#mac"],
    [["OUI"], "OUI (organizationally unique identifier)", "MAC 주소의 앞 24비트입니다. IEEE가 제조사에 나누어 줍니다.", "w07-ethernet-arp.html#mac"],
    [["ARP"], "ARP (Address Resolution Protocol)", "같은 서브넷 안의 IP 주소를 MAC 주소로 바꿉니다. 요청은 브로드캐스트, 응답은 유니캐스트입니다.", "w07-ethernet-arp.html#arp"],
    [["ARP 스푸핑"], "ARP 스푸핑 (ARP spoofing)", "거짓 ARP 응답으로 다른 노드의 ARP 테이블을 속이는 공격입니다. ARP에는 인증이 없습니다.", "w07-ethernet-arp.html#arp"],
    [["소프트 상태"], "소프트 상태 (soft state)", "갱신하지 않으면 시간이 지나 저절로 지워지는 상태입니다. ARP 테이블과 스위치 테이블이 그렇습니다.", "w07-ethernet-arp.html#arp"],
    [["이더넷"], "이더넷 (Ethernet)", "가장 널리 쓰는 유선 LAN 기술입니다. 비연결형이고 비신뢰적입니다.", "w07-ethernet-arp.html#frame"],
    [["프리앰블"], "프리앰블 (preamble)", "이더넷 프레임 앞의 8바이트입니다. 받는 쪽의 시계를 맞춥니다.", "w07-ethernet-arp.html#frame"],
    [["EtherType"], "EtherType", "이더넷 헤더의 타입 필드입니다. 0x0800 IPv4, 0x0806 ARP, 0x86DD IPv6.", "w07-ethernet-arp.html#frame"],
    [["CRC"], "CRC (cyclic redundancy check)", "비트열을 다항식으로 나눈 나머지로 오류를 찾습니다. 이더넷은 CRC-32를 씁니다.", "w07-ethernet-arp.html#err"],
    [["패리티"], "패리티 (parity)", "1의 개수가 짝수(또는 홀수)가 되게 붙이는 검사 비트입니다.", "w07-ethernet-arp.html#err"],
    [["체크섬"], "체크섬 (checksum)", "16비트 단위 합의 1의 보수입니다. IP, UDP, TCP 헤더가 씁니다.", "w07-ethernet-arp.html#err"],
    [["CSMA/CD"], "CSMA/CD", "보내기 전에 듣고, 보내는 중 충돌을 감지하면 멈추고 이진 지수 백오프로 기다립니다.", "w07-ethernet-arp.html#mac-proto"],
    [["CSMA/CA"], "CSMA/CA", "충돌을 감지할 수 없는 무선(Wi-Fi)에서 충돌을 피하려고 쓰는 다중 접속입니다.", "w07-ethernet-arp.html#mac-proto"],
    [["ALOHA"], "ALOHA", "아무 때나(또는 슬롯 시작에) 보내고, 충돌하면 무작위로 다시 보내는 다중 접속입니다. 슬롯 ALOHA의 최대 효율은 1/e입니다.", "w07-ethernet-arp.html#mac-proto"],
    [["TDMA"], "TDMA", "시간을 슬롯으로 나누어 노드마다 주는 채널 분할 방식입니다.", "w07-ethernet-arp.html#mac-proto"],
    [["FDMA"], "FDMA", "주파수를 나누어 노드마다 주는 채널 분할 방식입니다.", "w07-ethernet-arp.html#mac-proto"],
    [["백오프", "이진 지수 백오프"], "이진 지수 백오프 (binary exponential backoff)", "n번째 충돌 뒤 {0, …, 2^n−1}에서 무작위로 기다릴 시간을 고릅니다. 충돌이 많을수록 범위가 커집니다.", "w07-ethernet-arp.html#mac-proto"],
    [["충돌"], "충돌 (collision)", "두 노드가 한 채널에서 동시에 보내 신호가 섞이는 것입니다.", "w07-ethernet-arp.html#mac-proto"],
    [["스위치"], "스위치 (switch)", "MAC 주소를 보고 프레임을 알맞은 포트로만 내보내는 링크 계층 장치입니다. 스스로 테이블을 배웁니다.", "w07-ethernet-arp.html#switch"],
    [["자기 학습"], "자기 학습 (self-learning)", "스위치가 들어온 프레임의 출발지 MAC과 포트를 기록해 테이블을 채우는 방식입니다.", "w07-ethernet-arp.html#switch"],
    [["플러딩"], "플러딩 (flooding)", "두 가지 뜻이 있습니다. 스위치는 모르는 목적지의 프레임을 들어온 포트 외의 모든 포트로 보냅니다. OSPF는 LSA를 모든 라우터에 퍼뜨립니다.", "w07-ethernet-arp.html#switch"],
    [["필터링"], "필터링 (filtering)", "목적지가 들어온 포트 쪽에 있으면 스위치가 프레임을 버리는 일입니다.", "w07-ethernet-arp.html#switch"],
    [["에이징"], "에이징 (aging)", "일정 시간 보이지 않은 스위치 테이블 항목을 지우는 일입니다.", "w07-ethernet-arp.html#switch"],
    [["스패닝 트리"], "스패닝 트리 (spanning tree)", "스위치 망의 순환을 끊으려고 일부 포트를 막아 트리를 만드는 프로토콜입니다.", "w07-ethernet-arp.html#vs"],
    [["브로드캐스트 폭풍"], "브로드캐스트 폭풍 (broadcast storm)", "브로드캐스트 프레임이 순환하거나 너무 많아 망을 가득 채우는 현상입니다.", "w07-ethernet-arp.html#vs"]
  ];

  // ---------- 이 저장소에 나오는 주소의 역할 ----------
  var ROLES = {
    "172.16.25.130": "캠퍼스 Wi-Fi에서 노트북이 DHCP로 받은 주소입니다.",
    "172.16.25.130/24": "노트북의 캠퍼스 주소와 마스크입니다.",
    "172.16.25.0/24": "노트북의 캠퍼스 서브넷입니다.",
    "172.16.25.1": "캠퍼스 Wi-Fi의 기본 게이트웨이입니다.",
    "172.16.0.7": "캠퍼스 DHCP 응답의 출발지입니다. 서버 식별자와 달라서 릴레이로 봅니다.",
    "192.168.98.23": "캠퍼스 DHCP 서버의 식별자입니다. 노트북과 다른 서브넷에 있습니다.",
    "172.16.0.2": "캠퍼스 tracepath의 1번 홉입니다.",
    "192.168.98.132": "캠퍼스 tracepath의 2번 홉입니다. NAT가 아니어도 사설 주소입니다.",
    "163.152.233.129": "캠퍼스의 마지막 홉입니다. 다음 홉부터 SK브로드밴드입니다.",
    "175.121.235.141": "SK브로드밴드(AS9318)의 첫 홉입니다. 경로가 여기서 캠퍼스를 벗어납니다.",
    "10.222.10.159": "SK브로드밴드 내부 홉입니다. 다음 홉에서 RTT가 114 ms 늘어납니다.",
    "10.222.1.91": "SK브로드밴드 내부 홉입니다. 이 홉 직전에 태평양을 건넙니다.",
    "172.66.0.218": "speed.cloudflare.com 서버입니다(4주차 측정).",
    "127.0.0.53": "노트북 안의 스텁 리졸버(systemd-resolved)입니다.",
    "10.53.36.69": "휴대폰 핫스팟에서 노트북이 받은 주소입니다.",
    "10.53.36.187": "핫스팟의 기본 게이트웨이, 곧 휴대폰입니다.",
    "198.41.0.4": "루트 서버 a.root-servers.net입니다.",
    "199.9.14.201": "루트 서버 b.root-servers.net입니다(실습 코드의 루트 목록).",
    "192.33.4.12": "루트 서버 c.root-servers.net입니다.",
    "210.101.61.1": ".kr 최상위 도메인 서버 중 하나입니다.",
    "163.152.11.6": "korea.ac.kr의 권한 DNS 서버 중 하나입니다.",
    "163.152.6.10": "www.korea.ac.kr의 주소입니다.",
    "23.49.206.40": "www.microsoft.com의 Akamai CDN 주소입니다(내 리졸버로 받은 답).",
    "104.94.218.45": "www.microsoft.com의 Akamai CDN 주소입니다(dig로 받은 답).",
    "8.8.8.8": "Google의 공용 DNS 리졸버입니다. 애니캐스트입니다.",
    "1.1.1.1": "Cloudflare의 공용 DNS 리졸버입니다. 애니캐스트입니다. 6주차 OSPF 그림에서는 r1의 라우터 ID입니다.",
    "2.2.2.2": "6주차 OSPF 라우터 r2의 라우터 ID입니다. 주소 모양이지만 라우터의 이름입니다.",
    "3.3.3.3": "6주차 OSPF 라우터 r3의 라우터 ID입니다. 주소 모양이지만 라우터의 이름입니다.",
    "172.18.0.0/16": "Task 2 OSPF 영역의 net_a(r1–r3)입니다.",
    "172.21.0.0/16": "Task 2 OSPF 영역의 net_b(r1–r2)입니다.",
    "172.20.0.0/16": "Task 2 OSPF 영역의 net_c(r2–r3)입니다.",
    "172.18.0.3": "net_a의 r3 인터페이스입니다.",
    "172.21.0.3": "net_b의 r2 인터페이스입니다.",
    "172.17.0.0/16": "Docker의 기본 브리지(docker0) 서브넷입니다.",
    "0.0.0.0/0": "기본 경로입니다. 다른 항목이 일치하지 않을 때만 씁니다.",
    "138.76.29.7": "교재 NAT 예시의 NAT 라우터 공인 주소입니다.",
    "128.119.40.186": "교재 NAT 예시의 웹 서버입니다.",
    "10.20.30.70": "5주차 LPM 계산 예시의 목적지입니다.",
    "200.23.16.0/20": "교재의 경로 집약 예시입니다."
  };

  // ---------- IP 주소 계산 ----------
  function toInt(s) {
    var p = s.split("."), v = 0;
    for (var i = 0; i < 4; i++) v = v * 256 + Number(p[i]);
    return v;
  }
  function toStr(v) {
    return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");
  }
  function maskOf(len) { return len === 0 ? 0 : (0xFFFFFFFF << (32 - len)) >>> 0; }
  function inNet(v, net, len) { return ((v & maskOf(len)) >>> 0) === toInt(net); }
  var KINDS = [
    ["0.0.0.0", 8, "\"이 네트워크\" (특수)"],
    ["10.0.0.0", 8, "사설 주소 (RFC 1918, 10.0.0.0/8)"],
    ["100.64.0.0", 10, "공유 주소 (CGNAT용, RFC 6598)"],
    ["127.0.0.0", 8, "루프백 (자기 자신)"],
    ["169.254.0.0", 16, "링크 로컬 (DHCP 실패 시 자동 주소)"],
    ["172.16.0.0", 12, "사설 주소 (RFC 1918, 172.16.0.0/12)"],
    ["192.0.2.0", 24, "문서용 예시 주소 (RFC 5737)"],
    ["198.51.100.0", 24, "문서용 예시 주소 (RFC 5737)"],
    ["203.0.113.0", 24, "문서용 예시 주소 (RFC 5737)"],
    ["192.168.0.0", 16, "사설 주소 (RFC 1918, 192.168.0.0/16)"],
    ["224.0.0.0", 4, "멀티캐스트"],
    ["240.0.0.0", 4, "예약"]
  ];
  function kindOf(v) {
    if (v === 0xFFFFFFFF) return "제한된 브로드캐스트. 같은 서브넷 전체에 갑니다. 라우터를 넘지 않습니다.";
    if (v === 0) return "\"이 호스트\". 주소가 아직 없을 때 출발지로 씁니다.";
    for (var i = 0; i < KINDS.length; i++) if (inNet(v, KINDS[i][0], KINDS[i][1])) return KINDS[i][2];
    return "공인 주소 (인터넷에서 라우팅됨)";
  }
  function maskLen(v) {
    // 1이 이어지다가 0이 이어지는 값이면 그 1의 개수, 아니면 -1
    var n = 0;
    while (n < 32 && ((v >>> (31 - n)) & 1)) n++;
    return ((maskOf(n) >>> 0) === v) ? n : -1;
  }
  function bin(v) {
    return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
      .map(function (o) { return ("0000000" + o.toString(2)).slice(-8); }).join(".");
  }
  function fmt(n) { return n.toLocaleString("ko-KR"); }

  function ipTip(text) {
    var m = text.split("/"), ip = m[0], v = toInt(ip), rows = [];
    var role = ROLES[text] || (m.length > 1 ? null : null) || ROLES[ip];
    if (role) rows.push(["역할", role]);
    if (m.length > 1) {
      var len = Number(m[1]), mk = maskOf(len), net = (v & mk) >>> 0;
      var bc = (net | (~mk >>> 0)) >>> 0, count = Math.pow(2, 32 - len);
      if (net !== v) rows.push(["주의", "호스트 비트가 켜져 있습니다. 네트워크 주소는 " + toStr(net) + "/" + len + "입니다."]);
      rows.push(["네트워크", toStr(net) + " (앞 " + len + "비트)"]);
      rows.push(["마스크", toStr(mk)]);
      rows.push(["주소 수", fmt(count) + "개"]);
      if (len <= 30) rows.push(["사용 가능", toStr(net + 1) + " – " + toStr(bc - 1)]);
      else if (len === 31) rows.push(["사용 가능", "두 주소 모두 (점대점 링크, RFC 3021)"]);
      if (len <= 30) rows.push(["브로드캐스트", toStr(bc)]);
      rows.push(["종류", kindOf(net)]);
    } else {
      var ml = maskLen(v);
      if (ml >= 8 && ml < 32) rows.push(["마스크", "서브넷 마스크로 읽으면 /" + ml + "입니다."]);
      rows.push(["종류", kindOf(v)]);
      rows.push(["32비트 값", fmt(v)]);
      rows.push(["2진수", "<code>" + bin(v) + "</code>"]);
    }
    return { title: text, rows: rows, href: m.length > 1 ? "w05-ip-nat.html#cidr" : "w05-ip-nat.html#addr" };
  }

  function macTip(text) {
    var b = text.split(":").map(function (h) { return parseInt(h, 16); }), rows = [];
    if (b.every(function (x) { return x === 255; })) {
      rows.push(["종류", "브로드캐스트. 같은 링크의 모든 어댑터가 받습니다."]);
    } else if (b.every(function (x) { return x === 0; })) {
      rows.push(["종류", "모두 0. ARP 요청의 \"찾는 MAC\" 칸처럼 아직 모르는 값을 뜻합니다."]);
    } else {
      rows.push(["그룹 비트", (b[0] & 1) ? "1 = 멀티캐스트" : "0 = 유니캐스트"]);
      rows.push(["로컬 비트", (b[0] & 2) ? "1 = 로컬 관리 주소 (예: 무작위 MAC)" : "0 = 제조사가 정한 전역 주소"]);
      rows.push(["OUI", text.slice(0, 8).toUpperCase() + " (앞 24비트)"]);
    }
    rows.push(["첫 바이트", "<code>" + ("0000000" + b[0].toString(2)).slice(-8) + "</code>"]);
    return { title: text, rows: rows, href: "w07-ethernet-arp.html#mac" };
  }

  function v6Tip(text) {
    var t = text.toLowerCase(), k;
    if (t === "::") k = "\"주소 없음\". 연속된 0 부분을 줄여 쓰는 기호이기도 합니다.";
    else if (t === "::1") k = "루프백 (자기 자신)";
    else if (/^fe[89ab]/.test(t)) k = "링크 로컬. 같은 링크 안에서만 씁니다.";
    else if (/^f[cd]/.test(t)) k = "고유 로컬 주소(ULA). IPv4의 사설 주소와 비슷합니다.";
    else if (/^2001:0?db8/.test(t)) k = "문서용 예시 주소 (2001:db8::/32)";
    else if (/^ff/.test(t)) k = "멀티캐스트";
    else if (/^[23]/.test(t)) k = "전역 유니캐스트 (인터넷에서 라우팅됨)";
    else k = "IPv6 주소";
    var rows = [["종류", k], ["길이", "128비트. 16비트씩 8부분을 16진수로 씁니다. :: 는 한 번만 씁니다."]];
    if (/^2001:e60/.test(t)) rows.unshift(["역할", "KT가 핫스팟을 통해 노트북에 준 전역 주소입니다(뒷부분은 가림)."]);
    return { title: text, rows: rows, href: "w05-ip-nat.html#v6" };
  }

  function maskedTip(text) {
    var rows = [["뜻", "개인정보 보호를 위해 뒷부분을 가린 주소입니다. 앞부분으로 어느 기관의 대역인지는 알 수 있습니다."]];
    if (/^163\.152\./.test(text)) rows.unshift(["역할", "캠퍼스 NAT의 공인 주소(고려대학교 대역)입니다."]);
    if (/^118\.235\./.test(text)) rows.unshift(["역할", "핫스팟의 공인 주소(KT 대역)입니다."]);
    return { title: text, rows: rows, href: "w05-ip-nat.html#nat" };
  }

  // ---------- 패턴 ----------
  var OCT = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
  var IP_RE = "(?<![\\d.])" + OCT + "(?:\\." + OCT + "){3}(?:\\/(?:3[0-2]|[12]?\\d))?(?![\\d]|\\.\\d)";
  var MASKED_RE = "(?<![\\d.])\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.x{1,3}(?![\\w])";
  var MAC_RE = "(?<![0-9A-Fa-f:])[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}(?![0-9A-Fa-f:])";
  var V6_WHOLE = /^(?:[0-9a-f]{0,4}:){2,7}[0-9a-fx]{0,4}(?:…)?$|^::1?$/i;

  var termIndex = {}, aliases = [];
  TERMS.forEach(function (t, i) {
    t[0].forEach(function (a) { termIndex[a] = i; aliases.push(a); });
  });
  aliases.sort(function (a, b) { return b.length - a.length; });
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"); }
  var TERM_RE = aliases.map(function (a) {
    // 라틴 문자로 된 용어는 앞뒤가 다른 라틴 문자로 이어지지 않을 때만 찾습니다.
    return /^[A-Za-z]/.test(a) ? "(?<![A-Za-z0-9])" + esc(a) + "(?![A-Za-z0-9])" : esc(a);
  }).join("|");

  var ALL = new RegExp("(" + MASKED_RE + ")|(" + IP_RE + ")|(" + MAC_RE + ")|(" + TERM_RE + ")", "g");
  var ADDR = new RegExp("(" + MASKED_RE + ")|(" + IP_RE + ")|(" + MAC_RE + ")", "g");

  // ---------- 본문에 표시 붙이기 ----------
  var SKIP = "script,style,a,button,nav,.toc,.pager,.tip,.brand,.eyebrow,.tag,textarea,.legend,svg";
  var NO_TERMS = "h1,h2,h3,h4,pre,th,#glossary,summary,.tbl td:first-child code";
  var seen = new WeakMap();
  var store = [];

  function scopeOf(el) { return el.closest("section.sec, .hero, main") || document.body; }
  function firstTime(el, key) {
    var sc = scopeOf(el), s = seen.get(sc);
    if (!s) { s = new Set(); seen.set(sc, s); }
    if (s.has(key)) return false;
    s.add(key);
    return true;
  }
  function makeSpan(text, data, kind) {
    var sp = document.createElement("span");
    sp.className = "tip tip-" + kind;
    sp.textContent = text;
    sp.tabIndex = 0;
    sp.dataset.tip = String(store.push(data) - 1);
    return sp;
  }
  function tipFor(m) {
    if (m[1]) return [maskedTip(m[1]), "addr"];
    if (m[2]) return [ipTip(m[2]), "addr"];
    if (m[3]) return [macTip(m[3]), "addr"];
    return null;
  }

  function annotate(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p || !n.nodeValue.trim() || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var p = node.parentElement, text = node.nodeValue;
      // IPv6는 <code> 하나가 통째로 주소일 때만 붙입니다.
      if (p.tagName === "CODE" && p.childNodes.length === 1 && V6_WHOLE.test(text.trim()) && /[a-f:]/i.test(text) && text.indexOf(":") >= 0 && !new RegExp("^" + MAC_RE + "$").test(text.trim())) {
        p.replaceChild(makeSpan(text, v6Tip(text.trim()), "addr"), node);
        return;
      }
      var termsOk = !p.closest(NO_TERMS);
      var re = termsOk ? ALL : ADDR, frag = null, last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        var data = null, kind = "addr", tf = tipFor(m);
        if (tf) { data = tf[0]; }
        else if (m[4]) {
          var i = termIndex[m[4]];
          if (i === undefined || !firstTime(p, i)) continue;
          var t = TERMS[i];
          data = { title: t[1], rows: [["", t[2]]], href: t[3] };
          kind = "term";
        }
        if (!data) continue;
        frag = frag || document.createDocumentFragment();
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        frag.appendChild(makeSpan(m[0], data, kind));
        last = m.index + m[0].length;
      }
      if (frag) {
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        p.replaceChild(frag, node);
      }
    });

    // 그림(SVG) 안의 주소: 요소를 감싸지 않고 그 text/tspan 요소에 직접 붙입니다.
    root.querySelectorAll("svg text, svg tspan").forEach(function (el) {
      if (el.querySelector("tspan")) return;
      var s = el.textContent, m;
      ADDR.lastIndex = 0;
      if (!(m = ADDR.exec(s))) return;
      var tf = tipFor(m);
      el.classList.add("svg-tip");
      el.setAttribute("tabindex", "0");
      el.dataset.tip = String(store.push(tf[0]) - 1);
    });
  }

  // ---------- 설명 창 ----------
  var box, hideTimer, current = null;
  function build() {
    box = document.createElement("div");
    box.className = "tipbox";
    box.id = "tipbox";
    box.setAttribute("role", "tooltip");
    box.hidden = true;
    document.body.appendChild(box);
    box.addEventListener("pointerenter", function () { clearTimeout(hideTimer); });
    box.addEventListener("pointerleave", scheduleHide);
  }
  function render(d) {
    var here = location.pathname.split("/").pop() || "index.html";
    var html = "<b class=\"tipbox-t\">" + d.title + "</b>";
    d.rows.forEach(function (r) {
      html += r[0] ? "<div class=\"tipbox-r\"><span>" + r[0] + "</span><span>" + r[1] + "</span></div>"
                   : "<p>" + r[1] + "</p>";
    });
    if (d.href && d.href.split("#")[0] !== here) html += "<a class=\"tipbox-a\" href=\"" + d.href + "\">자세히 →</a>";
    else if (d.href) html += "<a class=\"tipbox-a\" href=\"#" + d.href.split("#")[1] + "\">이 페이지의 설명 →</a>";
    box.innerHTML = html;
  }
  function show(el) {
    clearTimeout(hideTimer);
    var d = store[Number(el.dataset.tip)];
    if (!d) return;
    current = el;
    render(d);
    box.hidden = false;
    el.setAttribute("aria-describedby", "tipbox");
    var r = el.getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), document.documentElement.clientWidth - bw - 8);
    var top = r.bottom + 8;
    if (top + bh > window.innerHeight - 8 && r.top - bh - 8 > 8) top = r.top - bh - 8;
    box.style.left = (left + window.scrollX) + "px";
    box.style.top = (top + window.scrollY) + "px";
  }
  function hide() {
    if (current) current.removeAttribute("aria-describedby");
    current = null;
    box.hidden = true;
  }
  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 180); }

  function target(e) { return e.target.closest && e.target.closest(".tip, .svg-tip"); }

  document.addEventListener("DOMContentLoaded", function () {
    var main = document.querySelector("main");
    if (!main) return;
    annotate(main);
    build();
    document.addEventListener("pointerover", function (e) {
      var t = target(e);
      if (t && e.pointerType !== "touch") show(t);
    });
    document.addEventListener("pointerout", function (e) {
      var t = target(e);
      if (t && !(e.relatedTarget && (t.contains(e.relatedTarget) || box.contains(e.relatedTarget)))) scheduleHide();
    });
    document.addEventListener("focusin", function (e) { var t = target(e); if (t) show(t); });
    document.addEventListener("focusout", function (e) { if (target(e)) scheduleHide(); });
    // 터치: 누르면 열고, 같은 것을 다시 누르거나 바깥을 누르면 닫습니다.
    document.addEventListener("click", function (e) {
      var t = target(e);
      if (t) { if (current === t && !box.hidden) hide(); else show(t); }
      else if (!box.contains(e.target)) hide();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
    // 휴대폰에서 주소창이 접히면 높이만 바뀝니다. 너비가 바뀔 때만 닫습니다.
    var lastW = window.innerWidth;
    window.addEventListener("resize", function () {
      if (window.innerWidth !== lastW) { lastW = window.innerWidth; hide(); }
    });
  });
})();
