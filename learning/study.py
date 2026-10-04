"""The `study` command: initialize, link or unlink a study workspace."""

from __future__ import annotations

import sys

from learning.__main__ import main

LIFECYCLE = ("init", "link", "unlink")
USAGE = (
    "usage: study [--workspace DIR] init [--sources DIR] | link MATERIAL | unlink\n"
    "Study in Claude Desktop, Claude Code or Codex through the learning MCP server."
)


def _verb(args: list[str]) -> str | None:
    """The first positional argument, skipping ``--workspace DIR``."""
    for index, arg in enumerate(args):
        if not arg.startswith("-") and (index == 0 or args[index - 1] != "--workspace"):
            return arg
    return None


def study(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if _verb(args) not in LIFECYCLE:
        print(USAGE, file=sys.stderr)
        return 2
    return main(args)


if __name__ == "__main__":
    raise SystemExit(study())
