# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A university Computer Networks lab (Korea University Sejong, 2026-2), weeks 2–7. The user is the **student solving the labs**: the `task*_*.py` files are deliberately committed as stubs (`raise NotImplementedError`) and implementing them is the job. Keep each task's rules (e.g. Task 1 forbids the tool that normally does the work — no `dig +trace`, no `ipaddress`-style shortcuts where the task says to build it yourself). Read the week's `taskN.md` for requirements (R1, R2, …) before writing code. Lab prose is English; Dockerfile, compose and script comments are Korean.

## Layout and conventions

Every `wNN-topic/` folder has the same shape: `README.md`, `task1.md`–`task3.md`, `task{1,2,3}_*.py` (student code), `bench.py` (Task 3 harness — **never edit**), `test_tasks.py`. Task 1 = implementation, Task 2 = measurement on the student's own machine/networks, Task 3 = beat a deliberately bad `Baseline*` class as scored by `bench.py`. `w02-agent/` has only markdown (no code). `w06-routing/` additionally has `scenario.sh` and `topology/r{1,2,3}/` (FRR OSPF configs).

Submissions go in `wNN-*/out/`, which is gitignored (as are `*.pcap`/`*.pcapng`). `out/observation.md` (2–3 lines per task) is the centre of the grade; `check.py`'s `SPEC` dict is the authoritative list of required files per week and only checks presence/size, not content.

## Commands

Run from inside the week folder (`cd w03-dns`):

```bash
python3 task1_*.py --verify        # Task 1 self-check (w03–w07; w03 also takes a name arg)
python3 bench.py                   # Task 3 baseline only
python3 bench.py --yours           # baseline vs. your class (YourCache etc.); save to out/bench.txt
python3 test_tasks.py              # all checks; --task N for one
python3 ../check.py w03            # format check of out/ (from repo root: python3 check.py w03)
```

Container (identical tool versions for everyone): `docker compose build && docker compose run --rm lab` — repo mounted at `/lab`. Week 6 Task 2 needs `bash w06-routing/scenario.sh {up|routes|cut|restore|cost|down}` (runs `docker compose --profile routing`, FRR v9.1.0 routers; writes into `w06-routing/out/`).

Tasks 1 and 3 are pure Python and offline (Task 3 harnesses are simulated and deterministic); Task 2 and w03's `--verify` need real network access. Path (B) uses Kurose–Ross trace files placed in `traces/` (not committed; cite the source per `traces/README.md`).

## Environment gotchas

- Run the container with `--user $(id -u):$(id -g)`; as root it leaves root-owned `out/` and `__pycache__` in the bind mount.
- `tshark -i` fails inside the container; capture with `tcpdump -w` (or on the host) and convert with `tshark -r in.pcap -F pcapng -w out.pcapng`. tshark 4.x prints booleans as `True`/`False`.
- `dnspython` is documented as present but is **not** in the image; shell out to `dig`.
- Check for VPN/tunnel (e.g. Cloudflare WARP, Tailscale) before any capture or throughput measurement; it changes results.
- Captures and outputs can contain personal data (site history, host tailnet names, MAC/IP addresses, DHCP hostnames). This repo is public: mask or drop them before anything lands in `out/`, without making the analysis impossible.
