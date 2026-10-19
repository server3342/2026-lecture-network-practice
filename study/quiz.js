// 개념 점검 문제. 문제 데이터와 채점, 약점 정리, 답안 내보내기.
// 답과 채점 결과는 이 브라우저의 localStorage에만 저장합니다.
(function () {
  "use strict";

  // ---------- 주차 ----------
  var WEEKS = [
    { key: "dns", cls: "wk-dns", n: "3", title: "3주차 · DNS와 CDN", page: "w03-dns.html" },
    { key: "tcp", cls: "wk-tcp", n: "4", title: "4주차 · TCP", page: "w04-tcp.html" },
    { key: "ip",  cls: "wk-ip",  n: "5", title: "5주차 · IP와 NAT", page: "w05-ip-nat.html" },
    { key: "rt",  cls: "wk-rt",  n: "6", title: "6주차 · 라우팅", page: "w06-routing.html" },
    { key: "eth", cls: "wk-eth", n: "7", title: "7주차 · 이더넷과 ARP", page: "w07-ethernet-arp.html" },
    { key: "all", cls: "", n: "★", title: "종합 · 요청 한 번", page: "flow.html" }
  ];

  // ---------- 문제 ----------
  // type: mc(객관식) | fill(빈칸, 계산) | free(서술)
  // topic: [링크, 절 이름]. 약점 정리는 이 단위로 묶습니다.
  var Q = [
    // ===== 3주차 =====
    { id: "d1", wk: "dns", type: "mc", topic: ["w03-dns.html#rec", "1.4 재귀 질의와 반복 질의"],
      q: "노트북이 로컬 DNS 서버에 보내는 질의와, 로컬 DNS 서버가 루트 서버에 보내는 질의의 종류는 각각 무엇입니까?",
      opts: ["재귀 질의 / 반복 질의", "반복 질의 / 재귀 질의", "둘 다 재귀 질의", "둘 다 반복 질의"], ans: 0,
      ex: "노트북은 답을 끝까지 받기를 원하므로 재귀 질의(RD=1)를 보냅니다. 로컬 DNS 서버는 루트, TLD, 권한 서버에 차례로 반복 질의를 보냅니다. 루트 서버는 재귀를 해 주지 않습니다." },
    { id: "d2", wk: "dns", type: "mc", topic: ["w03-dns.html#deleg", "1.7 위임과 glue 레코드"],
      q: "리졸버가 루트 서버에 <code>www.korea.ac.kr A</code>를 물었습니다. 응답의 모양으로 맞는 것은?",
      opts: ["Answer 0개, Authority에 <code>kr</code>의 NS, Additional에 그 NS의 A(glue), AA=0",
             "Answer에 <code>www.korea.ac.kr</code>의 A, AA=1",
             "Answer에 <code>kr</code>의 NS, AA=1",
             "응답 코드 NXDOMAIN"], ans: 0,
      ex: "루트 서버는 <code>kr</code>을 누가 담당하는지만 압니다. 그래서 답(Answer) 대신 위임(Authority의 NS)을 줍니다. 권한 있는 답이 아니므로 AA=0입니다. NS의 주소는 Additional에 glue로 함께 옵니다." },
    { id: "d3", wk: "dns", type: "mc", topic: ["w03-dns.html#rr", "1.5 자원 레코드"],
      q: "NS 레코드의 Value에는 무엇이 들어 있습니까?",
      opts: ["네임서버의 호스트 이름", "네임서버의 IPv4 주소", "영역의 일련번호", "메일 서버의 우선순위와 이름"], ans: 0,
      ex: "NS의 Value는 이름입니다(예: <code>ns.korea.ac.kr</code>). 주소가 아니므로, 연결하려면 그 이름의 A 레코드가 따로 필요합니다. 그래서 glue가 있습니다." },
    { id: "d4", wk: "dns", type: "free", topic: ["w03-dns.html#deleg", "1.7 위임과 glue 레코드"],
      q: "glue 레코드는 왜 필요합니까? 위임에 glue가 없으면 리졸버는 무엇을 합니까?",
      keys: ["NS 레코드는 이름만 주므로, 질의를 보내려면 그 이름의 주소가 따로 필요하다",
             "NS 이름이 위임되는 영역 안에 있으면(예: <code>ns.korea.ac.kr</code>) 그 주소를 묻는 질의가 다시 같은 영역으로 가서 순환한다. 그래서 부모가 주소를 함께 준다",
             "glue가 없으면 원래 해석을 잠시 멈추고, NS 이름의 주소를 루트부터 따로 해석한다",
             "그 주소를 얻은 뒤 원래 이름의 해석을 이어 간다"],
      ex: "Task 1 R3(glue 없는 위임 처리)이 이 내용입니다." },
    { id: "d5", wk: "dns", type: "fill", topic: ["w03-dns.html#cache", "1.9 DNS 캐시와 TTL"],
      q: "TTL이 20초인 레코드에 대해 t = 0, 5, 15, 21, 30, 39, 45초에 질의가 옵니다. 캐시는 처음에 비어 있습니다. 만료된 답을 한 번도 주지 않으려면 상류에 최소 몇 번 물어야 합니까?",
      fields: [{ label: "상류 질의 횟수", num: 3, unit: "번" }],
      ex: "t=0에 묻고 t=20까지 씁니다(5, 15는 캐시). t=21은 만료 후 첫 질의이므로 묻고 t=41까지 씁니다(30, 39는 캐시). t=45는 다시 만료 후 첫 질의입니다. 합계 3번. 이것이 Task 3의 하한(만료 후 첫 질의에서만 묻기)입니다." },
    { id: "d6", wk: "dns", type: "mc", topic: ["w03-dns.html#cache", "1.9 DNS 캐시와 TTL"],
      q: "Task 3에서 <code>www.microsoft.com</code>의 상류 질의가 baseline 52건에서 내 캐시 118건으로 늘었습니다. 맞는 해석은?",
      opts: ["baseline은 TTL(20초)이 지난 답을 계속 주어서 질의를 아꼈다. 118건이 정확한 캐시가 해야 하는 횟수다",
             "내 캐시가 TTL을 너무 짧게 잡아서 질의를 낭비했다",
             "baseline이 더 좋은 캐시이고 내 캐시는 이 이름에서만 퇴보했다",
             "CNAME 체인 때문에 질의가 두 배가 되었다"], ans: 0,
      ex: "질의를 줄이는 것보다 만료된 답을 주지 않는 것이 먼저입니다. TTL 20초짜리 이름은 자주 물어야 하는 것이 옳습니다." },
    { id: "d7", wk: "dns", type: "mc", topic: ["w03-dns.html#msg", "1.6 DNS 메시지 형식"],
      q: "UDP로 받은 DNS 응답의 헤더에 TC=1이 켜져 있습니다. 리졸버는 무엇을 해야 합니까?",
      opts: ["응답이 잘렸으므로 같은 질의를 TCP로 다시 보낸다", "권한 있는 답이므로 그대로 캐시한다",
             "재귀가 거부되었으므로 다른 서버에 묻는다", "DNSSEC 검증에 실패했으므로 버린다"], ans: 0,
      ex: "TC(truncated)는 응답이 UDP 메시지에 다 들어가지 않았다는 뜻입니다. 리졸버는 TCP 53번으로 다시 묻습니다." },
    { id: "d8", wk: "dns", type: "free", topic: ["w03-dns.html#cdn", "1.11 CDN과 DNS 유도"],
      q: "CDN의 권한 DNS 서버가 \"가까운 서버\"를 고를 때 실제로 보는 주소는 누구의 것입니까? 노트북이 공용 리졸버(예: Quad9)를 쓰면 어떤 일이 생길 수 있고, 이 프로젝트의 측정에서는 어땠습니까?",
      keys: ["권한 서버가 보는 출발지 주소는 사용자(노트북)가 아니라 리졸버의 주소다",
             "공용 리졸버가 사용자와 먼 곳에 있으면 먼 CDN 서버로 유도될 수 있다",
             "보완책으로 리졸버가 사용자 서브넷 일부를 전달하는 방법(EDNS Client Subnet)이 있다",
             "측정: 캠퍼스 리졸버의 답은 모두 5–7 ms, Quad9의 답은 네 곳에서 29–292 ms였다"],
      ex: "다른 주소가 곧 먼 위치는 아닙니다(Fastly는 주소가 달라도 지연이 같았습니다). 거리는 각 답 주소까지의 연결 시간으로 따로 재야 합니다." },

    // ===== 4주차 =====
    { id: "t1", wk: "tcp", type: "mc", topic: ["w04-tcp.html#mux", "2.2 포트 번호와 다중화"],
      q: "두 클라이언트가 같은 서버의 443번 포트에 접속했습니다. 서버의 운영체제는 들어온 세그먼트를 어느 소켓에 줄지 무엇으로 정합니까?",
      opts: ["(출발지 IP, 출발지 포트, 목적지 IP, 목적지 포트) 4개", "목적지 포트 443 하나",
             "(목적지 IP, 목적지 포트) 2개", "순서 번호"], ans: 0,
      ex: "TCP는 연결마다 상태가 따로 있습니다. 목적지가 같은 두 연결은 출발지 주소와 포트로만 구분됩니다. UDP 소켓은 (목적지 IP, 목적지 포트) 2개로 구분합니다." },
    { id: "t2", wk: "tcp", type: "mc", topic: ["w04-tcp.html#udp", "2.3 UDP"],
      q: "UDP가 IP 위에 더해 주는 것만 모두 고른 것은?",
      opts: ["포트 번호(다중화)와 체크섬", "포트 번호, 체크섬, 재전송", "포트 번호, 순서 보장, 흐름 제어", "체크섬과 혼잡 제어"], ans: 0,
      ex: "UDP 헤더는 8바이트(출발지 포트, 목적지 포트, 길이, 체크섬)뿐입니다. 신뢰성과 혼잡 제어는 응용(예: QUIC)이 직접 만들어야 합니다." },
    { id: "t3", wk: "tcp", type: "fill", topic: ["w04-tcp.html#pipe", "2.5 정지-대기, 파이프라이닝, GBN, SR"],
      q: "선택적 반복(SR)에서 윈도우 크기가 4입니다. 수신 측이 새 패킷과 재전송된 옛 패킷을 혼동하지 않으려면 순서 번호가 최소 몇 개 있어야 합니까?",
      fields: [{ label: "순서 번호 개수", num: 8, unit: "개" }],
      ex: "SR에서는 윈도우 크기 ≤ 순서 번호 공간 / 2이어야 합니다. 그러므로 최소 2 × 4 = 8개입니다. 더 적으면 ACK가 모두 손실된 경우 송신 측의 재전송을 수신 측이 새 패킷으로 받습니다." },
    { id: "t4", wk: "tcp", type: "mc", topic: ["w04-tcp.html#pipe", "2.5 정지-대기, 파이프라이닝, GBN, SR"],
      q: "윈도우 안의 패킷 0–7을 보냈고 패킷 2만 손실되었습니다. 타임아웃 후 재전송하는 패킷은?",
      opts: ["GBN: 2–7 전부 / SR: 2만", "GBN: 2만 / SR: 2–7 전부", "둘 다 2만", "둘 다 2–7 전부"], ans: 0,
      ex: "GBN 수신 측은 순서가 어긋난 패킷을 버리므로 2부터 전부 다시 보내야 합니다. SR 수신 측은 3–7을 버퍼에 두고 개별 ACK를 보내므로 2만 다시 보냅니다." },
    { id: "t5", wk: "tcp", type: "fill", topic: ["w04-tcp.html#hs", "2.7 3-way handshake"],
      q: "클라이언트의 ISN이 1000입니다. 핸드셰이크 뒤 클라이언트가 첫 데이터 세그먼트로 500바이트를 보냈습니다.",
      fields: [{ label: "SYN-ACK의 ack 번호", num: 1001 },
               { label: "첫 데이터 세그먼트의 seq 번호", num: 1001 },
               { label: "그 데이터에 대한 서버의 ack 번호", num: 1501 }],
      ex: "SYN은 데이터가 없어도 순서 번호 1개를 씁니다. 그래서 첫 데이터 바이트는 1001이고 SYN-ACK의 ack도 1001입니다. 500바이트(1001–1500)를 받은 서버의 ack는 다음에 기대하는 번호 1501입니다." },
    { id: "t6", wk: "tcp", type: "fill", topic: ["w04-tcp.html#rtt", "2.8 RTT 추정과 타임아웃"],
      q: "EstimatedRTT가 100 ms이고 새 SampleRTT가 140 ms입니다. α = 0.125일 때 새 EstimatedRTT는?",
      fields: [{ label: "EstimatedRTT", num: 105, tol: 0.01, unit: "ms" }],
      ex: "EstimatedRTT = (1 − α) × 100 + α × 140 = 87.5 + 17.5 = 105 ms. 지수 가중 이동 평균이라 한 번의 큰 표본에 크게 흔들리지 않습니다." },
    { id: "t7", wk: "tcp", type: "fill", topic: ["w04-tcp.html#bdp", "2.10 처리량, RTT, 대역폭-지연 곱"],
      q: "링크 100 Mbps, RTT 20 ms입니다. 링크를 꽉 채우려면 윈도우가 최소 몇 KB여야 합니까? (1 KB = 1000 바이트)",
      fields: [{ label: "BDP", num: 250, tol: 0.5, unit: "KB" }],
      ex: "100 × 10⁶ bit/s × 0.02 s = 2 × 10⁶ bit = 250,000 바이트 = 250 KB. 윈도우가 이보다 작으면 송신 측은 ACK를 기다리며 쉽니다." },
    { id: "t8", wk: "tcp", type: "fill", topic: ["w04-tcp.html#bdp", "2.10 처리량, RTT, 대역폭-지연 곱"],
      q: "윈도우 스케일 옵션이 없으면 수신 윈도우는 최대 65,535 바이트입니다. RTT가 50 ms일 때 이 연결의 최대 처리량은 약 몇 Mbps입니까?",
      fields: [{ label: "최대 처리량", num: 10.49, tol: 0.3, unit: "Mbps" }],
      ex: "처리량 ≤ 윈도우 / RTT = 65,535 × 8 bit / 0.05 s ≈ 10.5 Mbps. 링크가 1 Gbps여도 이 값을 넘을 수 없습니다. 그래서 윈도우 스케일 옵션이 있고, 측정에서 rwnd가 4.6 MB까지 열렸습니다." },
    { id: "t9", wk: "tcp", type: "free", topic: ["w04-tcp.html#cc", "2.12 슬로 스타트와 AIMD"],
      q: "TCP Reno에서 cwnd가 12 MSS일 때 중복 ACK 3개를 받았습니다. ssthresh와 cwnd는 어떻게 바뀝니까? 같은 상황에서 타임아웃이 났다면 무엇이 다르고, 왜 다르게 반응합니까?",
      keys: ["중복 ACK 3개: ssthresh = cwnd / 2 = 6 MSS",
             "중복 ACK 3개: cwnd = 6 MSS(+3, 빠른 회복)에서 다시 선형 증가(혼잡 회피)",
             "타임아웃: ssthresh = 6 MSS, cwnd = 1 MSS로 줄이고 슬로 스타트를 다시 시작",
             "이유: 중복 ACK는 뒤 세그먼트가 아직 도착하고 있다는 뜻(가벼운 혼잡), 타임아웃은 아무것도 도착하지 않는다는 뜻(심한 혼잡)"],
      ex: "Task 3에서 손실과 큐를 함께 줄인 것도 이 두 신호를 어떻게 다루느냐의 문제였습니다." },
    { id: "t10", wk: "tcp", type: "mc", topic: ["w04-tcp.html#quic", "2.13 QUIC"],
      q: "HTTP/2 over TCP에서 패킷 하나가 손실되면 그 연결의 모든 스트림이 기다립니다. QUIC이 이 문제를 줄이는 방법은?",
      opts: ["스트림마다 순서를 따로 관리하므로 손실된 스트림만 기다린다", "UDP를 써서 손실된 패킷을 다시 보내지 않는다",
             "패킷을 두 번씩 보낸다", "TLS를 쓰지 않아 지연이 줄어든다"], ans: 0,
      ex: "TCP는 바이트 스트림 하나만 압니다. 그래서 손실 하나가 뒤의 모든 바이트를 막습니다(HOL 블로킹). QUIC은 UDP 위에서 스트림별 순서와 재전송을 직접 합니다. TLS 1.3은 QUIC 안에 들어 있습니다." },

    // ===== 5주차 =====
    { id: "i1", wk: "ip", type: "free", topic: ["w05-ip-nat.html#plane", "3.1 포워딩과 라우팅"],
      q: "포워딩과 라우팅의 차이를 범위, 평면, 시간 규모로 설명하십시오. 둘은 어떻게 연결됩니까?",
      keys: ["포워딩: 라우터 하나가 들어온 패킷을 어느 출력 포트로 보낼지 정하는 일(데이터 평면)",
             "라우팅: 출발지에서 목적지까지 망 전체의 경로를 정하는 일(제어 평면)",
             "시간 규모: 포워딩은 패킷마다 나노초 단위(하드웨어), 라우팅은 초 단위(소프트웨어)",
             "라우팅의 결과가 포워딩 테이블이 되고, 포워딩은 그 테이블을 조회한다"],
      ex: "6주차의 OSPF가 만든 테이블을 5주차의 최장 프리픽스 일치가 조회합니다." },
    { id: "i2", wk: "ip", type: "fill", topic: ["w05-ip-nat.html#cidr", "3.5 서브넷, 마스크, CIDR"],
      q: "호스트 주소 <code>10.20.30.77/27</code>이 속한 서브넷을 구하십시오.",
      fields: [{ label: "네트워크 주소", text: ["10.20.30.64"] },
               { label: "브로드캐스트 주소", text: ["10.20.30.95"] },
               { label: "사용 가능한 호스트 수", num: 30, unit: "개" }],
      ex: "/27은 호스트 비트 5개, 블록 크기 32입니다. 77은 64–95 블록에 있습니다. 네트워크 .64, 브로드캐스트 .95, 사용 가능한 주소는 32 − 2 = 30개입니다." },
    { id: "i3", wk: "ip", type: "mc", topic: ["w05-ip-nat.html#lpm", "3.7 최장 프리픽스 일치"],
      q: "포워딩 테이블이 <code>10.0.0.0/8 → A</code>, <code>10.1.0.0/16 → B</code>, <code>10.1.2.0/24 → C</code>, <code>0.0.0.0/0 → D</code>입니다. 목적지 <code>10.1.3.5</code>는 어디로 갑니까?",
      opts: ["B", "C", "A", "D"], ans: 0,
      ex: "/8(10.)과 /16(10.1.)은 일치합니다. /24는 10.1.2.x만 일치하므로 10.1.3.5와 맞지 않습니다. 일치한 것 중 가장 긴 /16의 B를 고릅니다." },
    { id: "i4", wk: "ip", type: "mc", topic: ["w05-ip-nat.html#private", "3.6 사설 주소와 특수 주소"],
      q: "다음 중 사설 주소(RFC 1918)가 <b>아닌</b> 것은?",
      opts: ["172.32.0.1", "172.31.200.1", "10.255.1.1", "192.168.0.1"], ans: 0,
      ex: "사설 대역은 10.0.0.0/8, 172.16.0.0/12(172.16–172.31), 192.168.0.0/16입니다. 172.32는 /12 밖입니다. 100.64.0.0/10은 통신사 NAT용 공유 주소로, RFC 1918과 따로 정해져 있습니다." },
    { id: "i5", wk: "ip", type: "mc", topic: ["w05-ip-nat.html#dgram", "3.3 IPv4 데이터그램"],
      q: "traceroute가 경로의 라우터를 하나씩 알아내는 원리는?",
      opts: ["TTL을 1, 2, 3…으로 늘려 보내고, TTL이 0이 된 라우터가 돌려주는 ICMP Time Exceeded를 받는다",
             "라우터마다 자기 주소를 IP 헤더 옵션에 적어 준다",
             "목적지 서버가 경로 목록을 응답에 넣어 준다",
             "OSPF 데이터베이스를 조회한다"], ans: 0,
      ex: "라우터는 TTL을 1 줄이고 0이 되면 버리면서 ICMP를 보냅니다. 그 ICMP의 출발지 주소가 그 홉입니다." },
    { id: "i6", wk: "ip", type: "free", topic: ["w05-ip-nat.html#dhcp", "3.9 DHCP"],
      q: "DHCP의 네 메시지를 순서대로 쓰고, Discover와 Request가 브로드캐스트인 이유를 각각 설명하십시오.",
      keys: ["순서: Discover → Offer → Request → ACK (DORA)",
             "Discover는 0.0.0.0 → 255.255.255.255: 클라이언트는 자기 주소도 서버 주소도 모른다",
             "Request도 브로드캐스트: 여러 서버가 Offer했을 수 있으므로, 어느 서버의 제안을 골랐는지 모두에게 알린다",
             "ACK로 주소와 임대 시간이 확정되고, 갱신할 때는 서버에 유니캐스트로 Request를 보낸다"],
      ex: "Task 2의 DORA 캡처에서 Discover의 출발지가 0.0.0.0인 것을 확인했습니다." },
    { id: "i7", wk: "ip", type: "mc", topic: ["w05-ip-nat.html#nat", "3.10 NAT"],
      q: "집 공유기(NAT) 안의 노트북에서 서버를 열었습니다. 밖에서 공유기의 공인 주소로 처음 접속하면 연결되지 않습니다. 이유는?",
      opts: ["NAT 변환 표에 그 (공인 주소, 포트)에 맞는 내부 항목이 없다", "공인 주소는 TCP를 받을 수 없다",
             "TTL이 공유기에서 0이 된다", "사설 주소는 ARP에 응답하지 않는다"], ans: 0,
      ex: "NAT는 안에서 밖으로 나간 연결만 표에 기록합니다. 밖에서 먼저 온 패킷은 누구에게 줄지 모릅니다. 포트 포워딩은 이 항목을 손으로 넣는 일입니다." },
    { id: "i8", wk: "ip", type: "mc", topic: ["w05-ip-nat.html#v6", "3.11 IPv6"],
      q: "IPv4 헤더에 있었지만 IPv6 기본 헤더에서 없어진 것은?",
      opts: ["헤더 체크섬", "홉 제한(hop limit)", "흐름 레이블(flow label)", "출발지 주소"], ans: 0,
      ex: "IPv6는 헤더 체크섬을 없앴습니다. 링크 계층과 전송 계층이 이미 검사하고, 라우터가 홉마다 다시 계산하지 않아도 됩니다. 라우터에서의 단편화도 없앴습니다. TTL은 hop limit이 되었습니다." },
    { id: "i9", wk: "ip", type: "mc", topic: ["w05-ip-nat.html#fast", "3.8 빠른 최장 프리픽스 일치"],
      q: "DIR-24-8 방식의 조회 시간은 무엇에 따라 달라집니까?",
      opts: ["테이블 크기와 관계없이 거의 일정하다(배열 읽기 1–2번)", "항목 수에 비례한다",
             "프리픽스 길이의 종류 수에 비례한다", "log(항목 수)에 비례한다"], ans: 0,
      ex: "상위 24비트로 큰 배열을 바로 읽습니다. /24보다 긴 프리픽스만 두 번째 표를 읽습니다. 대가는 항목 수와 관계없는 64 MB 메모리와 느린 추가입니다." },

    // ===== 6주차 =====
    { id: "r1", wk: "rt", type: "fill", topic: ["w06-routing.html#ls", "4.3 링크 상태 라우팅과 다익스트라"],
      q: "링크와 비용: u–v 2, u–x 1, u–w 5, v–x 2, v–w 3, x–w 3, x–y 1, y–w 1, w–z 5, y–z 2. u에서 다익스트라를 실행합니다.",
      fields: [{ label: "u → z 최소 비용", num: 4 },
               { label: "u의 테이블에서 z로 가는 첫 홉", text: ["x"] }],
      ex: "x(1), v(2), y(2: u-x-y), w(3: u-x-y-w), z(4: u-x-y-z) 순서로 확정됩니다. 경로가 u-x-y-z이므로 첫 홉은 x입니다. 라우터는 경로 전체가 아니라 첫 홉만 저장합니다." },
    { id: "r2", wk: "rt", type: "mc", topic: ["w06-routing.html#hop", "4.4 라우터가 저장하는 것: 첫 홉"],
      q: "비용이 같은 다음 홉 두 개를 모두 설치했습니다(ECMP). 트래픽을 패킷 단위가 아니라 흐름(5-튜플 해시) 단위로 나누는 이유는?",
      opts: ["두 경로의 지연이 달라 한 TCP 연결의 패킷 순서가 바뀌는 것을 막기 위해", "해시 계산이 패킷 단위보다 빨라서",
             "OSPF가 패킷 단위 분배를 금지해서", "흐름 단위로 나누면 대역폭이 두 배가 되어서"], ans: 0,
      ex: "순서가 바뀐 세그먼트는 중복 ACK를 만들고, TCP는 이것을 손실로 보고 cwnd를 줄입니다." },
    { id: "r3", wk: "rt", type: "fill", topic: ["w06-routing.html#dv", "4.5 거리 벡터 라우팅"],
      q: "x의 이웃은 y(링크 비용 2)와 z(링크 비용 7)입니다. y는 D<sub>y</sub>(z) = 1, z는 D<sub>z</sub>(z) = 0을 알려 왔습니다. 벨만-포드 식으로 D<sub>x</sub>(z)는?",
      fields: [{ label: "D_x(z)", num: 3 }],
      ex: "D_x(z) = min{ c(x,y) + D_y(z), c(x,z) + D_z(z) } = min{2 + 1, 7 + 0} = 3. 직접 링크보다 y를 거치는 쪽이 쌉니다." },
    { id: "r4", wk: "rt", type: "free", topic: ["w06-routing.html#dv", "4.5 거리 벡터 라우팅"],
      q: "거리 벡터에서 링크 비용이 크게 오르면 무한 카운트가 생길 수 있습니다. 왜 생기고, poisoned reverse는 무엇을 하며, 그 한계는 무엇입니까?",
      keys: ["두 라우터가 서로를 경유지로 믿어, 상대가 말한 (이미 낡은) 거리에 비용을 더해 조금씩 올린다",
             "다른 경로가 더 싸질 때까지 교환이 반복되어 나쁜 소식이 느리게 퍼진다",
             "poisoned reverse: z가 y를 거쳐 x로 간다면, z는 y에게 D_z(x) = ∞라고 알린다",
             "한계: 세 개 이상의 라우터가 만드는 루프는 막지 못한다"],
      ex: "링크 상태는 각자 전체 지도로 계산하므로 이 문제가 없습니다(4.6 비교)." },
    { id: "r5", wk: "rt", type: "mc", topic: ["w06-routing.html#ospf", "4.7 OSPF"],
      q: "Hello 10초, Dead 40초인 OSPF에서 링크를 끊었더니 0.4초 만에 재수렴했습니다. 같은 망에서 Dead 타이머(최대 40초)를 기다려야 하는 고장은?",
      opts: ["인터페이스는 살아 있는데 패킷만 전달되지 않는 조용한 고장", "케이블을 뽑은 경우",
             "관리자가 링크 비용을 바꾼 경우", "인터페이스를 shutdown한 경우"], ans: 0,
      ex: "케이블을 뽑거나 shutdown하면 반송파가 끊겨 라우터가 바로 압니다. 조용한 고장은 Hello가 끊긴 것으로만 알 수 있으므로 Dead 간격이 걸립니다." },
    { id: "r6", wk: "rt", type: "free", topic: ["w06-routing.html#reconv", "4.8 장애와 재수렴"],
      q: "링크 상태 라우팅에서 장애 후 재수렴은 어떤 단계를 거칩니까? 측정에서 가장 오래 걸린 부분은 무엇이었습니까?",
      keys: ["감지: 인접 라우터가 고장을 안다(반송파 끊김은 즉시, 조용한 고장은 Dead 간격)",
             "새 LSA를 만들어 모든 라우터에 플러딩한다",
             "각 라우터가 SPF(다익스트라)를 다시 실행하고 포워딩 테이블을 설치한다",
             "계산보다 감지가 느리다. 복구에서는 LSA가 MinLSArrival로 버려지고 RxmtInterval(5초) 뒤 재전송되어 5.23초가 걸렸다"],
      ex: "SPF 자체는 밀리초입니다. 그래서 Task 3의 SPF 절감은 벽시계 시간에서는 작은 몫입니다." },
    { id: "r7", wk: "rt", type: "mc", topic: ["w06-routing.html#incr", "4.10 SPF를 덜 돌리기"],
      q: "링크 (a, b)의 비용이 c_old에서 올라갔습니다. SPF를 다시 실행하지 않아도 되는 조건은?",
      opts: ["그 링크가 어떤 최단 경로에도 쓰이지 않을 때: dist[a] + c_old > dist[b]이고 dist[b] + c_old > dist[a]",
             "a와 b가 모두 출발지의 직접 이웃일 때", "새 비용이 c_old의 두 배 이하일 때", "비용이 오를 때는 항상 생략해도 된다"], ans: 0,
      ex: "최단 경로에 쓰이지 않는 링크가 더 비싸져도 어떤 거리도 바뀌지 않습니다. 쓰이는 링크라면 그 링크를 지나던 목적지들의 거리가 바뀔 수 있습니다." },
    { id: "r8", wk: "rt", type: "mc", topic: ["w06-routing.html#trace", "4.9 traceroute로 본 남의 라우팅"],
      q: "traceroute의 5번 홉이 <code>* * *</code>이고 6번 홉부터는 정상으로 응답합니다. 맞는 해석은?",
      opts: ["5번 라우터가 ICMP를 보내지 않거나 제한했을 뿐, 패킷은 그 라우터를 지나갔다", "5번 홉에서 경로가 끊겼다",
             "5번 홉은 NAT이다", "패킷이 5번 홉에서 루프를 돈다"], ans: 0,
      ex: "6번 홉이 응답했다는 것은 TTL 6짜리 패킷이 5번을 지나갔다는 증거입니다." },

    // ===== 7주차 =====
    { id: "e1", wk: "eth", type: "fill", topic: ["w07-ethernet-arp.html#err", "5.2 오류 검출"],
      q: "데이터 D = <code>101110</code>, 생성 다항식 G = <code>1001</code>(r = 3)입니다. CRC 비트 R은?",
      fields: [{ label: "R (3비트)", text: ["011"] }],
      ex: "D 뒤에 0을 3개 붙인 <code>101110000</code>을 G로 모듈로-2 나눗셈합니다. 나머지가 <code>011</code>입니다. 보내는 비트는 <code>101110011</code>이고, 수신 측이 이것을 G로 나눈 나머지가 0이 아니면 오류입니다." },
    { id: "e2", wk: "eth", type: "mc", topic: ["w07-ethernet-arp.html#err", "5.2 오류 검출"],
      q: "짝수 패리티 비트 1개로 검출할 수 <b>없는</b> 오류는?",
      opts: ["비트 2개가 바뀐 오류", "비트 1개가 바뀐 오류", "비트 3개가 바뀐 오류", "패리티 비트 자체가 바뀐 오류"], ans: 0,
      ex: "패리티 하나는 바뀐 비트 수가 홀수일 때만 검출합니다. 짝수 개가 바뀌면 1의 개수의 홀짝이 그대로입니다." },
    { id: "e3", wk: "eth", type: "mc", topic: ["w07-ethernet-arp.html#mac-proto", "5.3 다중 접속 프로토콜"],
      q: "Wi-Fi가 CSMA/CD 대신 CSMA/CA를 쓰는 주된 이유는?",
      opts: ["무선에서는 보내는 중에 충돌을 감지하기 어렵고, 서로 못 듣는 숨은 단말이 있다", "무선은 반송파 감지를 할 수 없다",
             "CSMA/CD는 1 Gbps 이상에서만 동작한다", "무선 프레임에는 MAC 주소가 없다"], ans: 0,
      ex: "자기 송신 신호가 받는 신호보다 훨씬 커서 충돌을 들을 수 없습니다. 그래서 충돌을 피하는 쪽(백오프, ACK, RTS/CTS)으로 설계했습니다." },
    { id: "e4", wk: "eth", type: "mc", topic: ["w07-ethernet-arp.html#arp", "5.5 ARP"],
      q: "A가 같은 서브넷의 B에게 ARP 요청을 보냈습니다. 두 ARP 테이블은 처음에 비어 있었습니다. B가 응답을 보낸 직후의 상태는?",
      opts: ["A와 B 모두 상대의 항목이 있다", "A에만 B의 항목이 있다", "B에만 A의 항목이 있다", "둘 다 비어 있다. 항목은 데이터 프레임 뒤에 생긴다"], ans: 0,
      ex: "요청 안에 A의 IP와 MAC이 들어 있습니다. B는 응답해야 하므로 A의 항목을 저장하고 그 MAC으로 유니캐스트 응답을 보냅니다. A는 응답에서 B의 항목을 얻습니다." },
    { id: "e5", wk: "eth", type: "free", topic: ["w07-ethernet-arp.html#offnet", "5.6 서브넷 밖으로 보내기"],
      q: "호스트 A는 라우터 R을 거쳐 다른 서브넷의 호스트 B에게 데이터그램을 보냅니다. A–R 링크와 R–B 링크에서 프레임의 출발지/목적지 MAC과 데이터그램의 출발지/목적지 IP는 각각 무엇입니까? (NAT 없음)",
      keys: ["A–R 링크: 출발지 MAC = A, 목적지 MAC = R의 왼쪽 인터페이스(게이트웨이)",
             "R–B 링크: 출발지 MAC = R의 오른쪽 인터페이스, 목적지 MAC = B",
             "두 링크 모두 IP는 출발지 A, 목적지 B로 그대로다",
             "A는 B가 아니라 게이트웨이의 IP를 ARP로 묻는다. R은 새 프레임을 만든다"],
      ex: "Task 2에서 ARP 테이블을 비우고 인터넷 서버에 접속했을 때, 테이블에 서버가 아니라 게이트웨이만 생긴 이유입니다." },
    { id: "e6", wk: "eth", type: "fill", topic: ["w07-ethernet-arp.html#switch", "5.8 스위치 자기 학습"],
      q: "4포트 스위치의 테이블이 비어 있습니다. A는 포트 1, B는 포트 2, C는 포트 3에 있습니다. 프레임이 A→B, B→A, C→A, A→C 순서로 지나갑니다.",
      fields: [{ label: "플러딩된 프레임 수", num: 1, unit: "개" },
               { label: "마지막 프레임(A→C)이 나가는 포트", num: 3 }],
      ex: "A→B: B를 모르므로 포트 2, 3, 4로 플러딩하고 A@1을 배웁니다. B→A: A를 알므로 포트 1로만 보내고 B@2를 배웁니다. C→A: 포트 1로 보내고 C@3을 배웁니다. A→C: 포트 3으로 보냅니다." },
    { id: "e7", wk: "eth", type: "mc", topic: ["w07-ethernet-arp.html#vs", "5.9 스위치와 라우터"],
      q: "ARP 요청(브로드캐스트 프레임)은 어디까지 퍼집니까?",
      opts: ["스위치는 모두 지나고, 라우터에서 멈춘다", "라우터도 지나 인터넷 전체로 퍼진다",
             "첫 스위치에서 멈춘다", "기본 게이트웨이에만 간다"], ans: 0,
      ex: "스위치는 브로드캐스트를 들어온 포트 외의 모든 포트로 보냅니다. 라우터는 링크 계층 프레임을 넘기지 않습니다. 그래서 라우터가 브로드캐스트 도메인을 나눕니다." },
    { id: "e8", wk: "eth", type: "mc", topic: ["w07-ethernet-arp.html#frame", "5.7 이더넷 프레임"],
      q: "이더넷 프레임의 EtherType 값이 <code>0x0806</code>입니다. 페이로드는 무엇입니까?",
      opts: ["ARP", "IPv4", "IPv6", "VLAN 태그"], ans: 0,
      ex: "0x0800 = IPv4, 0x0806 = ARP, 0x86DD = IPv6, 0x8100 = 802.1Q VLAN 태그입니다. 수신 측은 이 값으로 페이로드를 넘길 상위 프로토콜을 고릅니다." },
    { id: "e9", wk: "eth", type: "free", topic: ["w07-ethernet-arp.html#full", "5.10 스위치 테이블이 가득 찰 때"],
      q: "MAC flooding 공격은 무엇을 하고, 왜 공격자에게 이익입니까? Task 3에서 이것을 어떻게 막았습니까?",
      keys: ["위조한 출발지 MAC으로 프레임을 대량으로 보내 스위치 테이블을 채운다",
             "진짜 호스트의 항목이 밀려나면 그 목적지 프레임이 모든 포트로 플러딩된다",
             "공격자는 남의 트래픽을 받아 볼 수 있다(스위치가 허브처럼 동작)",
             "Task 3: count-min sketch로 빈도를 세어, 자주 안 쓰이는 항목을 내보내고 새 MAC 학습을 거절했다"],
      ex: "정확한 MAC별 횟수는 위조 MAC 수만큼 메모리가 늘어납니다. sketch는 크기가 고정입니다." },

    // ===== 종합 =====
    { id: "f1", wk: "all", type: "fill", topic: ["flow.html#overview", "3 전체 그림"],
      q: "노트북이 Wi-Fi에 막 연결되어 <code>https://</code> 주소를 엽니다. 다음을 일어나는 순서대로 기호로 쓰십시오. A: TCP SYN, B: DHCP Discover, C: DNS 질의, D: TLS ClientHello, E: HTTP GET",
      fields: [{ label: "순서 (예: ABCDE)", text: ["BCADE"], order: true }],
      ex: "주소를 먼저 받아야 합니다(B). 이름을 주소로 바꿔야 연결할 대상을 압니다(C). TCP 연결(A) 위에서 TLS를 맞추고(D) 암호화된 HTTP 요청(E)을 보냅니다." },
    { id: "f2", wk: "all", type: "fill", topic: ["flow.html#overview", "3 전체 그림"],
      q: "RTT 20 ms인 서버에 처음 접속합니다. DNS는 캐시에 없어 30 ms가 걸립니다. TLS 1.3(0-RTT 없음)을 쓰고, 전송 시간과 서버 처리 시간은 0으로 봅니다. 응답의 첫 바이트를 받을 때까지 몇 ms입니까?",
      fields: [{ label: "첫 바이트까지", num: 90, unit: "ms" }],
      ex: "DNS 30 + TCP 핸드셰이크 1 RTT + TLS 1.3 1 RTT + HTTP 요청·응답 1 RTT = 30 + 3 × 20 = 90 ms." },
    { id: "f3", wk: "all", type: "mc", topic: ["w07-ethernet-arp.html#offnet", "5.6 서브넷 밖으로 보내기"],
      q: "NAT가 없는 일반 라우터를 지날 때 바뀌지 <b>않는</b> 것은?",
      opts: ["목적지 IP 주소", "출발지 MAC 주소", "IP 헤더의 TTL", "IP 헤더 체크섬"], ans: 0,
      ex: "라우터는 새 프레임을 만들므로 MAC은 둘 다 바뀝니다. TTL을 1 줄이므로 헤더 체크섬도 다시 계산합니다. IP 주소는 그대로입니다." },
    { id: "f4", wk: "all", type: "free", topic: ["flow.html#overview", "3 전체 그림"],
      q: "<code>curl</code>의 <code>time_namelookup</code>, <code>time_connect</code>, <code>time_appconnect</code>, <code>time_starttransfer</code>로 느린 구간을 어떻게 나눕니까? 각 차이가 무엇에 해당하는지 쓰십시오.",
      keys: ["time_namelookup: DNS 해석 시간(캐시에 있으면 거의 0)",
             "time_connect − time_namelookup: TCP 핸드셰이크, 약 1 RTT",
             "time_appconnect − time_connect: TLS 핸드셰이크(TLS 1.3이면 약 1 RTT)",
             "time_starttransfer − time_appconnect: 요청이 가고 첫 바이트가 올 때까지(1 RTT + 서버 처리)"],
      ex: "핫스팟 첫 실행의 DNS 44.7 ms와 둘째 실행의 1.8 ms 차이가 namelookup에서 보였습니다." }
  ];

  // ---------- 저장 ----------
  var KEY = "quiz-v1";
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { state = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  // ---------- 도움 함수 ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function plain(html) { var d = document.createElement("div"); d.innerHTML = html; return d.textContent; }
  function wkOf(q) { for (var i = 0; i < WEEKS.length; i++) if (WEEKS[i].key === q.wk) return WEEKS[i]; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function shuffle(n) {
    var a = []; for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
    return a;
  }
  var KIND = { mc: "객관식", fill: "계산·빈칸", free: "서술" };

  function checkField(f, v) {
    v = (v || "").trim();
    if (!v) return false;
    if (f.num != null) {
      var x = parseFloat(v.replace(/,/g, ""));
      return !isNaN(x) && Math.abs(x - f.num) <= (f.tol || 0);
    }
    var norm = v.replace(/\s+/g, "").toLowerCase();
    if (f.order) norm = norm.replace(/[^a-z]/g, "");
    return f.text.some(function (t) { return t.toLowerCase() === norm; });
  }
  function fieldAnswer(f) { return f.num != null ? f.num + (f.unit ? " " + f.unit : "") : f.text[0]; }

  // ---------- 문제 카드 ----------
  var cards = {};
  function numberOf(q) {
    var w = wkOf(q), k = 0;
    for (var i = 0; i < Q.length; i++) { if (Q[i].wk === q.wk) k++; if (Q[i] === q) break; }
    return w.n + "." + k;
  }

  function renderCard(q) {
    var w = wkOf(q);
    var c = el("article", "qc " + w.cls);
    c.id = "q-" + q.id;
    c.appendChild(el("div", "qc-head",
      "<span class=\"qn\">Q" + numberOf(q) + "</span><span class=\"qk\">" + KIND[q.type] + "</span>" +
      "<a class=\"qt\" href=\"" + q.topic[0] + "\">" + esc(q.topic[1]) + "</a>"));
    c.appendChild(el("p", "qs", q.q));
    var body = el("div", "qc-body");
    c.appendChild(body);
    var fb = el("div", "fb"); fb.hidden = true;
    var actions = el("div", "qc-actions");
    var btn = el("button", "btn primary", q.type === "free" ? "모범 답과 비교" : "확인");
    btn.type = "button";
    var retry = el("button", "btn", "다시 풀기"); retry.type = "button"; retry.hidden = true;
    var msg = el("span", "qc-msg small muted");
    actions.appendChild(btn); actions.appendChild(retry); actions.appendChild(msg);
    c.appendChild(actions);
    c.appendChild(fb);

    var s = state[q.id] || {};
    if (q.type === "mc") {
      var order = shuffle(q.opts.length);
      order.forEach(function (oi) {
        var lab = el("label", "opt");
        lab.innerHTML = "<input type=\"radio\" name=\"" + q.id + "\" value=\"" + oi + "\"><span>" + q.opts[oi] + "</span>";
        body.appendChild(lab);
      });
      if (s.r != null) { var r = body.querySelector("input[value=\"" + s.r + "\"]"); if (r) r.checked = true; }
    } else if (q.type === "fill") {
      q.fields.forEach(function (f, i) {
        var lab = el("label", "fld");
        lab.innerHTML = "<span>" + esc(f.label) + "</span><input type=\"text\" autocomplete=\"off\" spellcheck=\"false\" data-i=\"" + i + "\">" +
          (f.unit ? "<em>" + esc(f.unit) + "</em>" : "");
        body.appendChild(lab);
        if (s.r && s.r[i] != null) lab.querySelector("input").value = s.r[i];
      });
    } else {
      var ta = el("textarea", "ans");
      ta.rows = 5; ta.placeholder = "보지 않고 먼저 쓰십시오. 핵심어만 써도 됩니다.";
      if (s.r) ta.value = s.r;
      ta.addEventListener("input", function () { (state[q.id] = state[q.id] || {}).r = ta.value; save(); });
      body.appendChild(ta);
    }

    function lock(on) { body.querySelectorAll("input, textarea").forEach(function (i) { i.disabled = on; }); }

    function showResult() {
      var st = state[q.id];
      fb.hidden = false;
      lock(true);
      btn.hidden = true;
      retry.hidden = false;
      msg.textContent = "";
      var html = "";
      if (q.type === "mc") {
        body.querySelectorAll(".opt").forEach(function (lab) {
          var v = Number(lab.querySelector("input").value);
          lab.classList.toggle("right", v === q.ans);
          lab.classList.toggle("wrong", v === st.r && v !== q.ans);
        });
        html += verdict(st.score) + "<p>" + q.ex + "</p>";
      } else if (q.type === "fill") {
        var rows = q.fields.map(function (f, i) {
          var ok = checkField(f, st.r[i]);
          body.querySelectorAll(".fld")[i].classList.toggle(ok ? "right" : "wrong", true);
          return "<li>" + esc(f.label) + ": " + (ok ? "맞음" : "정답 <b>" + esc(fieldAnswer(f)) + "</b>") + "</li>";
        });
        html += verdict(st.score) + (q.fields.length > 1 ? "<ul class=\"small\">" + rows.join("") + "</ul>" : (st.score < 1 ? "<p>정답: <b>" + esc(fieldAnswer(q.fields[0])) + "</b></p>" : "")) + "<p>" + q.ex + "</p>";
      }
      html += "<p class=\"small\"><a href=\"" + q.topic[0] + "\">자세히: " + esc(q.topic[1]) + " →</a></p>";
      fb.innerHTML = html;
      c.dataset.state = st.score >= 1 ? "right" : st.score > 0 ? "part" : "wrong";
    }

    function showKeys() {
      var st = state[q.id];
      fb.hidden = false;
      lock(true);
      btn.hidden = true;
      var html = "<p class=\"small muted\">내 답에 들어 있는 내용을 모두 고르십시오. 뜻이 같으면 표현이 달라도 됩니다.</p><div class=\"keys\">";
      q.keys.forEach(function (k, i) {
        html += "<label class=\"key\"><input type=\"checkbox\" data-k=\"" + i + "\"" + (st.ticks && st.ticks.indexOf(i) >= 0 ? " checked" : "") + "><span>" + k + "</span></label>";
      });
      html += "</div>";
      if (q.ex) html += "<p class=\"small\">" + q.ex + "</p>";
      html += "<p class=\"small\"><a href=\"" + q.topic[0] + "\">자세히: " + esc(q.topic[1]) + " →</a></p>";
      fb.innerHTML = html;
      var grade = el("button", "btn primary", st.done ? "채점 다시 저장" : "채점");
      grade.type = "button";
      var out = el("div", "fb-score");
      fb.insertBefore(grade, fb.querySelector(".keys").nextSibling);
      fb.insertBefore(out, grade.nextSibling);
      function mark() {
        var ticks = [];
        fb.querySelectorAll(".key input").forEach(function (x) { x.parentNode.classList.toggle("on", x.checked); if (x.checked) ticks.push(Number(x.dataset.k)); });
        return ticks;
      }
      mark();
      fb.addEventListener("change", mark);
      grade.addEventListener("click", function () {
        st.ticks = mark();
        st.score = st.ticks.length / q.keys.length;
        st.done = true;
        save();
        out.innerHTML = verdict(st.score, st.ticks.length + " / " + q.keys.length + " 항목");
        c.dataset.state = st.score >= 1 ? "right" : st.score > 0 ? "part" : "wrong";
        retry.hidden = false;
        refresh();
      });
      if (st.done) { out.innerHTML = verdict(st.score, st.ticks.length + " / " + q.keys.length + " 항목"); c.dataset.state = st.score >= 1 ? "right" : st.score > 0 ? "part" : "wrong"; retry.hidden = false; }
    }

    btn.addEventListener("click", function () {
      var st = state[q.id] = state[q.id] || {};
      if (q.type === "mc") {
        var sel = body.querySelector("input:checked");
        if (!sel) { msg.textContent = "답을 하나 고르십시오."; return; }
        st.r = Number(sel.value); st.score = st.r === q.ans ? 1 : 0; st.done = true;
        save(); showResult(); refresh();
      } else if (q.type === "fill") {
        var vals = [].map.call(body.querySelectorAll("input"), function (i) { return i.value; });
        if (vals.some(function (v) { return !v.trim(); })) { msg.textContent = "칸을 모두 채우십시오."; return; }
        st.r = vals;
        var ok = q.fields.filter(function (f, i) { return checkField(f, vals[i]); }).length;
        st.score = ok / q.fields.length; st.done = true;
        save(); showResult(); refresh();
      } else {
        var t = body.querySelector("textarea").value;
        if (t.trim().length < 5) { msg.textContent = "모범 답을 보기 전에 내 답을 먼저 쓰십시오."; return; }
        st.r = t; save(); showKeys();
      }
    });
    retry.addEventListener("click", function () {
      var keepText = q.type === "free" ? (state[q.id] || {}).r : null;
      delete state[q.id];
      if (keepText) state[q.id] = { r: keepText };
      save();
      var fresh = renderCard(q);
      c.parentNode.replaceChild(fresh, c);
      cards[q.id] = fresh;
      applyFilter();
      refresh();
    });

    if (s.done) { if (q.type === "free") showKeys(); else showResult(); }
    else if (q.type === "free" && s.r && s.ticks) showKeys();
    cards[q.id] = c;
    return c;
  }

  function verdict(score, extra) {
    var cls = score >= 1 ? "right" : score > 0 ? "part" : "wrong";
    var word = score >= 1 ? "맞았습니다" : score > 0 ? "일부 맞았습니다" : "틀렸습니다";
    return "<p class=\"vd " + cls + "\">" + word + (extra ? " · " + extra : "") + "</p>";
  }

  // ---------- 필터 ----------
  var filter = { wk: "", wrongOnly: false };
  function applyFilter() {
    WEEKS.forEach(function (w) {
      var sec = document.getElementById("sec-" + w.key);
      var any = false;
      Q.forEach(function (q) {
        if (q.wk !== w.key) return;
        var st = state[q.id];
        var show = (!filter.wk || filter.wk === q.wk) && (!filter.wrongOnly || (st && st.done && st.score < 1));
        cards[q.id].hidden = !show;
        if (show) any = true;
      });
      sec.hidden = !any;
    });
    var empty = document.getElementById("quiz-empty");
    empty.hidden = !!document.querySelector("#quiz-list section.sec:not([hidden])");
  }

  // ---------- 결과 ----------
  function refresh() {
    var done = 0, sum = 0;
    var byWk = {}, byTopic = {};
    Q.forEach(function (q) {
      var st = state[q.id];
      if (!st || !st.done) return;
      done++; sum += st.score;
      var w = byWk[q.wk] = byWk[q.wk] || { n: 0, s: 0 };
      w.n++; w.s += st.score;
      var t = byTopic[q.topic[0]] = byTopic[q.topic[0]] || { name: q.topic[1], href: q.topic[0], wk: q.wk, n: 0, s: 0, miss: [] };
      t.n++; t.s += st.score;
      if (st.score < 1) t.miss.push(q);
    });

    document.getElementById("progress").textContent = done + " / " + Q.length + "문제 풂 · 점수 " + (done ? Math.round(sum / done * 100) : 0) + "%";

    var bars = WEEKS.map(function (w) {
      var total = Q.filter(function (q) { return q.wk === w.key; }).length;
      var b = byWk[w.key] || { n: 0, s: 0 };
      var pct = b.n ? Math.round(b.s / b.n * 100) : 0;
      return "<div class=\"bar " + w.cls + "\"><span class=\"bar-l\">" + esc(w.title) + "</span>" +
        "<span class=\"bar-t\"><i style=\"width:" + pct + "%\"></i></span>" +
        "<span class=\"bar-v\">" + (b.n ? pct + "%" : "—") + " <small>" + b.n + "/" + total + "</small></span></div>";
    }).join("");
    document.getElementById("bars").innerHTML = bars;

    var weak = Object.keys(byTopic).map(function (k) { return byTopic[k]; })
      .filter(function (t) { return t.s < t.n; })
      .sort(function (a, b) { return a.s / a.n - b.s / b.n; });
    var box = document.getElementById("weak");
    if (!done) { box.innerHTML = "<p class=\"muted\">문제를 풀면 여기에 다시 읽을 절이 나옵니다.</p>"; return; }
    if (!weak.length) { box.innerHTML = "<p>푼 문제에서 놓친 내용이 없습니다. 아직 풀지 않은 문제를 이어서 푸십시오.</p>"; return; }
    box.innerHTML = weak.map(function (t) {
      var w = wkOf({ wk: t.wk });
      var items = t.miss.map(function (q) {
        var st = state[q.id], what;
        if (q.type === "free") {
          var missed = q.keys.filter(function (k, i) { return st.ticks.indexOf(i) < 0; });
          what = "<ul>" + missed.map(function (k) { return "<li>" + k + "</li>"; }).join("") + "</ul>";
        } else if (q.type === "fill") {
          what = "<ul>" + q.fields.filter(function (f, i) { return !checkField(f, st.r[i]); })
            .map(function (f) { return "<li>" + esc(f.label) + ": " + esc(fieldAnswer(f)) + "</li>"; }).join("") + "</ul>";
        } else {
          what = "<p>정답: " + q.opts[q.ans] + "</p>";
        }
        return "<li><a href=\"#q-" + q.id + "\">Q" + numberOf(q) + "</a> " + esc(plain(q.q).slice(0, 60)) + (plain(q.q).length > 60 ? "…" : "") +
          "<div class=\"miss\">" + what + "</div></li>";
      }).join("");
      return "<div class=\"weak-item " + w.cls + "\"><div class=\"weak-h\"><a href=\"" + t.href + "\">" + esc(t.name) + "</a>" +
        "<span>" + Math.round(t.s / t.n * 100) + "%</span></div><ol>" + items + "</ol></div>";
    }).join("");
  }

  // ---------- 내보내기 ----------
  function exportMd() {
    var d = new Date();
    var out = ["# 네트워크 개념 점검 답안 (" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + ")", ""];
    var done = Q.filter(function (q) { return state[q.id] && state[q.id].done; });
    var sum = done.reduce(function (a, q) { return a + state[q.id].score; }, 0);
    out.push("푼 문제 " + done.length + " / " + Q.length + ", 점수 " + (done.length ? Math.round(sum / done.length * 100) : 0) + "%", "");
    done.forEach(function (q) {
      var st = state[q.id];
      out.push("## Q" + numberOf(q) + " [" + KIND[q.type] + "] " + q.topic[1]);
      out.push(plain(q.q), "");
      if (q.type === "mc") {
        out.push("- 내 답: " + plain(q.opts[st.r]));
        out.push("- 결과: " + (st.score ? "맞음" : "틀림 (정답: " + plain(q.opts[q.ans]) + ")"));
      } else if (q.type === "fill") {
        q.fields.forEach(function (f, i) {
          out.push("- " + f.label + ": " + st.r[i] + (checkField(f, st.r[i]) ? " (맞음)" : " (틀림, 정답 " + fieldAnswer(f) + ")"));
        });
      } else {
        out.push("내 답:", "", "> " + st.r.trim().replace(/\n/g, "\n> "), "");
        out.push("- 스스로 채점: " + st.ticks.length + " / " + q.keys.length);
        q.keys.forEach(function (k, i) { out.push("  - [" + (st.ticks.indexOf(i) >= 0 ? "x" : " ") + "] " + plain(k)); });
      }
      out.push("");
    });
    return out.join("\n");
  }

  // ---------- 시작 ----------
  document.addEventListener("DOMContentLoaded", function () {
    var list = document.getElementById("quiz-list");
    var toc = document.getElementById("toc-list");
    WEEKS.forEach(function (w) {
      var qs = Q.filter(function (q) { return q.wk === w.key; });
      var sec = el("section", "sec " + w.cls);
      sec.id = "sec-" + w.key;
      sec.appendChild(el("h2", null, "<span class=\"n\">" + w.n + "</span>" + esc(w.title.replace(/^[^·]+· /, "")) +
        " <a class=\"h2-link small\" href=\"" + w.page + "\">개념 페이지 →</a>"));
      qs.forEach(function (q) { sec.appendChild(renderCard(q)); });
      list.appendChild(sec);
      toc.insertAdjacentHTML("beforeend", "<li><a href=\"#sec-" + w.key + "\"><span class=\"n\">" + w.n + "</span>" + esc(w.title.replace(/^[^·]+· /, "")) + "</a></li>");
    });
    toc.insertAdjacentHTML("beforeend", "<li><a href=\"#result\"><span class=\"n\">✓</span>결과와 다시 읽을 곳</a></li>");
    document.getElementById("qcount").textContent = Q.length;

    var chips = document.getElementById("wk-chips");
    [{ key: "", n: "전체" }].concat(WEEKS.map(function (w) { return { key: w.key, n: w.key === "all" ? "종합" : w.n + "주" }; }))
      .forEach(function (w) {
        var b = el("button", "chip" + (w.key === filter.wk ? " on" : ""), w.n);
        b.type = "button";
        b.addEventListener("click", function () {
          filter.wk = w.key;
          chips.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("on", x === b); });
          applyFilter();
        });
        chips.appendChild(b);
      });
    document.getElementById("wrong-only").addEventListener("change", function (e) { filter.wrongOnly = e.target.checked; applyFilter(); });

    document.getElementById("reset").addEventListener("click", function () {
      if (!confirm("모든 답과 채점 결과를 지웁니다. 계속할까요?")) return;
      state = {}; save();
      Q.forEach(function (q) { var f = renderCard(q); var old = document.getElementById("q-" + q.id); old.parentNode.replaceChild(f, old); });
      applyFilter(); refresh();
    });

    var exp = document.getElementById("export-text");
    document.getElementById("copy").addEventListener("click", function () {
      var md = exportMd();
      exp.value = md; exp.hidden = false;
      var note = document.getElementById("copy-note");
      function fallback() { exp.select(); note.textContent = "자동 복사가 막혔습니다. 아래 글을 직접 복사하십시오."; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(function () { note.textContent = "복사했습니다. Claude에게 붙여 넣으면 답을 읽고 부족한 부분을 설명합니다."; }, fallback);
      } else fallback();
    });

    applyFilter();
    refresh();
  });
})();
