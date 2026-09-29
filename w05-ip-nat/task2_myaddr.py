#!/usr/bin/env python3
"""Week 5 · Task 2 — Where exactly are you on the internet?

Textbook §4.3.2 (addressing, DHCP) and §4.3.3 (NAT).

This is the hands-on task. It asks what address your machine has, what address
the rest of the world sees, and why those two are usually different.

    python3 task2_myaddr.py --collect     # gather what your OS will tell you
    python3 task2_myaddr.py --report      # your analysis

Run it on **two networks**. Campus Wi-Fi and phone tethering behave differently
here, and the difference is the lesson.
"""
import argparse, json, os, platform, re, socket, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")


def sh(*cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=15).stdout
    except Exception as e:
        return f"<failed: {e}>"


def local_facts():
    """Raw output only. Reading it is your job, not this script's."""
    osname = platform.system()
    if osname == "Darwin":
        return {"os": osname,
                "ifconfig": sh("ifconfig"),
                "route": sh("route", "-n", "get", "default"),
                "dns": sh("scutil", "--dns")}
    if osname == "Linux":
        return {"os": osname,
                "ip_addr": sh("ip", "addr"),
                "ip_route": sh("ip", "route"),
                "dns": sh("cat", "/etc/resolv.conf")}
    return {"os": osname,
            "ipconfig": sh("ipconfig", "/all"),
            "route": sh("route", "print")}


def public_address():
    """What a server on the outside says your address is."""
    out = sh("curl", "-s", "--max-time", "10", "https://api.ipify.org")
    return out.strip() or None


def mask_text(text):
    """Hide what identifies *you* while leaving what the analysis needs.

    Kept: private addresses, masks, gateways, routes, the /16 of the public address,
    the vendor half (OUI) of a MAC, and any 100.64/10 address on a real network
    (that is the evidence for carrier-grade NAT).
    Masked: the device half of MAC addresses, IPv6 interface identifiers, the address
    of a VPN interface (tailscale/wg/tun), tailnet domain names, your hostname.
    """
    def mac(m):
        b = m.group(0).lower()
        return b if b in ("00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff") else b[:8] + ":xx:xx:xx"
    text = re.sub(r"\b[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}\b", mac, text)
    text = re.sub(r"\b(wlx|enx)([0-9a-f]{6})[0-9a-f]{6}\b", r"\1\2xxxxxx", text)
    text = re.sub(r"\bfe80::[0-9a-f:]+", "fe80::xxxx", text)
    text = re.sub(r"\bf[cd][0-9a-f]{2}:[0-9a-f:]+", "fdxx::xxxx", text)
    # a global IPv6 address: keep the provider's /32, hide the customer prefix and interface id
    text = re.sub(r"\b([23][0-9a-f]{3}:[0-9a-f]{1,4}):[0-9a-f]{1,4}:[0-9a-f]{1,4}:[0-9a-f:]+",
                  r"\1:xxxx:xxxx:xxxx:xxxx:xxxx", text)
    text = re.sub(r"[A-Za-z0-9-]+\.ts\.net", "tailnet-xxxx.ts.net", text)
    host = socket.gethostname()
    if host:
        text = re.sub(re.escape(host), "HOST", text, flags=re.IGNORECASE)
    out, vpn = [], False
    for line in text.splitlines():
        if re.match(r"^\d+: ", line):                      # a new interface block in `ip addr`
            vpn = bool(re.match(r"^\d+: (tailscale|wg|tun|utun|zt)", line))
        if vpn:
            line = re.sub(r"(inet )\d+\.\d+\.\d+\.\d+", r"\1x.x.x.x", line)
        out.append(line)
    return "\n".join(out) + ("\n" if text.endswith("\n") else "")


def mask_public(addr):
    """203.0.113.25 -> 203.0.113.xxx : enough to see the campus block, not the host."""
    return re.sub(r"\.\d+$", ".xxx", addr) if addr and "." in addr else addr


def collect(label):
    os.makedirs(OUT, exist_ok=True)
    raw_local, pub = local_facts(), public_address()
    local = {k: (mask_text(v) if isinstance(v, str) else v) for k, v in raw_local.items()}
    # The unmasked original stays next to the code in raw/, which .gitignore keeps out of git.
    raw_path = os.path.join(HERE, "raw", "addresses.raw.json")
    os.makedirs(os.path.dirname(raw_path), exist_ok=True)
    raw_all = json.load(open(raw_path)) if os.path.exists(raw_path) else []
    raw_all.append({"label": label, "local": raw_local, "public": pub})
    json.dump(raw_all, open(raw_path, "w"), indent=2)
    record = {"label": label, "local": local, "public": mask_public(pub)}
    path = os.path.join(OUT, "addresses.json")
    all_records = json.load(open(path)) if os.path.exists(path) else []
    all_records.append(record)
    json.dump(all_records, open(path, "w"), indent=2)
    print(f"  public address seen from outside: {pub}   (stored as {record['public']})")
    print(f"  -> out/addresses.json  ({len(all_records)} record(s))")
    print("\n  Now read the raw output yourself and answer the questions in task2.md.")
    print("  The script deliberately does not parse it for you.")


def report():
    raise NotImplementedError(
        "write out/report.md by hand, or generate it - see task2.md")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--collect", metavar="LABEL",
                   help='where you are, e.g. "campus wifi"')
    p.add_argument("--report", action="store_true")
    a = p.parse_args()
    if a.collect:
        collect(a.collect)
    elif a.report:
        report()
    else:
        p.print_help()
