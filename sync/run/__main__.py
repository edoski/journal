"""Unified runtime CLI for journal sync and session/media utilities."""

from __future__ import annotations

import argparse
import sys

from sync.log import configure_logging, get_logger, resolve_logging_settings
from sync.run import parser as parser_mod
from sync.run.registry import build_command_handlers
from sync.run.runtime_deps import RuntimeDeps, build_runtime_deps

logger = get_logger(__name__)


def build_parser(*, deps: RuntimeDeps | None = None) -> argparse.ArgumentParser:
    """Build the CLI parser bound to a dependency set."""
    runtime = deps or build_runtime_deps()
    return parser_mod.build_parser(handlers=build_command_handlers(runtime))


def main(
    argv: list[str] | None = None,
    *,
    deps: RuntimeDeps | None = None,
) -> int:
    parser = build_parser(deps=deps)
    args = parser.parse_args(argv)

    level, log_format = resolve_logging_settings(args)
    configure_logging(level=level, log_format=log_format)

    try:
        return int(args.func(args))
    except Exception:
        logger.exception("sync.run command failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
