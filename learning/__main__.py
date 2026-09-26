"""Agent CLI: parse, select the workspace, apply the no-save policy, dispatch."""

from __future__ import annotations

import argparse
import json
import os
import sys

from learning import storage
from learning.cli import COMMANDS


class NoSaveError(ValueError):
    """The current study session does not permit durable publication."""


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="learning", description=__doc__)
    parser.add_argument("--workspace", help="Exact initialized study directory")
    commands = parser.add_subparsers(dest="command")
    init = commands.add_parser("init", help="Initialize .study in this directory")
    init.add_argument(
        "--sources",
        help="Material directory elsewhere that this workspace studies and is found from",
    )
    start = commands.add_parser("start", help="Launch Pi in the selected workspace")
    start.add_argument("prompt", nargs="?")
    start.add_argument("--continue", dest="resume", action="store_true")
    start.add_argument("--print", dest="headless", action="store_true")
    start.add_argument("--json", action="store_true")
    start.add_argument("--no-open", action="store_true")
    start.add_argument(
        "--private",
        action="store_true",
        help="Study in disposable local state without a saved Pi session",
    )
    for command in COMMANDS:
        command.build(commands.add_parser(command.name, help=command.help))
    return parser


def _no_save() -> bool:
    return os.environ.get("LEARNING_NO_SAVE") == "1"


def _error_kind(error: Exception) -> str:
    if isinstance(error, NoSaveError):
        return "no_save"
    if isinstance(error, storage.RevisionConflict):
        return "conflict"
    if isinstance(error, OSError):
        return "io"
    return "validation"


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        from learning.workspace import initialize, resolve

        if args.command == "init":
            if _no_save():
                raise NoSaveError(
                    "This session cannot initialize persistent study state"
                )
            workspace = initialize(args.workspace, args.sources)
            result = {
                "workspace": str(workspace.directory),
                "learning": str(workspace.root),
                "sources_directory": str(workspace.sources),
            }
        else:
            workspace = resolve(args.workspace)
            if args.command in (None, "start"):
                from learning.runtime import start_pi

                start_pi(
                    workspace,
                    args
                    if args.command
                    else argparse.Namespace(
                        prompt=None,
                        resume=False,
                        headless=False,
                        json=False,
                        no_open=False,
                        private=False,
                    ),
                )
                return 0
            command = next(item for item in COMMANDS if item.name == args.command)
            if command.mutating(args) and _no_save():
                raise NoSaveError(
                    "This session is not saving study memory or artifacts. Continue teaching without a write."
                )
            result = command.handler(workspace, args)
        print(
            json.dumps(
                result, ensure_ascii=False, separators=(",", ":"), allow_nan=False
            )
        )
    except (ValueError, OSError) as error:
        print(
            json.dumps(
                {"error": {"kind": _error_kind(error), "message": str(error)}},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
