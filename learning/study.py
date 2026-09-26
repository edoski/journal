"""User entrypoint: initialize a directory or start studying there."""

from __future__ import annotations

import sys

from learning.__main__ import main


def study() -> int:
    args = sys.argv[1:]
    selection: list[str] = []
    if "--workspace" in args:
        index = args.index("--workspace")
        if index + 1 < len(args):
            selection = args[index : index + 2]
            del args[index : index + 2]
    for arg in list(args):
        if arg.startswith("--workspace="):
            selection.append(arg)
            args.remove(arg)
    if not args or args[0] not in {"init", "import", "link", "unlink"}:
        args.insert(0, "start")
    return main([*selection, *args])


if __name__ == "__main__":
    raise SystemExit(study())
