#!/usr/bin/env python3
"""제출물 개인정보 마스킹과 검사.

    python3 mask.py raw/dhcp.raw.pcap out/dhcp.pcapng   # 파일 하나 마스킹
    python3 mask.py raw/ out/                           # 폴더 통째로
    python3 mask.py --check                             # 모든 w*/out/ 검사 (제출·커밋 전에)
    python3 mask.py --check w07-ethernet-arp/out        # 특정 경로만 검사

호스트(노트북)에서 실행하세요. 내 MAC, 호스트명, Tailscale 이름·주소, IPv6 주소 같은
'내 식별자'는 실행할 때 이 기계에서 직접 읽어 오고, 어디에도 저장하지 않습니다.
컨테이너 안에서는 호스트의 식별자를 볼 수 없습니다.

마스킹 규칙 (w03-w05 제출물과 같은 형식)
  MAC          제조사(OUI) 3바이트는 남기고 뒤를 00:00:NN 으로. 같은 MAC 은 같은 값
  DHCP 호스트명 host-xxxx (길이 유지)
  Tailscale    이름 -> host-xxxx / tailnet, 주소 -> 100.64.0.N, fd7a:115c:a1e0::N
  IPv6         내 주소 -> 2001:db8::N / fe80::N, EUI-64(MAC 이 박힌 주소)는 마스킹한 MAC 으로
  --ip A=B     공인 IP 등 직접 지정한 IPv4 치환
  --extra S    그 밖에 지울 문자열 (여러 번 가능)

캡처 파일은 pcap/pcapng(이더넷, Linux cooked) 를 읽어 pcap 이면 pcap, pcapng 면 pcapng 로
씁니다. 출력 이름이 .pcapng 이면 pcapng 로 씁니다. 패킷 길이는 그대로 두고, 바뀐 패킷의
IPv4/TCP/UDP/ICMPv6 체크섬은 다시 계산합니다. pcapng 의 인터페이스 이름·OS·주석 같은
옵션과 이름 해석(NRB) 블록은 지웁니다.

한계 - 이 스크립트가 '통과'라고 해도 사람이 확인해야 하는 것이 있습니다.
아래 LIMITS 목록이 --check 결과 끝에 매번 출력되고, 방문 기록처럼 판단이 필요한
항목은 파일별로 뽑아서 보여 줍니다. 커밋 훅은 이것을 확인했다고 답해야 진행합니다.
"""
import argparse, getpass, glob, ipaddress, json, os, re, socket, struct, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAC_RE = r"\b[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}\b"
V6_RE = r"(?<![\w:.])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}"
GENERIC_NAMES = {"localhost", "localhost.localdomain", "android", "iphone", "ubuntu"}
SHORT = 6                   # 이보다 짧은 이름은 바이너리 안에서 우연히 맞기 쉬워서 단어 단위로만 찾습니다
LIMITS = [
    "이 기계의 식별자만 압니다. 다른 사람·기기의 이름(친구 폰, 집 공유기 이름 등)은 DHCP 호스트명과 MAC 처럼 "
    "구조가 정해진 곳에서만 잡고, 텍스트나 페이로드 속 이름은 못 잡습니다",
    "집 공인 IP 는 알 수 없습니다. 위 '공인 IPv4' 목록에 내 집 주소가 있으면 --ip OLD=NEW 로 다시 마스킹하세요",
    "방문 기록(DNS 질의, TLS SNI, HTTP Host)은 민감한지 판단하지 않고 목록만 보여 줍니다",
    "암호화되지 않은 페이로드 내용(HTTP 본문, 쿠키, 폼 데이터)과 패킷 시각은 검사·마스킹하지 않습니다",
    "링크 타입은 이더넷과 Linux cooked 만 다룹니다 (802.11 무선 헤더 캡처는 오류)",
    "pcap/pcapng 와 텍스트 외 파일(이미지, PDF 등)은 검사하지 않습니다 ([skip] 으로 표시)",
    "6자보다 짧은 이름은 바이너리 안에서 찾지 않고, localhost 같은 흔한 이름은 제외합니다",
    "다른 기기에서 찍은 캡처라면 그 기기의 MAC·호스트명은 '내 식별자'로 알지 못합니다 (구조 검사만 적용)",
    "이미 커밋·푸시된 기록은 보지 않습니다. 훅은 이번 커밋에 들어가는 파일만 봅니다",
]
TEXT_EXT = {".txt", ".md", ".json", ".csv", ".log", ".html", ".yml", ".yaml", ".tsv"}


# ------------------------------------------------------------------ 내 식별자
def run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.TimeoutExpired):
        return ""


class Identity:
    """이 기계에서 읽은 개인 식별자. 마스킹과 검사가 같은 목록을 씁니다."""

    def __init__(self, extra=(), ip_pairs=()):
        self.in_container = os.path.exists("/.dockerenv")
        self.macs = []                      # 기본 경로 인터페이스가 먼저 -> 00:00:01
        default_if = None
        try:
            for line in open("/proc/net/route").read().splitlines()[1:]:
                f = line.split()
                if f[1] == "00000000":
                    default_if = f[0]
                    break
        except OSError:
            pass
        ifs = sorted(glob.glob("/sys/class/net/*/address"),
                     key=lambda p: p.split("/")[-2] != default_if)
        for p in ifs:
            try:
                m = bytes.fromhex(open(p).read().strip().replace(":", ""))
            except (OSError, ValueError):
                continue
            if len(m) == 6 and any(m) and m not in self.macs:
                self.macs.append(m)

        self.strings = set()                # 원문 그대로 지울 문자열
        host = socket.gethostname()
        self.strings |= {host, host.split(".")[0]}
        self.user = getpass.getuser()
        email = run(["git", "config", "user.email"]).strip()
        if email:
            self.strings.add(email)

        self.v4map = {}                     # IPv4 정확 치환
        self.v6map = {}                     # IPv6 정확 치환
        self.tailnet = None
        ts = run(["tailscale", "status", "--json"])
        if ts:
            try:
                d = json.loads(ts)
            except ValueError:
                d = {}
            self.tailnet = (d.get("MagicDNSSuffix") or "") or None
            if self.tailnet:
                self.strings.add(self.tailnet)
            for u in (d.get("User") or {}).values():
                for k in ("LoginName", "DisplayName"):
                    if u.get(k):
                        self.strings.add(u[k])
            nodes = [d.get("Self") or {}] + list((d.get("Peer") or {}).values())
            for node in nodes:
                if node.get("HostName"):
                    self.strings.add(node["HostName"])
                if node.get("DNSName"):
                    self.strings.add(node["DNSName"].rstrip(".").split(".")[0])
                for a in node.get("TailscaleIPs") or []:
                    self._add_ip(a, tailscale=True)

        # 이 기계의 IPv6 주소 전부 (link-local 도 기기마다 고유)
        try:
            for line in open("/proc/net/if_inet6"):
                hexaddr, _, plen, scope, _, ifname = line.split()
                a = ipaddress.IPv6Address(bytes.fromhex(hexaddr))
                if a.is_loopback:
                    continue
                self._add_ip(str(a), tailscale=ifname.startswith("tailscale"))
        except OSError:
            pass

        self.strings |= {s for s in extra if s}
        for pair in ip_pairs:
            old, new = pair.split("=", 1)
            self.v4map[ipaddress.IPv4Address(old).packed] = ipaddress.IPv4Address(new).packed
        self.strings = {s for s in self.strings if len(s) >= 3 and s.lower() not in GENERIC_NAMES}

    def _add_ip(self, text, tailscale=False):
        a = ipaddress.ip_address(text)
        if a.version == 4:
            if a.packed not in self.v4map:
                self.v4map[a.packed] = ipaddress.IPv4Address(f"100.64.0.{len(self.v4map) + 1}").packed
            return
        if a.packed in self.v6map:
            return
        n = len(self.v6map) + 1
        if tailscale:
            new = ipaddress.IPv6Address(f"fd7a:115c:a1e0::{n:x}")
        elif a.is_link_local:
            new = ipaddress.IPv6Address(f"fe80::{n:x}")
        else:
            new = ipaddress.IPv6Address(f"2001:db8::{n:x}")
        self.v6map[a.packed] = new.packed


def name_re(name):
    return rf"(?<![\w-]){re.escape(name)}(?![\w-])"


def masked_string(s):
    """같은 길이의 가림 문자열 (패킷 안에서는 길이가 바뀌면 안 됩니다)."""
    n = len(s)
    return ("host-" + "x" * (n - 5)) if n >= 6 else "x" * n


# ------------------------------------------------------------------ MAC
def mac_allowed(m):
    """가리지 않아도 되는 MAC: 기기 하나를 가리키지 않는 주소."""
    return (m == b"\xff" * 6 or m == b"\0" * 6
            or m[0] & 1                                   # 멀티캐스트
            or m[:5] == bytes.fromhex("00000c07ac")       # HSRP v1 가상 MAC
            or m[:4] == bytes.fromhex("00000c9f") and m[4] >> 4 == 0xF    # HSRP v2
            or m[:5] in (bytes.fromhex("00005e0001"), bytes.fromhex("00005e0002"))  # VRRP
            or m[:2] == b"\x02\x42")                      # Docker 가 만든 컨테이너 MAC


def mac_masked(m):
    return m[3:5] == b"\0\0"


def fmt_mac(m):
    return ":".join(f"{b:02x}" for b in m)


class MacMap:
    def __init__(self, first=()):
        self.map = {}
        for m in first:
            self.get(m)

    def get(self, m):
        m = bytes(m)
        if mac_allowed(m) or mac_masked(m):
            return m
        if m not in self.map:
            n = len(self.map) + 1
            if n > 255:
                raise SystemExit("MAC 이 255개를 넘습니다 - 이 스크립트의 범위 밖입니다")
            self.map[m] = m[:3] + bytes([0, 0, n])
        return self.map[m]


def eui64(m):
    return bytes([m[0] ^ 2, m[1], m[2], 0xFF, 0xFE, m[3], m[4], m[5]])


def eui64_mac(iid):
    if iid[3:5] != b"\xff\xfe":
        return None
    return bytes([iid[0] ^ 2, iid[1], iid[2], iid[5], iid[6], iid[7]])


# ------------------------------------------------------------------ 캡처 파일 읽기/쓰기
class Capture:
    """pcap/pcapng 를 패킷 목록으로. write() 는 같은 형식(또는 pcapng)으로 다시 씁니다."""

    def __init__(self, path):
        self.raw = open(path, "rb").read()
        self.nrb = 0            # 이름 해석 블록 개수 (호스트명이 들어 있을 수 있음)
        self.options = []       # 지워질 pcapng 옵션 설명
        magic = self.raw[:4]
        if magic == b"\x0a\x0d\x0d\x0a":
            self.kind = "pcapng"
            self._read_pcapng()
        elif magic in (b"\xd4\xc3\xb2\xa1", b"\xa1\xb2\xc3\xd4", b"\x4d\x3c\xb2\xa1", b"\xa1\xb2\x3c\x4d"):
            self.kind = "pcap"
            self._read_pcap()
        else:
            raise ValueError("pcap/pcapng 가 아닙니다")

    # 패킷: dict(link, ts_hi, ts_lo, data(bytearray), orig, flags)
    def _read_pcap(self):
        r = self.raw
        e = "<" if r[:4] in (b"\xd4\xc3\xb2\xa1", b"\x4d\x3c\xb2\xa1") else ">"
        self.e, self.header = e, r[:24]
        link = struct.unpack(e + "I", r[20:24])[0] & 0xFFFF
        self.links, self.packets, off = [link], [], 24
        while off + 16 <= len(r):
            sec, frac, incl, orig = struct.unpack(e + "IIII", r[off:off + 16])
            data = bytearray(r[off + 16:off + 16 + incl])
            self.packets.append(dict(link=link, ifid=0, sec=sec, frac=frac, data=data, orig=orig))
            off += 16 + incl

    def _read_pcapng(self):
        r, off = self.raw, 0
        self.packets, self.sections = [], []
        e = "<"
        ifaces = []
        while off + 12 <= len(r):
            if r[off:off + 4] == b"\x0a\x0d\x0d\x0a":
                e = "<" if r[off + 8:off + 12] == b"\x4d\x3c\x2b\x1a" else ">"
                ifaces = []
                self.sections.append(dict(e=e, ifaces=ifaces))
            btype, blen = struct.unpack(e + "II", r[off:off + 8])
            if blen < 12 or off + blen > len(r):
                raise ValueError("pcapng 블록이 깨졌습니다")
            body = r[off + 8:off + blen - 4]
            sec = self.sections[-1]
            if btype == 0x0A0D0D0A:
                self._note_options(body[16:], e, "섹션")
            elif btype == 1:                                  # IDB
                link, _, snap = struct.unpack(e + "HHI", body[:8])
                keep = self._keep_options(body[8:], e, {9, 13, 14}, "인터페이스")
                ifaces.append(dict(link=link, snap=snap, opts=keep))
            elif btype == 6:                                  # EPB
                ifid, hi, lo, cap, orig = struct.unpack(e + "IIIII", body[:20])
                pad = (cap + 3) & ~3
                flags = self._keep_options(body[20 + pad:], e, {2}, "패킷")
                self.packets.append(dict(sec=len(self.sections) - 1, ifid=ifid,
                                         link=ifaces[ifid]["link"], hi=hi, lo=lo,
                                         data=bytearray(body[20:20 + cap]), orig=orig, opts=flags))
            elif btype == 3:                                  # SPB
                orig = struct.unpack(e + "I", body[:4])[0]
                snap = ifaces[0]["snap"] or orig
                cap = min(orig, snap)
                self.packets.append(dict(sec=len(self.sections) - 1, ifid=0, link=ifaces[0]["link"],
                                         hi=0, lo=0, data=bytearray(body[4:4 + cap]), orig=orig, opts=b""))
            elif btype == 2:                                  # 옛 PB
                ifid, _, hi, lo, cap, orig = struct.unpack(e + "HHIIII", body[:20])
                self.packets.append(dict(sec=len(self.sections) - 1, ifid=ifid, link=ifaces[ifid]["link"],
                                         hi=hi, lo=lo, data=bytearray(body[20:20 + cap]), orig=orig, opts=b""))
            elif btype == 4:
                self.nrb += 1
            off += blen
        self.links = sorted({i["link"] for s in self.sections for i in s["ifaces"]})

    def _iter_options(self, raw, e):
        off = 0
        while off + 4 <= len(raw):
            code, ln = struct.unpack(e + "HH", raw[off:off + 4])
            if code == 0:
                return
            yield code, raw[off + 4:off + 4 + ln], raw[off:off + 4 + ((ln + 3) & ~3)]
            off += 4 + ((ln + 3) & ~3)

    def _note_options(self, raw, e, where):
        for code, val, _ in self._iter_options(raw, e):
            self.options.append((where, code, val))

    def _keep_options(self, raw, e, keep, where):
        out = b""
        for code, val, whole in self._iter_options(raw, e):
            if code in keep:
                out += whole
            else:
                self.options.append((where, code, val))
        return out + b"\0\0\0\0" if out else b""

    def write(self, path):
        as_ng = path.endswith(".pcapng") or self.kind == "pcapng"
        with open(path, "wb") as f:
            if not as_ng:
                f.write(self.header)
                e = self.e
                for p in self.packets:
                    f.write(struct.pack(e + "IIII", p["sec"], p["frac"], len(p["data"]), p["orig"]))
                    f.write(p["data"])
                return
            if self.kind == "pcap":       # pcap -> pcapng
                e = self.e
                nano = self.header[:4] in (b"\x4d\x3c\xb2\xa1", b"\xa1\xb2\x3c\x4d")
                snap = struct.unpack(e + "I", self.header[16:20])[0]
                opts = (struct.pack(e + "HHB3x", 9, 1, 9) + b"\0\0\0\0") if nano else b""
                sections = [dict(e=e, ifaces=[dict(link=self.links[0], snap=snap, opts=opts)])]
                packets = []
                for p in self.packets:
                    ts = p["sec"] * (10**9 if nano else 10**6) + p["frac"]
                    packets.append(dict(p, sec=0, hi=ts >> 32, lo=ts & 0xFFFFFFFF, opts=b""))
            else:
                sections, packets = self.sections, self.packets
            for si, s in enumerate(sections):
                e = s["e"]
                blk(f, e, 0x0A0D0D0A, struct.pack(e + "IHHq", 0x1A2B3C4D, 1, 0, -1))
                for i in s["ifaces"]:
                    blk(f, e, 1, struct.pack(e + "HHI", i["link"], 0, i["snap"]) + i["opts"])
                for p in packets:
                    if p["sec"] != si:
                        continue
                    d = bytes(p["data"])
                    body = struct.pack(e + "IIIII", p["ifid"], p["hi"], p["lo"], len(d), p["orig"])
                    body += d + b"\0" * (((len(d) + 3) & ~3) - len(d)) + p["opts"]
                    blk(f, e, 6, body)


def blk(f, e, btype, body):
    n = 12 + len(body)
    f.write(struct.pack(e + "II", btype, n) + body + struct.pack(e + "I", n))


# ------------------------------------------------------------------ 패킷 해부
def layers(link, d):
    """(MAC 위치 목록, L3 시작, ethertype). 모르는 링크 타입이면 None."""
    if link == 1:                                             # 이더넷
        macs, off = [0, 6], 12
        et = struct.unpack(">H", d[off:off + 2])[0] if len(d) >= 14 else 0
        while et in (0x8100, 0x88A8) and len(d) >= off + 6:   # VLAN
            off += 4
            et = struct.unpack(">H", d[off:off + 2])[0]
        return macs, off + 2, et
    if link == 113:                                           # Linux cooked v1
        if len(d) < 16:
            return [], len(d), 0
        hatype, halen = struct.unpack(">HH", d[2:6])
        return ([6] if hatype == 1 and halen == 6 else []), 16, struct.unpack(">H", d[14:16])[0]
    if link == 276:                                           # Linux cooked v2
        if len(d) < 20:
            return [], len(d), 0
        hatype = struct.unpack(">H", d[8:10])[0]
        return ([12] if hatype == 1 and d[11] == 6 else []), 20, struct.unpack(">H", d[0:2])[0]
    return None


def l4_info(d, l3, et):
    """(proto, L4 시작, 세그먼트 길이) 또는 None."""
    if et == 0x0800 and len(d) >= l3 + 20:
        ihl = (d[l3] & 0xF) * 4
        total = struct.unpack(">H", d[l3 + 2:l3 + 4])[0]
        frag = struct.unpack(">H", d[l3 + 6:l3 + 8])[0]
        if frag & 0x3FFF:                                     # 조각난 패킷은 L4 를 못 봅니다
            return None
        return d[l3 + 9], l3 + ihl, total - ihl
    if et == 0x86DD and len(d) >= l3 + 40:
        return d[l3 + 6], l3 + 40, struct.unpack(">H", d[l3 + 4:l3 + 6])[0]
    return None


def dhcp_parts(d, l4, proto):
    """DHCP 면 (BOOTP 시작, 옵션 목록[(code, 값 시작, 길이)])."""
    if proto != 17 or len(d) < l4 + 8:
        return None
    sp, dp = struct.unpack(">HH", d[l4:l4 + 4])
    if not ({sp, dp} & {67, 68}):
        return None
    b = l4 + 8
    if len(d) < b + 240 or d[b + 236:b + 240] != b"\x63\x82\x53\x63":
        return None
    opts, off = [], b + 240
    while off < len(d):
        code = d[off]
        if code == 255:
            break
        if code == 0:
            off += 1
            continue
        if off + 2 > len(d):
            break
        ln = d[off + 1]
        opts.append((code, off + 2, ln))
        off += 2 + ln
    return b, opts


def checksum(data):
    if len(data) % 2:
        data += b"\0"
    s = sum(struct.unpack(f">{len(data) // 2}H", data))
    while s >> 16:
        s = (s & 0xFFFF) + (s >> 16)
    return ~s & 0xFFFF


def fix_checksums(d, l3, et):
    if et == 0x0800:
        ihl = (d[l3] & 0xF) * 4
        d[l3 + 10:l3 + 12] = b"\0\0"
        d[l3 + 10:l3 + 12] = struct.pack(">H", checksum(bytes(d[l3:l3 + ihl])))
    info = l4_info(d, l3, et)
    if not info:
        return
    proto, l4, seglen = info
    if len(d) < l4 + seglen:                                  # 잘린 캡처는 계산할 수 없습니다
        return
    pos = {6: 16, 17: 6, 58: 2}.get(proto)
    if pos is None or (proto == 58 and et != 0x86DD):
        return
    if proto == 17 and et == 0x0800 and d[l4 + 6:l4 + 8] == b"\0\0":
        return                                                # UDP 체크섬 미사용
    if et == 0x0800:
        pseudo = bytes(d[l3 + 12:l3 + 20]) + struct.pack(">BBH", 0, proto, seglen)
    else:
        pseudo = bytes(d[l3 + 8:l3 + 40]) + struct.pack(">IxxxB", seglen, proto)
    d[l4 + pos:l4 + pos + 2] = b"\0\0"
    c = checksum(pseudo + bytes(d[l4:l4 + seglen]))
    if proto == 17 and c == 0:
        c = 0xFFFF
    d[l4 + pos:l4 + pos + 2] = struct.pack(">H", c)


def replace_all(d, start, old, new):
    n, i = 0, d.find(old, start)
    while i != -1:
        d[i:i + len(old)] = new
        n += 1
        i = d.find(old, i + len(new))
    return n


def replace_ci(d, start, s):
    """대소문자 무시하고 문자열 s 를 같은 길이 가림 문자열로."""
    old, new = s.lower().encode(), masked_string(s).encode()
    low, n = bytes(d).lower(), 0
    i = low.find(old, start)
    while i != -1:
        d[i:i + len(old)] = new
        n += 1
        i = low.find(old, i + len(old))
    return n


# ------------------------------------------------------------------ 마스킹
class Masker:
    def __init__(self, ident):
        self.id = ident
        self.macs = MacMap(ident.macs[:1])      # 내 기본 인터페이스는 항상 00:00:01
        self.count = {}

    def bump(self, what, n=1):
        if n:
            self.count[what] = self.count.get(what, 0) + n

    def v6(self, a):
        a = bytes(a)
        if a in self.id.v6map:
            return self.id.v6map[a]
        mac = eui64_mac(a[8:])
        if mac and not mac_masked(mac) and not mac_allowed(mac):
            return a[:8] + eui64(self.macs.get(mac))
        return a

    def packet(self, p):
        d, before = p["data"], bytes(p["data"])
        lay = layers(p["link"], d)
        if lay is None:
            raise ValueError(f"지원하지 않는 링크 타입 {p['link']} (이더넷/Linux cooked 만)")
        macpos, l3, et = lay
        for o in macpos:
            if len(d) >= o + 6:
                d[o:o + 6] = self.macs.get(d[o:o + 6])
        if et == 0x0806 and len(d) >= l3 + 8 and d[l3 + 4] == 6:          # ARP
            pl = d[l3 + 5]
            for o in (l3 + 8, l3 + 8 + 6 + pl):
                if len(d) >= o + 6:
                    d[o:o + 6] = self.macs.get(d[o:o + 6])
            if pl == 4:
                for o in (l3 + 14, l3 + 24):
                    if bytes(d[o:o + 4]) in self.id.v4map:
                        d[o:o + 4] = self.id.v4map[bytes(d[o:o + 4])]
        if et == 0x0800 and len(d) >= l3 + 20:
            for o in (l3 + 12, l3 + 16):
                if bytes(d[o:o + 4]) in self.id.v4map:
                    d[o:o + 4] = self.id.v4map[bytes(d[o:o + 4])]
                    self.bump("IPv4 주소")
        if et == 0x86DD and len(d) >= l3 + 40:
            for o in (l3 + 8, l3 + 24):
                new = self.v6(d[o:o + 16])
                if new != bytes(d[o:o + 16]):
                    d[o:o + 16] = new
                    self.bump("IPv6 주소")
        info = l4_info(d, l3, et)
        dh = info and dhcp_parts(d, info[1], info[0])
        if dh:
            b, opts = dh
            for o in (b + 12, b + 16, b + 20, b + 24):                    # ciaddr..giaddr
                if bytes(d[o:o + 4]) in self.id.v4map:
                    d[o:o + 4] = self.id.v4map[bytes(d[o:o + 4])]
            if d[b + 1] == 1 and d[b + 2] == 6:
                d[b + 28:b + 34] = self.macs.get(d[b + 28:b + 34])
            for code, v, ln in opts:
                if code == 12 and ln:                                      # 호스트명
                    name = bytes(d[v:v + ln]).decode("ascii", "replace")
                    if not re.fullmatch(r"(host-)?x+", name):
                        d[v:v + ln] = masked_string(name).encode()[:ln]
                        self.bump("DHCP 호스트명")
                elif code == 81 and ln > 3:                                # FQDN
                    d[v + 3:v + ln] = bytes(c if c < 0x20 else 0x78 for c in d[v + 3:v + ln])
                    self.bump("DHCP FQDN")
                elif code == 61 and ln == 7 and d[v] == 1:                 # client id = MAC
                    d[v + 1:v + 7] = self.macs.get(d[v + 1:v + 7])
                elif code in (50, 54) and ln == 4 and bytes(d[v:v + 4]) in self.id.v4map:
                    d[v:v + 4] = self.id.v4map[bytes(d[v:v + 4])]
        # 남은 곳 어디든 (DHCPv6 DUID, ND 옵션, mDNS 이름 ...)
        for m in self.id.macs:
            if m in d or eui64(m) in d:
                self.macs.get(m)
        for old, new in list(self.macs.map.items()):
            replace_all(d, l3, old, new)
            replace_all(d, l3, eui64(old), eui64(new))
        for old, new in self.id.v6map.items():
            replace_all(d, l3, old, new)
        for s in self.id.strings:
            if len(s) >= SHORT:
                self.bump("이름 문자열", replace_ci(d, 0, s))
        if bytes(d[l3:]) != before[l3:]:
            fix_checksums(d, l3, et)
        if bytes(d) != before:
            self.bump("바뀐 패킷")

    def capture(self, src, dst):
        cap = Capture(src)
        for p in cap.packets:                     # 먼저 모든 MAC 을 등록해서 번호를 고정
            lay = layers(p["link"], p["data"])
            if lay:
                for o in lay[0]:
                    self.macs.get(p["data"][o:o + 6])
        for p in cap.packets:
            self.packet(p)
        cap.write(dst)
        if cap.options:
            self.bump("지운 pcapng 옵션", len(cap.options))
        if cap.nrb:
            self.bump("지운 이름 해석 블록", cap.nrb)

    def text(self, s):
        def mac(m):
            raw = bytes.fromhex(re.sub(r"[:-]", "", m.group(0)))
            new = self.macs.get(raw)
            if new == raw:
                return m.group(0)
            self.bump("MAC")
            out = m.group(1).join(f"{b:02x}" for b in new)
            return out.upper() if m.group(0).isupper() else out
        s = re.sub(MAC_RE, mac, s)

        def v6(m):
            tok = m.group(0)
            addr, _, rest = tok.partition("/")
            core, pct, zone = addr.partition("%")
            try:
                a = ipaddress.IPv6Address(core)
            except ValueError:
                return tok
            new = self.v6(a.packed)
            if new == a.packed:
                return tok
            self.bump("IPv6 주소")
            return str(ipaddress.IPv6Address(new)) + pct + zone + ("/" + rest if rest else "")
        s = re.sub(V6_RE + r"(?:%[\w.-]+)?(?:/\d{1,3})?(?![\w:])", v6, s)

        for old, new in self.id.v4map.items():
            o, n = str(ipaddress.IPv4Address(old)), str(ipaddress.IPv4Address(new))
            s, k = re.subn(rf"(?<![\d.]){re.escape(o)}(?![\d])", n, s)
            self.bump("IPv4 주소", k)
        if self.id.tailnet:
            s, k = re.subn(re.escape(self.id.tailnet), "tailnet.ts.net"
                           if self.id.tailnet.endswith(".ts.net") else "tailnet", s, flags=re.I)
            self.bump("tailnet 이름", k)
        for name in sorted(self.id.strings, key=len, reverse=True):
            s, k = re.subn(name_re(name), masked_string(name), s, flags=re.I)
            self.bump("이름 문자열", k)
        s, k = re.subn(rf"/home/{re.escape(self.id.user)}\b", "/home/user", s)
        self.bump("홈 경로", k)
        s, k = re.subn(rf"\b{re.escape(self.id.user)}@", "user@", s)
        self.bump("사용자 이름", k)
        return s


# ------------------------------------------------------------------ 검사
def check_capture(path, ident):
    problems = []
    try:
        cap = Capture(path)
    except ValueError as e:
        return [f"읽을 수 없음: {e}"]
    raw = cap.raw
    for m in ident.macs:
        if m in raw:
            problems.append(f"내 MAC {fmt_mac(m)[:8]}:.. 이 그대로 있음")
        if eui64(m) in raw:
            problems.append(f"내 MAC 이 박힌 IPv6 주소(EUI-64)가 있음")
    low = raw.lower()
    for s in ident.strings:
        if len(s) >= SHORT and s.lower().encode() in low:
            problems.append(f"식별 문자열 {s[:2]}… ({len(s)}자) 이 있음")
    for a in ident.v6map:
        if a in raw:
            problems.append(f"내 IPv6 주소 {ipaddress.IPv6Address(a)} 가 있음")
    if cap.nrb:
        problems.append("이름 해석 블록(NRB) 이 있음 - 호스트명이 들어 있을 수 있음")
    for where, code, val in cap.options:
        # 주석, 인터페이스 설명·주소·MAC 만 문제로 봅니다 (OS·프로그램 이름은 무해)
        if code == 1 or (where == "인터페이스" and code in (3, 4, 5, 6, 7)):
            problems.append(f"pcapng {where} 옵션 {code} (주석/설명/주소)")
    seen = set()
    for p in cap.packets:
        d = p["data"]
        lay = layers(p["link"], d)
        if lay is None:
            problems.append(f"링크 타입 {p['link']} 은 검사하지 못함")
            break
        macpos, l3, et = lay
        found = [bytes(d[o:o + 6]) for o in macpos if len(d) >= o + 6]
        if et == 0x0806 and len(d) >= l3 + 8 and d[l3 + 4] == 6:
            pl = d[l3 + 5]
            found += [bytes(d[o:o + 6]) for o in (l3 + 8, l3 + 14 + pl) if len(d) >= o + 6]
        if et == 0x86DD and len(d) >= l3 + 40:
            for o in (l3 + 8, l3 + 24):
                mac = eui64_mac(bytes(d[o + 8:o + 16]))
                if mac:
                    found.append(mac)
        info = l4_info(d, l3, et)
        dh = info and dhcp_parts(d, info[1], info[0])
        if dh:
            b, opts = dh
            found.append(bytes(d[b + 28:b + 34]))
            for code, v, ln in opts:
                if code == 12:
                    name = bytes(d[v:v + ln]).decode("ascii", "replace")
                    if not re.fullmatch(r"(host-)?x+", name):
                        problems.append(f"DHCP 호스트명이 가려지지 않음 ({len(name)}자)")
                if code == 61 and ln == 7 and d[v] == 1:
                    found.append(bytes(d[v + 1:v + 7]))
        for m in found:
            if not mac_allowed(m) and not mac_masked(m) and m not in seen:
                seen.add(m)
                problems.append(f"가려지지 않은 MAC {fmt_mac(m)[:8]}:..")
    return list(dict.fromkeys(problems))


def dns_names(payload):
    """DNS 메시지의 질문 이름들 (압축 안 된 질문 부분만)."""
    if len(payload) < 12:
        return []
    qd = struct.unpack(">H", payload[4:6])[0]
    names, off = [], 12
    for _ in range(min(qd, 8)):
        labels = []
        while off < len(payload):
            n = payload[off]
            if n == 0 or n & 0xC0:
                off += 1 if n == 0 else 2
                break
            labels.append(bytes(payload[off + 1:off + 1 + n]).decode("ascii", "replace"))
            off += 1 + n
        off += 4
        if labels:
            names.append(".".join(labels))
    return names


def tls_sni(payload):
    """TLS ClientHello 의 server_name. 잘린 캡처면 None."""
    try:
        if payload[0] != 0x16 or payload[5] != 1:
            return None
        off = 9 + 2 + 32
        off += 1 + payload[off]                                   # session id
        off += 2 + struct.unpack(">H", payload[off:off + 2])[0]   # cipher suites
        off += 1 + payload[off]                                   # compression
        end = off + 2 + struct.unpack(">H", payload[off:off + 2])[0]
        off += 2
        while off + 4 <= min(end, len(payload)):
            et, ln = struct.unpack(">HH", payload[off:off + 4])
            if et == 0:
                n = struct.unpack(">H", payload[off + 7:off + 9])[0]
                return bytes(payload[off + 9:off + 9 + n]).decode("ascii", "replace")
            off += 4 + ln
    except (IndexError, struct.error):
        pass
    return None


def review_capture(cap):
    """사람이 판단해야 하는 것: 방문 기록."""
    dns, sni, http = set(), set(), set()
    for p in cap.packets:
        d = p["data"]
        lay = layers(p["link"], d)
        if not lay:
            continue
        _, l3, et = lay
        info = l4_info(d, l3, et)
        if not info:
            continue
        proto, l4, _ = info
        if proto == 17 and len(d) >= l4 + 8:
            sp, dp = struct.unpack(">HH", d[l4:l4 + 4])
            if {sp, dp} & {53, 5353, 5355}:
                dns.update(dns_names(d[l4 + 8:]))
        elif proto == 6 and len(d) >= l4 + 20:
            pl = d[l4 + ((d[l4 + 12] >> 4) * 4):]
            name = tls_sni(pl)
            if name:
                sni.add(name)
            m = re.search(rb"\r\nHost: *([^\r\n]+)", bytes(pl[:2048]))
            if m:
                http.add(m.group(1).decode("ascii", "replace"))
    out = []
    for label, names in (("DNS 질의", dns), ("TLS SNI", sni), ("HTTP Host", http)):
        if names:
            out.append(f"{label} {len(names)}개: " + ", ".join(sorted(names)))
    return out


def review_text(s):
    ips = set()
    for m in re.finditer(r"(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])", s):
        try:
            a = ipaddress.IPv4Address(m.group(1))
        except ValueError:
            continue
        if a.is_global and not a.is_multicast:
            ips.add(m.group(1))
    if not ips:
        return []
    shown_ = sorted(ips, key=lambda x: ipaddress.IPv4Address(x))
    more = f" 외 {len(ips) - 15}개" if len(ips) > 15 else ""
    return [f"공인 IPv4 {len(ips)}개 (내 집 주소가 섞였는지): " + ", ".join(shown_[:15]) + more]


def check_text(path, ident):
    s = open(path, encoding="utf-8", errors="replace").read()
    problems = []
    for m in re.finditer(MAC_RE, s):
        raw = bytes.fromhex(re.sub(r"[:-]", "", m.group(0)))
        if not mac_allowed(raw) and not mac_masked(raw):
            line = s.count("\n", 0, m.start()) + 1
            problems.append(f"{line}행: 가려지지 않은 MAC {m.group(0)[:8]}:..")
    for m in re.finditer(V6_RE + r"(?![\w:])", s):
        try:
            a = ipaddress.IPv6Address(m.group(0))
        except ValueError:
            continue
        line = s.count("\n", 0, m.start()) + 1
        mac = eui64_mac(a.packed[8:])
        if a.packed in ident.v6map:
            problems.append(f"{line}행: 내 IPv6 주소")
        elif mac and not mac_allowed(mac) and not mac_masked(mac):
            problems.append(f"{line}행: MAC 이 박힌 IPv6 주소(EUI-64)")
    for name in ident.strings:
        m = re.search(name_re(name), s, flags=re.I)
        if m:
            problems.append(f"{s.count(chr(10), 0, m.start()) + 1}행: 식별 문자열 {name[:2]}… ({len(name)}자)")
    for a in ident.v4map:
        o = str(ipaddress.IPv4Address(a))
        m = re.search(rf"(?<![\d.]){re.escape(o)}(?![\d])", s)
        if m:
            problems.append(f"{s.count(chr(10), 0, m.start()) + 1}행: 지정/내 IPv4 주소 {o}")
    for m in re.finditer(r"\b([\w-]+)\.ts\.net\b", s):
        if not re.fullmatch(r"tailnet(-x+)?|host-x+|x+", m.group(1)):
            problems.append(f"{s.count(chr(10), 0, m.start()) + 1}행: Tailscale 이름 ({m.group(1)[:4]}…)")
            break
    m = re.search(rf"/home/{re.escape(ident.user)}\b", s)
    if m:
        problems.append(f"{s.count(chr(10), 0, m.start()) + 1}행: 홈 경로 /home/{ident.user}")
    return problems


def is_capture(path):
    with open(path, "rb") as f:
        return f.read(4) in (b"\x0a\x0d\x0d\x0a", b"\xd4\xc3\xb2\xa1", b"\xa1\xb2\xc3\xd4",
                             b"\x4d\x3c\xb2\xa1", b"\xa1\xb2\x3c\x4d")


def is_text(path):
    if os.path.splitext(path)[1].lower() in TEXT_EXT:
        return True
    try:
        open(path, encoding="utf-8").read(4096)
        return b"\0" not in open(path, "rb").read(4096)
    except (UnicodeDecodeError, OSError):
        return False


def files_under(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, dirs, files in os.walk(p):
                dirs[:] = [x for x in dirs if x not in ("__pycache__", ".git")]
                for f in sorted(files):
                    yield os.path.join(root, f)
        elif os.path.exists(p):
            yield p


def shown(f, paths):
    """저장소 안이면 저장소 기준, 밖(훅의 임시 폴더 등)이면 검사 대상 폴더 기준 경로."""
    f = os.path.abspath(f)
    if f.startswith(HERE + os.sep):
        return os.path.relpath(f, HERE)
    for p in paths:
        p = os.path.abspath(p)
        if os.path.isdir(p) and f.startswith(p + os.sep):
            return os.path.relpath(f, p)
    return f


def do_check(paths, ident):
    if not paths:
        paths = sorted(glob.glob(os.path.join(HERE, "w*", "out")))
    bad, review, skipped = 0, [], []
    for f in files_under(paths):
        rel = shown(f, paths)
        if is_capture(f):
            probs = check_capture(f, ident)
            try:
                items = review_capture(Capture(f))
            except ValueError:
                items = []
        elif is_text(f):
            probs = check_text(f, ident)
            items = review_text(open(f, encoding="utf-8", errors="replace").read())
        else:
            print(f"  [skip]  {rel}  (검사할 수 없는 형식 - 직접 확인하세요)")
            skipped.append(rel)
            continue
        if items:
            review.append((rel, items))
        if probs:
            bad += 1
            print(f"  [!!]    {rel}")
            for x in probs[:20]:
                print(f"            - {x}")
            if len(probs) > 20:
                print(f"            ... 외 {len(probs) - 20}건")
        else:
            print(f"  [ok]    {rel}")
    print()
    if review or skipped:
        print("  == 직접 확인할 것 (자동으로 판단하지 않음)")
        for rel, items in review:
            print(f"  {rel}")
            for x in items:
                print(f"      - {x[:600]}{' …' if len(x) > 600 else ''}")
        for rel in skipped:
            print(f"  {rel}\n      - 검사하지 못한 형식. 직접 열어 보세요")
        print()
    print("  == 이 검사의 한계")
    for x in LIMITS:
        print(f"   - {x}")
    print()
    if bad:
        print(f"  {bad}개 파일에 개인정보가 남아 있습니다. raw/ 원본에서 다시 마스킹하세요:")
        print(f"      python3 mask.py <원본> <out/파일>")
        return 1
    print("  자동 검사 통과. 위의 '직접 확인할 것'과 '한계'는 사람이 확인해야 합니다.")
    return 0


def do_mask(src, dst, ident):
    m = Masker(ident)
    pairs = []
    if os.path.isdir(src):
        for f in files_under([src]):
            pairs.append((f, os.path.join(dst, os.path.relpath(f, src))))
    else:
        if os.path.isdir(dst):
            dst = os.path.join(dst, os.path.basename(src))
        pairs.append((src, dst))
    for s, d in pairs:
        if os.path.abspath(s) == os.path.abspath(d):
            raise SystemExit(f"원본을 덮어쓰지 않습니다: {s}")
        os.makedirs(os.path.dirname(os.path.abspath(d)), exist_ok=True)
        if is_capture(s):
            m.capture(s, d)
        elif is_text(s):
            open(d, "w", encoding="utf-8").write(m.text(open(s, encoding="utf-8").read()))
        else:
            print(f"  [skip]  {s}  (모르는 형식 - 복사하지 않았습니다)")
            continue
        print(f"  {s} -> {d}")
    print()
    for k, v in m.count.items():
        print(f"    {k:<16} {v}")
    for old, new in m.macs.map.items():
        print(f"    MAC {fmt_mac(old)[:8]}:.. -> {fmt_mac(new)}")
    print()
    return do_check([d for _, d in pairs if os.path.exists(d)], ident)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
                                epilog="이 검사의 한계:\n" + "\n".join("  - " + x for x in LIMITS))
    p.add_argument("paths", nargs="*", help="마스킹: 원본 출력 / 검사: 검사할 파일·폴더")
    p.add_argument("--check", action="store_true", help="마스킹하지 않고 검사만")
    p.add_argument("--extra", action="append", default=[], help="추가로 지울 문자열")
    p.add_argument("--ip", action="append", default=[], metavar="OLD=NEW", help="IPv4 치환")
    a = p.parse_args()

    ident = Identity(a.extra, a.ip)
    if ident.in_container:
        print("  ! 컨테이너 안입니다. 호스트의 MAC·호스트명·Tailscale 정보를 볼 수 없으니 호스트에서 실행하세요.\n")
    if a.check:
        return do_check(a.paths, ident)
    if len(a.paths) != 2:
        p.print_help()
        return 2
    return do_mask(a.paths[0], a.paths[1], ident)


if __name__ == "__main__":
    sys.exit(main())
