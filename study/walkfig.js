/* walk.html의 그림. 2절(일반 흐름)의 대화형 그림과, walk.js가 단계 그림에 다시 쓰는 함수(WF)를 만듭니다.
   그림은 모두 SVG로 직접 그립니다. 움직임을 줄이는 설정이면 점을 움직이지 않습니다. */
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function S(tag, a, p) {
    var e = document.createElementNS(NS, tag);
    for (var k in a) if (a[k] !== undefined && a[k] !== null) e.setAttribute(k, a[k]);
    if (p) p.appendChild(e);
    return e;
  }
  // 글자를 여러 줄로 나눕니다. n은 한 줄의 최대 글자 수입니다.
  function wrap(s, n) {
    var out = [], line = "";
    String(s).split(" ").forEach(function (w) {
      if (line && (line + " " + w).length > n) { out.push(line); line = w; }
      else line = line ? line + " " + w : w;
    });
    if (line) out.push(line);
    return out;
  }
  // (x, y)를 가운데로 여러 줄 글자를 씁니다. lines의 항목이 [글자, class]이면 그 class를 씁니다.
  function T(p, x, y, lines, cls, anchor, lh) {
    lh = lh || 15;
    if (!Array.isArray(lines)) lines = [lines];
    var t = S("text", { x: x, y: y - (lines.length - 1) * lh / 2 + 4, "text-anchor": anchor || "middle", "class": cls || "" }, p);
    lines.forEach(function (ln, i) {
      var c = Array.isArray(ln) ? ln[1] : null;
      S("tspan", { x: x, dy: i ? lh : 0, "class": c }, t).textContent = Array.isArray(ln) ? ln[0] : ln;
    });
    return t;
  }
  function head(p, x1, y1, x2, y2, cls) {
    var a = Math.atan2(y2 - y1, x2 - x1), L = 9, W = 5;
    var bx = x2 - L * Math.cos(a), by = y2 - L * Math.sin(a);
    return S("polygon", { points: [x2, y2, bx + W * Math.sin(a), by - W * Math.cos(a), bx - W * Math.sin(a), by + W * Math.cos(a)].join(" "), "class": cls }, p);
  }
  // 상자 가운데에서 (px, py) 쪽으로 가는 선이 상자 테두리와 만나는 점
  function clip(n, px, py, pad) {
    pad = pad || 0;
    var dx = px - n.x, dy = py - n.y;
    if (!dx && !dy) return [n.x, n.y];
    var hw = n.w / 2 + pad, hh = n.h / 2 + pad;
    var t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return [n.x + dx * t, n.y + dy * t];
  }
  function lenOf(p) { var L = 0; for (var i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  function at(p, d) {
    for (var i = 1; i < p.length; i++) {
      var sl = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (d <= sl || i === p.length - 1) { var r = sl ? Math.min(d / sl, 1) : 1; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * r, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * r]; }
      d -= sl;
    }
    return p[p.length - 1];
  }
  function chips(host, opts, cur, onPick, label) {
    var box = document.createElement("div");
    box.className = "fig-ctl";
    box.setAttribute("role", "group");
    if (label) { var l = document.createElement("span"); l.className = "fig-lb"; l.textContent = label; box.appendChild(l); }
    var bs = opts.map(function (o, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip" + (i === cur ? " on" : "");
      b.textContent = o; b.setAttribute("aria-pressed", i === cur ? "true" : "false");
      b.addEventListener("click", function () {
        bs.forEach(function (x, k) { x.classList.toggle("on", k === i); x.setAttribute("aria-pressed", k === i ? "true" : "false"); });
        onPick(i);
      });
      box.appendChild(b);
      return b;
    });
    host.appendChild(box);
    return box;
  }

  // ---------- 흐름도: 상자와 화살표. show(경로)가 그 길을 칠하고 점을 움직입니다. ----------
  function Flow(svg, spec) {
    this.svg = svg; this.spec = spec; this.run = 0;
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + spec.w + " " + spec.h);
    var ge = S("g", {}, svg);
    this.dots = S("g", {}, svg);
    var gn = S("g", {}, svg);
    var self = this;
    this.edges = {};
    spec.edges.forEach(function (e) {
      var a = spec.nodes[e[0]], b = spec.nodes[e[1]], via = e[3] || [];
      var p0 = clip(a, via.length ? via[0][0] : b.x, via.length ? via[0][1] : b.y, 2);
      var lastFrom = via.length ? via[via.length - 1] : [a.x, a.y];
      var p1 = clip(b, lastFrom[0], lastFrom[1], 3);
      var pts = [p0].concat(via).concat([p1]);
      var g = S("g", { "class": "fe" + (e[5] ? " " + e[5] : "") }, ge);
      S("polyline", { points: pts.map(function (q) { return q.join(","); }).join(" ") }, g);
      var pa = pts[pts.length - 2];
      head(g, pa[0], pa[1], p1[0], p1[1]);
      if (e[2]) {
        // 가로에 가까운 선은 선 위 가운데에, 세로에 가까운 선은 선 오른쪽에 씁니다.
        var dx = pts[1][0] - pts[0][0], dy = pts[1][1] - pts[0][1], hz = Math.abs(dx) > Math.abs(dy);
        var lp = e[4] || (hz ? [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2 - 7] : [pts[0][0] + 7, (pts[0][1] + pts[1][1]) / 2 + 4]);
        var t = S("text", { x: lp[0], y: lp[1], "class": "t-s fe-l", "text-anchor": e[4] || !hz ? "start" : "middle" }, g);
        t.textContent = e[2];
      }
      // 점이 지나는 길: 상자 가운데에서 가운데로
      self.edges[e[0] + ">" + e[1]] = { g: g, pts: [[a.x, a.y]].concat(via).concat([[b.x, b.y]]) };
    });
    this.nodes = {};
    Object.keys(spec.nodes).forEach(function (id) {
      var n = spec.nodes[id];
      var g = S("g", { "class": "fn" + (n.k ? " " + n.k : ""), style: n.c ? "--c:var(--" + n.c + ");--c-soft:var(--" + n.c + "-soft)" : null }, gn);
      S("rect", { x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: n.k === "q" ? n.h / 2 : 8 }, g);
      T(g, n.x, n.y, n.t, "t-s");
      self.nodes[id] = g;
    });
  }
  Flow.prototype.show = function (path) {
    var self = this, my = ++this.run;
    Object.keys(this.nodes).forEach(function (id) { self.nodes[id].classList.toggle("on", path.indexOf(id) >= 0); });
    var used = {};
    var line = [];
    for (var i = 1; i < path.length; i++) {
      var e = this.edges[path[i - 1] + ">" + path[i]];
      if (!e) continue;
      used[path[i - 1] + ">" + path[i]] = 1;
      line = line.concat(line.length ? e.pts.slice(1) : e.pts);
    }
    Object.keys(this.edges).forEach(function (k) { self.edges[k].g.classList.toggle("on", !!used[k]); });
    this.dots.innerHTML = "";
    if (reduce || line.length < 2) return;
    var dot = S("circle", { r: 8, "class": "fdot" }, this.dots);
    var L = lenOf(line), dur = Math.max(900, L * 3.2), t0 = null;
    function frame(ts) {
      if (my !== self.run || !self.svg.isConnected) return;
      if (t0 === null) t0 = ts;
      var k = (ts - t0) / dur;
      if (k > 1.35) { t0 = ts; k = 0; }          // 끝에서 잠시 멈춘 뒤 다시 갑니다
      var q = at(line, L * Math.min(k, 1));
      dot.setAttribute("cx", q[0]); dot.setAttribute("cy", q[1]);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  function figure(id) {
    var host = document.getElementById(id);
    if (!host) return null;
    host.innerHTML = "";
    return host;
  }
  function svgIn(host, label) {
    var s = S("svg", { role: "img", "aria-label": label });
    host.appendChild(s);
    return s;
  }
  function note(host) {
    var p = document.createElement("p");
    p.className = "fig-note"; p.setAttribute("aria-live", "polite");
    host.appendChild(p);
    return p;
  }

  // ---------- 그림 1: 모든 장치의 같은 일 ----------
  var DEV = [
    ["호스트 (이름)", "dns", "목적지 이름", "DNS 캐시", "리졸버에 재귀 질의를 보냄", "DNS 응답", "레코드의 TTL이 끝날 때"],
    ["리졸버", "dns", "질의의 이름", "DNS 캐시", "가장 가까운 NS부터 반복 질의를 보냄", "DNS 응답", "레코드의 TTL이 끝날 때"],
    ["호스트 (다음 홉)", "ip", "목적지 IP 주소", "라우팅 표", "기본 경로(게이트웨이)가 받음", "DHCP", "임대 시간이 끝날 때"],
    ["호스트·라우터 (MAC)", "eth", "다음 홉 IP 주소", "ARP 표", "ARP 요청을 브로드캐스트함", "ARP 요청과 응답", "운영체제가 정한 시간"],
    ["스위치", "eth", "목적지 MAC 주소", "스위치 표", "들어온 포트 외 모든 포트로 보냄 (플러딩)", "프레임의 출발지 MAC", "에이징 시간이 끝날 때"],
    ["라우터", "rt", "목적지 IP 주소", "포워딩 표", "버림 (기본 경로가 없을 때)", "라우팅 프로토콜 (OSPF 등)", "새 LSA로 다시 계산할 때"],
    ["NAT", "ip", "(주소, 포트)", "NAT 변환 표", "안→밖: 새 항목을 만듦. 밖→안: 버림", "안에서 나가는 패킷", "구현이 정한 시간"],
    ["목적지 호스트", "tcp", "프로토콜과 포트", "소켓", "버림 (TCP는 RST로 답함)", "응용이 연 소켓", "소켓을 닫을 때"]
  ];
  function figLoop() {
    var host = figure("fig-loop");
    if (!host) return;
    var dev = 4, sc = 0, f;
    chips(host, DEV.map(function (d) { return d[0]; }), dev, function (i) { dev = i; draw(); }, "장치");
    chips(host, ["표에 있음", "표에 없음", "표를 채움", "표에서 지움"], sc, function (i) { sc = i; draw(); }, "경우");
    var svg = svgIn(host, "장치가 받은 프레임의 헤더 값으로 표를 찾고, 있으면 보내고, 없으면 묻거나 모두에게 보내는 흐름");
    var nt = note(host);
    function draw() {
      var d = DEV[dev];
      host.style.setProperty("--c", "var(--" + d[1] + ")");
      host.style.setProperty("--c-soft", "var(--" + d[1] + "-soft)");
      f = new Flow(svg, { w: 720, h: 300,
        nodes: {
          A: { x: 70, y: 150, w: 112, h: 58, t: [["① 받음", "t-b"], "프레임·패킷"] },
          B: { x: 222, y: 150, w: 140, h: 70, t: [["② 헤더 값을 읽음", "t-b"]].concat(wrap(d[2], 10)) },
          C: { x: 392, y: 150, w: 150, h: 70, t: [["③ 표에서 찾음", "t-b"]].concat(wrap(d[3], 11)) },
          D: { x: 610, y: 66, w: 200, h: 56, t: [["④ 있음", "t-b"], "그 값대로 보냄"] },
          E: { x: 610, y: 234, w: 200, h: 76, t: [["④ 없음", "t-b"]].concat(wrap(d[4], 15)) },
          F: { x: 392, y: 268, w: 210, h: 52, k: "side", t: [["표를 채우는 것", "t-b"]].concat(wrap(d[5], 16)) },
          G: { x: 392, y: 32, w: 210, h: 52, k: "side warn", t: [["표에서 지우는 때", "t-b"]].concat(wrap(d[6], 16)) }
        },
        edges: [["A", "B"], ["B", "C"], ["C", "D", "있음"], ["C", "E", "없음"], ["F", "C", "채움"], ["C", "G", "시간이 지남"]]
      });
      f.show([["A", "B", "C", "D"], ["A", "B", "C", "E"], ["F", "C"], ["C", "G"]][sc]);
      nt.innerHTML = [
        "<b>" + d[0] + "</b>이 " + d[2] + "로 " + d[3] + "를 찾습니다. 값이 있으면 그 값대로 보냅니다. 다른 장치에 묻지 않습니다.",
        "<b>" + d[0] + "</b>의 " + d[3] + "에 값이 없습니다. 장치는 이렇게 합니다: " + d[4] + ".",
        "<b>" + d[3] + "</b>는 " + d[5] + "로 채워집니다. 그 뒤의 같은 일은 \"표에 있음\"으로 끝납니다.",
        "<b>" + d[3] + "</b>의 값은 " + d[6] + " 지워집니다. 그 뒤의 같은 일은 다시 \"표에 없음\"이 됩니다."
      ][sc];
    }
    draw();
  }

  // ---------- 그림 2: 캡슐화 ----------
  var LAY = [
    { n: "데이터", c: "dns", f: "응용의 바이트 (예: HTTP 요청)", lv: "응용" },
    { n: "TCP/UDP", c: "tcp", f: "출발지·목적지 포트, (TCP) seq·ack", lv: "전송" },
    { n: "IP", c: "ip", f: "출발지·최종 목적지 IP, TTL, 프로토콜 번호", lv: "네트워크" },
    { n: "이더넷", c: "eth", f: "다음 홉의 MAC, 내 MAC, 타입. 끝에 FCS", lv: "링크" }
  ];
  function figEncap() {
    var host = figure("fig-encap");
    if (!host) return;
    var k = 0, dir = 0;
    chips(host, ["보내는 쪽: 붙임", "받는 쪽: 뗌"], 0, function (i) { dir = i; k = 0; draw(); }, "방향");
    var bar = document.createElement("div"); bar.className = "fig-ctl";
    bar.innerHTML = '<button type="button" class="btn" data-k="-1">◀ 이전</button><button type="button" class="btn primary" data-k="1">다음 ▶</button><span class="fig-lb" aria-live="polite"></span>';
    host.appendChild(bar);
    var svg = svgIn(host, "응용 데이터에 TCP, IP, 이더넷 헤더가 차례로 붙는 모습");
    svg.setAttribute("viewBox", "0 0 720 230");
    var nt = note(host);
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      k = Math.max(0, Math.min(3, k + Number(b.dataset.k))); draw();
    });
    function draw() {
      // 보내는 쪽: k층까지 붙어 있음. 받는 쪽: 3-k층까지 남아 있음.
      var n = dir === 0 ? k : 3 - k;
      svg.innerHTML = "";
      // 왼쪽: 층 이름
      LAY.slice().reverse().forEach(function (l, j) {
        var li = 3 - j, on = li === n;
        var g = S("g", { "class": "lyr" + (on ? " on" : "") + (li <= n ? "" : " off"), style: "--c:var(--" + l.c + ");--c-soft:var(--" + l.c + "-soft)" }, svg);
        S("rect", { x: 8, y: 18 + j * 50, width: 110, height: 42, rx: 8 }, g);
        T(g, 63, 39 + j * 50, l.lv + " 층", "t-s t-b");
      });
      var arr = S("g", { "class": "fe on", style: "--c:var(--muted)" }, svg);
      if (dir === 0) { S("polyline", { points: "132,30 132,200" }, arr); head(arr, 132, 190, 132, 205); }
      else { S("polyline", { points: "132,200 132,30" }, arr); head(arr, 132, 40, 132, 25); }
      // 오른쪽: 프레임
      var x = 160, y = 100, H = 46, parts = [];
      for (var i = n; i >= 1; i--) parts.push({ l: LAY[i], w: i === 3 ? 92 : 104 });
      parts.push({ l: LAY[0], w: 200 });
      if (n === 3) parts.push({ l: { n: "FCS", c: "eth", f: "" }, w: 50 });
      var tot = parts.reduce(function (a, p) { return a + p.w; }, 0);
      x = 160 + (550 - tot) / 2;
      parts.forEach(function (p, j) {
        var isNew = (dir === 0 && p.l === LAY[n] && n > 0) || (p.l.n === "FCS");
        var g = S("g", { "class": "pkt-p" + (isNew ? " new" : ""), style: "--c:var(--" + p.l.c + ");--c-soft:var(--" + p.l.c + "-soft)" }, svg);
        S("rect", { x: x, y: y, width: p.w - 2, height: H, rx: 6 }, g);
        T(g, x + p.w / 2 - 1, y + H / 2, p.l.n, "t-b t-s");
        if (p.l.f && p.l === LAY[n]) {
          T(svg, x + p.w / 2, y + H + 26, wrap(p.l.f, 22), "t-s t-muted");
        }
        x += p.w;
      });
      T(svg, 435, 40, dir === 0 ? "위 층에서 아래 층으로 헤더를 앞에 붙입니다" : "아래 층에서 위 층으로 헤더를 떼고 다음 층에 넘깁니다", "t-s t-muted");
      bar.querySelector(".fig-lb").textContent = (k + 1) + " / 4";
      bar.querySelector('[data-k="-1"]').disabled = k === 0;
      bar.querySelector('[data-k="1"]').disabled = k === 3;
      nt.innerHTML = dir === 0
        ? ["응용이 데이터를 소켓에 씁니다. 아직 헤더가 없습니다.", "전송 층이 <b>TCP 또는 UDP 헤더</b>를 붙입니다. 포트가 받는 쪽의 소켓을 정합니다.", "네트워크 층이 <b>IP 헤더</b>를 붙입니다. 목적지 주소는 최종 목적지입니다. 이 값은 끝까지 그대로입니다(NAT 제외).", "링크 층이 <b>이더넷 헤더와 FCS</b>를 붙입니다. 목적지 MAC은 다음 홉의 MAC입니다. 이 값은 링크마다 바뀝니다."][k]
        : ["받는 쪽이 프레임을 받습니다. 목적지 MAC이 자기 것인지, FCS가 맞는지 확인합니다.", "링크 층이 <b>이더넷 헤더</b>를 뗍니다. 타입 값으로 IP에 넘깁니다.", "네트워크 층이 <b>IP 헤더</b>를 뗍니다. 프로토콜 번호로 TCP나 UDP에 넘깁니다.", "전송 층이 <b>TCP/UDP 헤더</b>를 뗍니다. 포트로 소켓을 찾아 응용에 데이터를 넘깁니다(역다중화)."][k];
    }
    draw();
  }

  // ---------- 그림 3: 보내는 호스트의 판단 ----------
  function figHost() {
    var host = figure("fig-host");
    if (!host) return;
    var o = [0, 1, 1];
    chips(host, ["캐시에 있음", "캐시에 없음"], o[0], function (i) { o[0] = i; draw(); }, "이름");
    chips(host, ["같은 서브넷", "다른 서브넷"], o[1], function (i) { o[1] = i; draw(); }, "목적지");
    chips(host, ["ARP 표에 있음", "ARP 표에 없음"], o[2], function (i) { o[2] = i; draw(); }, "다음 홉 MAC");
    var svg = svgIn(host, "보내는 호스트가 DNS 캐시, 서브넷, ARP 표를 차례로 확인하는 흐름도");
    var nt = note(host);
    var f = new Flow(svg, { w: 720, h: 480,
      nodes: {
        st: { x: 250, y: 28, w: 250, h: 40, t: [["보낼 데이터가 있음 (목적지는 이름)", "t-b"]] },
        q1: { x: 250, y: 104, w: 250, h: 50, k: "q", t: ["이름의 주소가", "DNS 캐시에 있습니까?"] },
        dns: { x: 580, y: 104, w: 230, h: 62, c: "dns", t: ["DNS 질의를 리졸버에 보냄", "응답의 주소를 캐시에 넣음"] },
        q2: { x: 250, y: 190, w: 250, h: 50, k: "q", t: ["목적지 IP가", "내 서브넷 안에 있습니까?"] },
        n1: { x: 120, y: 272, w: 200, h: 48, c: "ip", t: ["다음 홉 = 목적지 자신"] },
        n2: { x: 380, y: 272, w: 200, h: 48, c: "ip", t: ["다음 홉 = 기본 게이트웨이"] },
        q3: { x: 250, y: 352, w: 250, h: 50, k: "q", t: ["다음 홉 IP의 MAC이", "ARP 표에 있습니까?"] },
        arp: { x: 580, y: 352, w: 230, h: 62, c: "eth", t: ["ARP 요청을 브로드캐스트함", "응답의 MAC을 표에 넣음"] },
        tx: { x: 250, y: 440, w: 330, h: 50, c: "tcp", t: [["프레임을 보냄", "t-b"], "목적지 MAC = 다음 홉의 MAC"] }
      },
      edges: [
        ["st", "q1"], ["q1", "q2", "있음"], ["q1", "dns", "없음"], ["dns", "q2", null, [[580, 190]]],
        ["q2", "n1", "예", null, [150, 232]], ["q2", "n2", "아니요", null, [322, 232]], ["n1", "q3"], ["n2", "q3"],
        ["q3", "tx", "있음"], ["q3", "arp", "없음"], ["arp", "tx", null, [[580, 440]]]
      ]
    });
    function draw() {
      var p = ["st", "q1"];
      if (o[0]) p.push("dns");
      p.push("q2", o[1] ? "n2" : "n1", "q3");
      if (o[2]) p.push("arp");
      p.push("tx");
      f.show(p);
      var out = [];
      if (o[0]) out.push("DNS 질의 (리졸버에게. 이 질의도 같은 흐름의 ② 아래를 지납니다)");
      if (o[2]) out.push("ARP 요청 (브로드캐스트) → ARP 응답");
      out.push("데이터 프레임 (목적지 MAC: " + (o[1] ? "게이트웨이" : "목적지") + "의 MAC, 목적지 IP: 최종 목적지)");
      nt.innerHTML = "<b>나가는 순서</b>: " + out.map(function (x, i) { return (i + 1) + ". " + x; }).join(" · ") +
        "<br>호스트는 서버의 MAC 주소를 찾지 않습니다. " + (o[1] ? "목적지가 다른 서브넷이므로 게이트웨이의 MAC만 찾습니다." : "목적지가 같은 서브넷이므로 목적지의 MAC을 찾습니다.");
    }
    draw();
  }

  // ---------- 그림 4: 링크마다 바뀌는 헤더 값 ----------
  var HF = ["목적지 MAC", "출발지 MAC", "출발지 IP", "목적지 IP", "TTL", "출발지 포트", "목적지 포트", "데이터"];
  var HL = ["eth", "eth", "ip", "ip", "ip", "tcp", "tcp", "dns"];
  var HOPS = [
    { t: "호스트 A → 스위치", v: ["R1 안쪽", "A", "A (사설)", "B", "64", "a", "80", "같음"] },
    { t: "스위치 → 라우터 R1", v: ["R1 안쪽", "A", "A (사설)", "B", "64", "a", "80", "같음"], note: "스위치는 아무 값도 바꾸지 않습니다." },
    { t: "R1 (NAT) → R2", v: ["R2", "R1 바깥쪽", "N (공인)", "B", "63", "n", "80", "같음"], nat: [2, 5] },
    { t: "R2 → 서버 B", v: ["B", "R2 바깥쪽", "N (공인)", "B", "62", "n", "80", "같음"] }
  ];
  function figHops() {
    var host = figure("fig-hops");
    if (!host) return;
    var h = '<div class="hs-wrap"><div class="hs">';
    h += '<div class="hs-row hs-head"><span></span>' + HF.map(function (f, i) { return '<span style="--c:var(--' + HL[i] + ')">' + f + "</span>"; }).join("") + "</div>";
    HOPS.forEach(function (hp, r) {
      h += '<div class="hs-row" data-r="' + r + '"><b>' + hp.t + "</b>";
      hp.v.forEach(function (v, i) {
        var chg = r > 0 && HOPS[r - 1].v[i] !== v, nat = hp.nat && hp.nat.indexOf(i) >= 0;
        h += '<span class="hs-c' + (chg ? (nat ? " nat" : " chg") : "") + '" style="--c:var(--' + HL[i] + ');--c-soft:var(--' + HL[i] + '-soft)"><i>' + HF[i] + "</i>" + v + "</span>";
      });
      h += "</div>";
    });
    h += "</div></div>";
    host.innerHTML = h + '<div class="key"><span><i style="background:var(--check-soft);outline:var(--hair) solid var(--check)"></i>링크를 건널 때 바뀜</span><span><i style="background:var(--ip-soft);outline:var(--hair) solid var(--ip)"></i>NAT가 바꿈</span><span>A, B = 끝의 호스트, N = NAT의 공인 주소, a·n = 포트</span></div>';
  }

  // ---------- 그림 5: 스위치와 라우터 안의 순서 ----------
  function figSwitch() {
    var host = figure("fig-switch");
    if (!host) return;
    var sc = 0;
    host.style.setProperty("--c", "var(--eth)"); host.style.setProperty("--c-soft", "var(--eth-soft)");
    chips(host, ["목적지 MAC이 표에 있음", "표에 없음 또는 브로드캐스트", "목적지가 같은 포트"], sc, function (i) { sc = i; draw(); }, "경우");
    var svg = svgIn(host, "스위치가 출발지 MAC을 기록하고 목적지 MAC으로 포트를 고르는 흐름");
    var nt = note(host);
    var f = new Flow(svg, { w: 720, h: 230,
      nodes: {
        in: { x: 66, y: 115, w: 110, h: 54, t: [["프레임 받음", "t-b"], "포트 p로"] },
        lr: { x: 222, y: 115, w: 170, h: 64, t: [["출발지 MAC 기록", "t-b"], "MAC → 포트 p, 시각"] },
        q: { x: 400, y: 115, w: 160, h: 56, k: "q", t: ["목적지 MAC이", "표에 있습니까?"] },
        fw: { x: 610, y: 32, w: 200, h: 50, t: [["그 포트로만 보냄", "t-b"], "(전달)"] },
        fl: { x: 610, y: 115, w: 200, h: 56, t: [["p 외 모든 포트로 보냄", "t-b"], "(플러딩)"] },
        dr: { x: 610, y: 198, w: 200, h: 50, k: "warn", t: [["버림", "t-b"], "표의 포트가 p와 같음"] }
      },
      edges: [["in", "lr"], ["lr", "q"], ["q", "fw", "있음"], ["q", "fl", "없음"], ["q", "dr", "같은 포트", null, [440, 200]]]
    });
    function draw() {
      f.show([["in", "lr", "q", "fw"], ["in", "lr", "q", "fl"], ["in", "lr", "q", "dr"]][sc]);
      nt.innerHTML = [
        "스위치는 먼저 출발지를 배웁니다. 그 다음 목적지 MAC의 포트로만 보냅니다. 헤더 값은 바꾸지 않습니다.",
        "목적지 MAC이 표에 없으면 스위치는 모두에게 보냅니다. 목적지가 답하면 그 답의 출발지 MAC으로 스위치가 그 포트를 배웁니다.",
        "목적지가 프레임이 들어온 포트 쪽에 있으면 스위치는 보내지 않습니다(필터링)."
      ][sc];
    }
    draw();
  }
  function figRouter() {
    var host = figure("fig-router");
    if (!host) return;
    var sc = 0;
    host.style.setProperty("--c", "var(--rt)"); host.style.setProperty("--c-soft", "var(--rt-soft)");
    chips(host, ["정상", "FCS 오류", "맞는 경로 없음", "TTL이 1로 도착", "출력 큐가 가득 참"], sc, function (i) { sc = i; draw(); }, "경우");
    var svg = svgIn(host, "라우터가 프레임을 받아 다음 링크로 보내기까지의 순서와 버리는 곳");
    var nt = note(host);
    var f = new Flow(svg, { w: 720, h: 340,
      nodes: {
        in: { x: 62, y: 120, w: 104, h: 56, t: [["프레임 받음", "t-b"]] },
        fcs: { x: 190, y: 120, w: 116, h: 56, k: "q", t: ["FCS가", "맞습니까?"] },
        eth: { x: 325, y: 120, w: 120, h: 56, t: ["이더넷 헤더", "제거"] },
        nat: { x: 462, y: 120, w: 120, h: 56, k: "opt", t: ["NAT: 출발지", "주소·포트 바꿈"] },
        lpm: { x: 615, y: 120, w: 150, h: 56, k: "q", t: ["최장 프리픽스", "일치가 있습니까?"] },
        ttl: { x: 615, y: 222, w: 150, h: 56, k: "q", t: ["TTL − 1.", "0보다 큽니까?"] },
        l2: { x: 445, y: 222, w: 150, h: 56, t: ["체크섬 계산,", "다음 홉 MAC으로 새 헤더"] },
        q: { x: 280, y: 222, w: 140, h: 56, k: "q", t: ["출력 큐에", "자리가 있습니까?"] },
        out: { x: 110, y: 222, w: 150, h: 56, k: "ok", t: [["다음 링크로 보냄", "t-b"]] },
        x1: { x: 190, y: 30, w: 150, h: 42, k: "warn", t: ["버림 (알리지 않음)"] },
        x2: { x: 615, y: 30, w: 190, h: 42, k: "warn", t: ["버림, ICMP 도달 불가"] },
        x3: { x: 615, y: 312, w: 190, h: 42, k: "warn", t: ["버림, ICMP 시간 초과"] },
        x4: { x: 280, y: 312, w: 190, h: 42, k: "warn", t: ["버림 (알리지 않음)"] }
      },
      edges: [["in", "fcs"], ["fcs", "eth"], ["eth", "nat"], ["nat", "lpm"], ["lpm", "ttl", "예"], ["ttl", "l2"], ["l2", "q"], ["q", "out"],
        ["fcs", "x1", "아니요"], ["lpm", "x2", "아니요"], ["ttl", "x3", "아니요"], ["q", "x4", "아니요"]]
    });
    function draw() {
      var ok = ["in", "fcs", "eth", "nat", "lpm", "ttl", "l2", "q", "out"];
      f.show([ok, ["in", "fcs", "x1"], ["in", "fcs", "eth", "nat", "lpm", "x2"], ["in", "fcs", "eth", "nat", "lpm", "ttl", "x3"], ["in", "fcs", "eth", "nat", "lpm", "ttl", "l2", "q", "x4"]][sc]);
      nt.innerHTML = [
        "라우터는 IP 헤더의 목적지 주소로 다음 홉을 정합니다. 그 다음 다음 링크의 새 이더넷 헤더를 붙입니다. NAT 상자는 NAT 라우터에만 있습니다.",
        "FCS가 틀리면 그 프레임은 깨진 것입니다. 라우터는 프레임을 버리고 아무에게도 알리지 않습니다.",
        "포워딩 표의 어느 프리픽스와도 맞지 않으면(기본 경로도 없으면) 라우터는 패킷을 버리고 ICMP 도달 불가 메시지를 보낼 수 있습니다.",
        "TTL이 0이 되면 라우터는 패킷을 버리고 ICMP 시간 초과 메시지를 출발지에 보냅니다. traceroute는 이 메시지를 씁니다.",
        "출력 큐가 가득 차면 라우터는 패킷을 버립니다. 보내는 쪽은 중복 ACK나 타임아웃으로만 손실을 압니다. 이것이 TCP 혼잡 제어의 신호입니다."
      ][sc];
    }
    draw();
  }

  // ---------- 그림 6: TCP 연결의 일생 ----------
  var MSG = [
    { d: 1, t: "SYN  seq = x", c: ["SYN_SENT", "LISTEN"] },
    { d: -1, t: "SYN+ACK  seq = y, ack = x+1", c: ["SYN_SENT", "SYN_RCVD"] },
    { d: 1, t: "ACK  ack = y+1 (요청을 함께 실을 수 있음)", c: ["ESTABLISHED", "SYN_RCVD"] },
    { d: -1, t: "데이터  seq = y+1 …", c: ["ESTABLISHED", "ESTABLISHED"] },
    { d: 1, t: "ACK  ack = 받은 바이트 + 1", c: ["ESTABLISHED", "ESTABLISHED"] },
    { d: 1, t: "FIN", c: ["FIN_WAIT_1", "ESTABLISHED"] },
    { d: -1, t: "ACK", c: ["FIN_WAIT_1", "CLOSE_WAIT"] },
    { d: -1, t: "FIN", c: ["FIN_WAIT_2", "LAST_ACK"] },
    { d: 1, t: "ACK", c: ["TIME_WAIT", "LAST_ACK"] }
  ];
  var MSGN = ["먼저 연결하는 쪽(클라이언트)이 SYN을 보냅니다. 처음 순서 번호 x를 알립니다.",
    "서버가 SYN+ACK로 답합니다. 자기의 처음 순서 번호 y를 알리고, x+1을 기다린다고 알립니다.",
    "클라이언트가 ACK를 보냅니다. 클라이언트 쪽에서는 연결이 만들어졌습니다. 여기까지 1 RTT입니다.",
    "서버가 데이터를 보냅니다. 한 번에 보내는 양은 min(cwnd, rwnd)입니다.",
    "받는 쪽은 다음에 기다리는 바이트 번호로 ACK를 보냅니다(누적 ACK).",
    "보낼 것이 없는 쪽이 FIN을 보냅니다. 그 방향만 닫힙니다.",
    "상대가 FIN을 ACK로 확인합니다. 상대는 아직 데이터를 보낼 수 있습니다.",
    "상대도 보낼 것이 없으면 FIN을 보냅니다.",
    "먼저 닫은 쪽이 마지막 ACK를 보내고 TIME_WAIT로 기다립니다. 상대는 ACK를 받고 연결을 지웁니다."];
  function figLadder() {
    var host = figure("fig-ladder");
    if (!host) return;
    var k = 0;
    host.style.setProperty("--c", "var(--tcp)"); host.style.setProperty("--c-soft", "var(--tcp-soft)");
    var bar = document.createElement("div"); bar.className = "fig-ctl";
    bar.innerHTML = '<button type="button" class="btn" data-k="-9">⏮</button><button type="button" class="btn" data-k="-1">◀ 이전</button><button type="button" class="btn primary" data-k="1">다음 메시지 ▶</button><span class="fig-lb"></span>';
    host.appendChild(bar);
    var svg = svgIn(host, "TCP 연결을 만들고, 데이터를 보내고, 닫는 메시지의 순서");
    svg.setAttribute("viewBox", "0 0 720 470");
    var nt = note(host);
    bar.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; k = Math.max(0, Math.min(MSG.length - 1, k + Number(b.dataset.k))); draw(); });
    var CX = 250, SX = 530, Y0 = 60, DY = 42, DROP = 22;
    function draw() {
      svg.innerHTML = "";
      T(svg, CX, 22, "클라이언트", "t-b"); T(svg, SX, 22, "서버", "t-b");
      S("line", { x1: CX, y1: 34, x2: CX, y2: 455, "class": "ln" }, svg);
      S("line", { x1: SX, y1: 34, x2: SX, y2: 455, "class": "ln" }, svg);
      MSG.forEach(function (m, i) {
        var y = Y0 + i * DY, x1 = m.d > 0 ? CX : SX, x2 = m.d > 0 ? SX : CX;
        var g = S("g", { "class": "msg" + (i === k ? " on" : i < k ? " past" : " fut") }, svg);
        S("line", { x1: x1, y1: y, x2: x2, y2: y + DROP }, g);
        head(g, x1 + (x2 - x1) * .9, y + DROP * .9, x2, y + DROP);
        var mx = (CX + SX) / 2, ang = Math.atan2(DROP, x2 - x1) * 180 / Math.PI;
        var tt = S("text", { x: mx, y: y + DROP / 2 - 6, "text-anchor": "middle", "class": "t-s", transform: "rotate(" + (m.d > 0 ? ang : ang - 180) + " " + mx + " " + (y + DROP / 2) + ")" }, g);
        tt.textContent = m.t;
        if (i <= k) {
          if (i === 0 || MSG[i - 1].c[0] !== m.c[0]) T(g, CX - 12, y + 4, m.c[0], "t-s t-mono st-l", "end");
          if (i === 0 || MSG[i - 1].c[1] !== m.c[1]) T(g, SX + 12, y + 4, m.c[1], "t-s t-mono st-l", "start");
        }
      });
      if (k === MSG.length - 1) {
        var y = Y0 + 8 * DY + DROP + 8;
        S("rect", { x: CX - 6, y: y, width: 12, height: 50, rx: 4, "class": "bx-tcp" }, svg);
        T(svg, CX - 14, y + 30, ["TIME_WAIT", "2 MSL 기다림"], "t-s", "end");
        T(svg, SX + 12, y + 8, "CLOSED", "t-s t-mono", "start");
      }
      bar.querySelector(".fig-lb").textContent = (k + 1) + " / " + MSG.length;
      bar.querySelector('[data-k="-1"]').disabled = k === 0;
      bar.querySelector('[data-k="-9"]').disabled = k === 0;
      bar.querySelector('[data-k="1"]').disabled = k === MSG.length - 1;
      nt.textContent = MSGN[k];
    }
    draw();
  }

  // cwnd 그래프. pts: [{x, y, ss}], 축 이름, 현재 점
  function cwndChart(svg, d) {
    svg.innerHTML = "";
    var W = 720, H = d.h || 260, L = 56, R = 20, Tp = 20, B = 40;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var xs = d.pts.map(function (p) { return p.x; }), xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var ymax = d.ymax;
    function X(v) { return L + (v - xmin) / (xmax - xmin || 1) * (W - L - R); }
    function Y(v) { return H - B - v / ymax * (H - B - Tp); }
    // 구역 칠하기
    (d.zones || []).forEach(function (z) {
      S("rect", { x: X(z[0]), y: Tp, width: X(z[1]) - X(z[0]), height: H - B - Tp, "class": "zone " + z[2] }, svg);
      T(svg, (X(z[0]) + X(z[1])) / 2, Tp + 14, z[3], "t-s t-muted");
    });
    // 축
    S("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, "class": "ln" }, svg);
    S("line", { x1: L, y1: Tp, x2: L, y2: H - B, "class": "ln" }, svg);
    for (var v = 0; v <= ymax; v += d.ystep) { T(svg, L - 8, Y(v), String(v), "t-s t-muted", "end"); S("line", { x1: L, y1: Y(v), x2: W - R, y2: Y(v), "class": "grid" }, svg); }
    d.pts.forEach(function (p, i) { if (d.xlab && (i % (d.xevery || 1) === 0)) T(svg, X(p.x), H - B + 16, d.xlab(p, i), "t-s t-muted"); });
    T(svg, (L + W - R) / 2, H - 4, d.xname, "t-s t-muted");
    T(svg, 14, Tp + (H - B - Tp) / 2, "cwnd (MSS)", "t-s t-muted", "middle").setAttribute("transform", "rotate(-90 14 " + (Tp + (H - B - Tp) / 2) + ")");
    // ssthresh
    var ss = "", prev = null;
    d.pts.forEach(function (p) {
      if (p.ss == null) return;
      if (prev != null && prev !== p.ss) ss += " " + X(p.x) + "," + Y(Math.min(prev, ymax));
      ss += (ss ? " " : "") + X(p.x) + "," + Y(Math.min(p.ss, ymax));
      prev = p.ss;
    });
    if (ss) { S("polyline", { points: ss, "class": "ssl" }, svg); }
    if (d.sslab) T(svg, W - R - 4, Y(Math.min(d.pts[d.pts.length - 1].ss, ymax)) - 6, "ssthresh", "t-s t-warn", "end");
    var line = S("polyline", { points: d.pts.map(function (p) { return X(p.x) + "," + Y(p.y); }).join(" "), "class": "cwl" }, svg);
    if (!reduce && d.anim) {
      var len = d.pts.reduce(function (a, p, i) { return i ? a + Math.hypot(X(p.x) - X(d.pts[i - 1].x), Y(p.y) - Y(d.pts[i - 1].y)) : 0; }, 0);
      line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
      line.getBoundingClientRect();
      line.style.transition = "stroke-dashoffset 1.6s ease-in-out";
      line.style.strokeDashoffset = 0;
    }
    d.pts.forEach(function (p, i) {
      var c = S("circle", { cx: X(p.x), cy: Y(p.y), r: i === d.cur ? 7 : 4, "class": "cwp" + (i === d.cur ? " on" : "") + (p.mark ? " " + p.mark : "") }, svg);
      if (d.onPick) { c.style.cursor = "pointer"; c.addEventListener("click", function () { d.onPick(i); }); }
      if (p.lab) T(svg, X(p.x) + (p.la || 0), Y(p.y) + (p.ly || -12), p.lab, "t-s t-b" + (p.mark ? " t-warn" : ""), p.anchor || "middle");
    });
  }

  function figCwnd() {
    var host = figure("fig-cwnd");
    if (!host) return;
    var sc = 0;
    chips(host, ["손실 신호: 중복 ACK 3개", "손실 신호: 타임아웃"], sc, function (i) { sc = i; draw(); }, "경우");
    var svg = svgIn(host, "RTT마다 cwnd가 바뀌는 모양: 슬로 스타트, 혼잡 회피, 손실 뒤의 감소");
    var nt = note(host);
    function draw() {
      var base = [1, 2, 4, 8, 16, 17, 18, 19, 20], after = sc === 0 ? [10, 11, 12, 13, 14, 15] : [1, 2, 4, 8, 10, 11];
      var ys = base.concat(after);
      var pts = ys.map(function (y, i) { return { x: i, y: y, ss: i <= 8 ? 16 : 10 }; });
      pts[4].lab = "ssthresh에 닿음"; pts[8].lab = "손실"; pts[8].mark = "loss";
      pts[9].lab = sc === 0 ? "절반에서 다시" : "1 MSS부터 다시"; pts[9].anchor = "start"; pts[9].la = 8; pts[9].ly = 26;
      var zones = [[0, 4, "z-ss", "슬로 스타트: ×2"], [4, 8, "z-ca", "혼잡 회피: +1"]];
      if (sc === 0) zones.push([9, 14, "z-ca", "혼잡 회피: +1"]);
      else zones.push([9, 13, "z-ss", "슬로 스타트"], [13, 14, "z-ca", ""]);
      cwndChart(svg, { pts: pts, ymax: 24, ystep: 4, xname: "RTT 횟수", xlab: function (p) { return String(p.x); }, zones: zones, sslab: true, anim: true, cur: -1 });
      nt.innerHTML = sc === 0
        ? "중복 ACK 3개는 뒤의 세그먼트가 도착한다는 뜻입니다. TCP Reno는 ssthresh를 cwnd의 절반(20 → 10)으로 줄이고, cwnd를 그 근처에서 다시 1씩 키웁니다. <span class=\"muted\">숫자는 모양을 보이기 위한 값입니다.</span>"
        : "타임아웃은 아무 ACK도 오지 않는다는 뜻입니다. TCP는 ssthresh를 cwnd의 절반(10)으로 줄이고, cwnd를 1 MSS로 둡니다. 그 다음 ssthresh까지 다시 슬로 스타트를 합니다. <span class=\"muted\">숫자는 모양을 보이기 위한 값입니다.</span>";
    }
    draw();
  }

  // ---------- 그림 7: 조용한 고장의 시간표 (walk.js도 씁니다) ----------
  // 가정: OSPF 기본값(Hello 10초, Dead 40초), 마지막 Hello는 고장 2초 전, Linux의 SYN 재전송 시각.
  function failTimeline(svg, now, range) {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 720 268");
    var X = function (t) { return 140 + (t + 5) * 7.6; };
    var rows = { link: 46, hello: 96, rt: 146, tcp: 196 };
    T(svg, 8, rows.link, "링크", "t-s t-b", "start");
    T(svg, 8, rows.hello, ["이웃의 Hello", ["(10초마다)", "t-muted"]], "t-s t-b", "start");
    T(svg, 8, rows.rt, ["라우터의 표", ["(OSPF)", "t-muted"]], "t-s t-b", "start");
    T(svg, 8, rows.tcp, ["끝점의 SYN", ["(TCP)", "t-muted"]], "t-s t-b", "start");
    // 축
    S("line", { x1: X(-5), y1: 236, x2: X(70), y2: 236, "class": "ln" }, svg);
    for (var t = 0; t <= 70; t += 10) { S("line", { x1: X(t), y1: 232, x2: X(t), y2: 240, "class": "ln" }, svg); T(svg, X(t), 254, String(t), "t-s t-muted"); }
    T(svg, 8, 254, "고장 뒤 시각 (초)", "t-s t-muted", "start");
    // 링크
    S("rect", { x: X(-5), y: rows.link - 6, width: X(0) - X(-5), height: 12, rx: 3, "class": "bx-ok" }, svg);
    S("rect", { x: X(0), y: rows.link - 6, width: X(70) - X(0), height: 12, rx: 3, "class": "bx-warn" }, svg);
    T(svg, X(1), rows.link - 12, "고장. 인터페이스는 켜진 채로 남음", "t-s t-warn", "start");
    // Hello
    [-2, 8, 18, 28].forEach(function (h) {
      if (h < 0) { S("circle", { cx: X(h), cy: rows.hello, r: 6, "class": "bx-ok" }, svg); T(svg, X(h), rows.hello - 12, "마지막", "t-s t-muted"); }
      else { var g = S("g", { "class": "xs" }, svg); S("line", { x1: X(h) - 6, y1: rows.hello - 6, x2: X(h) + 6, y2: rows.hello + 6 }, g); S("line", { x1: X(h) - 6, y1: rows.hello + 6, x2: X(h) + 6, y2: rows.hello - 6 }, g); }
    });
    S("line", { x1: X(-2), y1: rows.hello + 16, x2: X(38), y2: rows.hello + 16, "class": "ln-rt" }, svg);
    S("line", { x1: X(-2), y1: rows.hello + 11, x2: X(-2), y2: rows.hello + 21, "class": "ln-rt" }, svg);
    S("line", { x1: X(38), y1: rows.hello + 11, x2: X(38), y2: rows.hello + 21, "class": "ln-rt" }, svg);
    T(svg, X(18), rows.hello + 30, "Dead 간격 40초", "t-s t-rt");
    // 표
    S("rect", { x: X(-5), y: rows.rt - 7, width: X(38) - X(-5), height: 14, rx: 3, "class": "bx" }, svg);
    S("rect", { x: X(0), y: rows.rt - 7, width: X(38) - X(0), height: 14, rx: 3, "class": "bx-warn" }, svg);
    S("rect", { x: X(38), y: rows.rt - 7, width: X(70) - X(38), height: 14, rx: 3, "class": "bx-ok" }, svg);
    T(svg, X(19), rows.rt + 20, "옛 표: 패킷이 없어짐", "t-s t-warn");
    T(svg, X(39), rows.rt + 20, "LSA → 다익스트라 → 새 표", "t-s t-ok", "start");
    // SYN
    [0, 1, 3, 7, 15, 31].forEach(function (s) { var g = S("g", { "class": "xs" }, svg); var y = rows.tcp; S("line", { x1: X(s) - 5, y1: y - 5, x2: X(s) + 5, y2: y + 5 }, g); S("line", { x1: X(s) - 5, y1: y + 5, x2: X(s) + 5, y2: y - 5 }, g); });
    S("circle", { cx: X(63), cy: rows.tcp, r: 7, "class": "bx-ok" }, svg);
    T(svg, X(63), rows.tcp - 14, "63초: 연결됨", "t-s t-ok");
    T(svg, X(15), rows.tcp - 14, "간격 1, 2, 4, 8, 16초", "t-s t-muted");
    S("line", { x1: X(38), y1: rows.tcp + 14, x2: X(63), y2: rows.tcp + 14, "class": "ln-tcp" }, svg);
    T(svg, X(50.5), rows.tcp + 27, "망은 복구됨, 끝점은 기다림", "t-s t-tcp");
    // 지금
    if (range) {
      S("rect", { x: X(range[0]), y: 20, width: X(range[1]) - X(range[0]), height: 212, "class": "now-band" }, svg);
    }
    if (now != null) {
      S("line", { x1: X(now), y1: 20, x2: X(now), y2: 232, "class": "now" }, svg);
      T(svg, X(now), 14, "지금", "t-s t-b now-t");
    }
  }
  function figFail() {
    var host = figure("fig-fail");
    if (!host) return;
    var bar = document.createElement("div"); bar.className = "fig-ctl";
    bar.innerHTML = '<label class="fig-lb" for="fail-t">시각</label><input type="range" id="fail-t" min="0" max="70" value="0" style="flex:1 1 10rem"><span class="fig-lb" id="fail-v">0초</span>';
    host.appendChild(bar);
    var svg = svgIn(host, "링크가 조용히 고장 난 뒤 Hello, 라우터의 표, 끝점의 재전송이 시간에 따라 바뀌는 모습");
    var nt = note(host);
    var r = bar.querySelector("input");
    function draw() {
      var t = Number(r.value);
      bar.querySelector("#fail-v").textContent = t + "초";
      failTimeline(svg, t);
      nt.innerHTML = t < 38
        ? "<b>감지 전</b>: 라우터는 고장을 모릅니다. 옛 표대로 보내고 패킷은 없어집니다. 끝점은 재전송하고 간격을 두 배로 늘립니다."
        : t < 63
          ? "<b>재수렴 뒤</b>: 라우터의 표는 새 경로를 씁니다. 그러나 끝점은 다음 재전송 시각(63초)까지 아무것도 보내지 않습니다."
          : "<b>연결됨</b>: 끝점의 재전송이 새 경로로 갑니다. 사용자가 느낀 중단은 63초입니다. 재수렴은 38초였습니다.";
    }
    r.addEventListener("input", draw);
    draw();
  }

  window.WF = { failTimeline: failTimeline, cwndChart: cwndChart, S: S, T: T, head: head, wrap: wrap };

  document.addEventListener("DOMContentLoaded", function () {
    [figLoop, figEncap, figHost, figHops, figSwitch, figRouter, figLadder, figCwnd, figFail].forEach(function (fn) {
      try { fn(); } catch (e) { console.error("walkfig.js", fn.name, e); }
    });
  });
})();
