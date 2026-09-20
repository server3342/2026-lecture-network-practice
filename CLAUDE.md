# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The lab repository for a Computer Networks course (Korea University Sejong, 2026-2), **distributed by the instructor to students**. The person working here is the student, and the job is to solve the labs: implement the `task*.py` stubs, take the measurements, and write up `out/`. Using a coding agent for this is expected (w02 is about exactly that). Weeks 2–7 have a folder; weeks 9–15 are a project and have none. Textbook: Kurose & Ross, 9th ed.

Language split: what students read (`README.md`, `taskN.md`, `.py` docstrings) is **English**; infra files (`compose.yml`, `Dockerfile`, `w06-routing/scenario.sh`) and commit messages are **Korean**. Match the file you are in.

Remotes: `origin` is the **instructor's** repository. The student's own copy is `server3342` (public), and `main` tracks it. Do not push to `origin`.

## Week layout

Every `wNN-topic/` has the same shape, and the three tasks are always the same kind:

| Task | Kind | Files |
|---|---|---|
| 1 | implement the mechanism yourself (the tool that normally does it is not allowed) | `task1_*.py`, usually with `--verify` |
| 2 | measure on your own machine and networks | `task2_*.py` (or none) + files in `out/` |
| 3 | beat a deliberately bad baseline | `task3_*.py` (holds `BaselineX` and a `YourX` stub) + `bench.py` |

`test_tasks.py` runs the week's checks (`--task N` for one). The root `check.py` only verifies that the files in `out/` exist and are non-empty (plus a minimum length for `observation.md`). Neither can tell whether the work is understood, which is why `out/observation.md` (2–3 lines per task) is the centre of the grade.

## Rules that belong to the assignment

- **Do not edit `bench.py`.** Task 3 requirement R2 makes editing the harness a fail condition. Fix the code under test instead.
- **Task 2 is real measurement — do not invent or smooth numbers.** If a vantage point is missing (e.g. only one network is available), say so in `out/report.md` and `observation.md` and state what that weakens. Every week's `task2.md` has a "path (B)" that describes the honest fallback.
- **`out/observation.md` must reflect what was actually observed.** Derive claims from the run outputs, re-check figures against them, and remind the student to read it: they are the one graded on understanding it.
- **Submission is the repository URL with `wNN-*/out/` committed.** But `.gitignore` excludes `*/out/` and `*.pcap`/`*.pcapng`, so use `git add -f wNN-*/out`. The repo is public: before committing a capture, list its addresses and names (`tshark -r ... -T fields -e ip.src -e ip.dst`) and make sure nothing personal is in it.
- Baseline figures the harnesses print (they are seeded, so reproducible): w03 `325 upstream / 67.5% / 266 stale`; w04 fixed window `goodput 986.8 / loss 37.4% / queue 8.8`; w06 full recompute `1001 SPF runs`; w07 FIFO `wasted 323,380`. **w05 is wall-clock** (`lookups/s`) and varies by machine (846 here); compare against the baseline on the same machine, as a ratio.

## Commands

Run from the repo root; a week's tools run from inside its folder.

```bash
docker compose build                       # once; ubuntu:24.04 with dig tshark tcpdump iperf3 python3 ...
docker compose run --rm lab                # interactive shell, repo mounted at /lab
docker compose run --rm -T --user $(id -u):$(id -g) -e PYTHONDONTWRITEBYTECODE=1 lab bash -c 'cd w03-dns && <cmd>'
docker compose down                        # `run` creates a network; remove it afterwards

cd w03-dns
python3 bench.py [--yours]                 # Task 3 harness (any week with a bench.py)
python3 task1_resolve.py --verify          # Task 1 self-check (file name differs per week)
python3 test_tasks.py [--task 3]           # whole week / one task
python3 ../check.py w03                    # format check of out/
```

Everything is stdlib-only Python 3; there is no build step, linter or package manifest. w06 is the only week with real infrastructure: three FRR OSPF routers under the `routing` compose profile, driven by `w06-routing/scenario.sh` (`up | routes | cut | restore | cost | down`).

## Container gotchas (each one hit in practice)

- **Run as the host user** (`--user $(id -u):$(id -g)`). The container is root and the repo is a bind mount, so a plain `docker compose run` leaves root-owned `out/` and `__pycache__` on the host that the student then cannot write to (`PermissionError` on the next run). Only packet capture needs root.
- **`tshark -i` cannot capture in the container** (`cap_set_proc: Operation not permitted`). Capture with `tcpdump -i eth0 -U -w x.pcap port 53`, then convert: `tshark -r x.pcap -F pcapng -w out/x.pcapng`. A capture taken inside the container contains only the container's own traffic (private `172.x` address); anything about the student's real network must be captured on the host with Wireshark.
- **tshark 4.x prints flags as `True`/`False`, not `1`/`0`.** w03's `test_tasks.py` compared against `"0"`/`"1"` and failed on every capture; it was patched to accept both. The capture checks in w04/w05/w07 also parse tshark output and were not examined for the same problem.
- **`dnspython` is not installed**, although `w03-dns/task1.md` says it is. Use `dig` (`+norecurse` for iterative walks), or add `python3-dnspython` to the `Dockerfile`.
- The container's system resolver is Docker's `127.0.0.11`, forwarding to the host's. Its `resolv.conf` can carry the host's Tailscale tailnet name (`*.ts.net`); do not copy it into anything under `out/`.
- The container reaches root servers and public resolvers on UDP/53, so the real DNS works for w03. There is no outbound-53 problem to route around unless the student's own network blocks it.
