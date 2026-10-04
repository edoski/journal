"""Agent CLI: parse, dispatch one verb, print one JSON object."""

from __future__ import annotations

import argparse
import json
import sys
from typing import NoReturn

from learning.cli import COMMANDS


class UsageError(ValueError):
    """The command line does not match any verb's arguments."""


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        raise UsageError(f"{self.prog}: {message}")


def _parser() -> argparse.ArgumentParser:
    parser = _Parser(prog="learning", description=__doc__)
    parser.add_argument("--workspace", help="Exact study workspace directory")
    commands = parser.add_subparsers(dest="command", required=True)
    for command in COMMANDS:
        command.build(commands.add_parser(command.name, help=command.help))
    return parser


def _error_kind(error: Exception) -> str:
    return "io" if isinstance(error, OSError) else "validation"


def main(argv: list[str] | None = None) -> int:
    try:
        args = _parser().parse_args(argv)
        command = next(item for item in COMMANDS if item.name == args.command)
        result = command.handler(args)
        print(
            json.dumps(
                result, ensure_ascii=False, separators=(",", ":"), allow_nan=False
            )
        )
    except (ValueError, OSError) as error:
        message = {"error": {"kind": _error_kind(error), "message": str(error)}}
        print(json.dumps(message, ensure_ascii=False), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
