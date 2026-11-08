"""Run the project's checks, optionally limited to one package or the study app."""

from __future__ import annotations

import argparse
from pathlib import Path
import shlex
import subprocess
import sys

PYTHON_PACKAGES = ("sync", "learning", "finance")
APP = "learnharness"
# The app's tests that run the engine's CLI or read its tutor references, so an
# engine change checked with the `learning` scope meets them too.
ENGINE_CONTRACT_TESTS = (
    "tests/course-records.test.ts",
    "tests/engine-doctrine.test.ts",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "scope",
        nargs="?",
        choices=("all", *PYTHON_PACKAGES, APP),
        default="all",
    )
    parser.add_argument("--coverage", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    commands: list[tuple[list[str], Path]] = []
    if args.scope != APP:
        commands.extend((command, root) for command in _python_commands(args))
    if args.scope in ("all", APP, "learning"):
        app = root / APP
        if not (app / "node_modules").is_dir():
            print(f"{APP}/node_modules is missing: run `npm ci` in {APP}/ first.")
            return 1
        if args.scope == "learning":
            commands.append(
                (["npx", "tsx", "--test", *ENGINE_CONTRACT_TESTS], app),
            )
        else:
            commands.extend(
                (["npm", "run", script], app)
                for script in ("typecheck", "lint", "test")
            )
    for command, cwd in commands:
        print(f"\n{shlex.join(command)}", flush=True)
        result = subprocess.run(command, cwd=cwd, check=False)
        if result.returncode:
            return result.returncode
    return 0


def _python_commands(args: argparse.Namespace) -> list[list[str]]:
    packages = list(PYTHON_PACKAGES) if args.scope == "all" else [args.scope]
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
    return commands


if __name__ == "__main__":
    raise SystemExit(main())
