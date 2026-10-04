"""Run the project's checks, optionally limited to one feature package."""

from __future__ import annotations

import argparse
from pathlib import Path
import shlex
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "scope", nargs="?", choices=("all", "sync", "learning"), default="all"
    )
    parser.add_argument("--coverage", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    packages = ["sync", "learning"] if args.scope == "all" else [args.scope]
    paths = (
        ["."]
        if args.scope == "all"
        else [args.scope, f"tests/{args.scope}", "tools/check.py"]
    )
    python = sys.executable
    commands = [
        [python, "-m", "ruff", "check", *paths],
        [python, "-m", "ruff", "format", "--check", *paths],
        [python, "-m", "mypy", *packages, "--strict"],
        [str(Path(python).parent / "lint-imports"), "--config", ".importlinter"],
    ]
    tests = [
        python,
        "-m",
        "pytest",
        "tests" if args.scope == "all" else f"tests/{args.scope}",
    ]
    if args.coverage:
        tests.extend(f"--cov={package}" for package in packages)
        tests.extend(["--cov-branch", "--cov-report=term-missing:skip-covered"])
    commands.append(tests)
    if "sync" in packages:
        commands.append([python, "tools/regenerate_baselines.py", "--check"])
    for command in commands:
        print(f"\n{shlex.join(command)}", flush=True)
        result = subprocess.run(command, cwd=root, check=False)
        if result.returncode:
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
