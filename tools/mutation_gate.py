"""Fail CI if mutmut reports any non-killed mutants."""

from __future__ import annotations

import subprocess
import sys
from collections import Counter


def _parse_mutmut_results(output: str) -> tuple[list[tuple[str, str]], Counter[str]]:
    entries: list[tuple[str, str]] = []
    counts: Counter[str] = Counter()
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line or ":" not in line:
            continue
        mutant, status = line.rsplit(":", 1)
        mutant_id = mutant.strip()
        status_name = status.strip()
        if not mutant_id or not status_name:
            continue
        entries.append((mutant_id, status_name))
        counts[status_name] += 1
    return entries, counts


def main() -> int:
    result = subprocess.run(
        ["mutmut", "results"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        if stdout:
            print(stdout)
        if stderr:
            print(stderr, file=sys.stderr)
        return result.returncode

    entries, counts = _parse_mutmut_results(result.stdout)
    if not entries:
        print("mutation-gate: no non-killed mutants")
        return 0

    print("mutation-gate: non-killed mutants found")
    for status_name in sorted(counts):
        print(f"  {status_name}: {counts[status_name]}")

    preview_limit = 50
    print("mutation-gate: sample entries")
    for mutant_id, status_name in entries[:preview_limit]:
        print(f"  {status_name}: {mutant_id}")
    if len(entries) > preview_limit:
        print(f"  ... and {len(entries) - preview_limit} more")

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
