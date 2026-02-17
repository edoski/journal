"""Centralized logging helpers for sync and CLI entrypoints."""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
import sys
from typing import Final

from sync.config import LOGGING

_LEVELS: Final[set[str]] = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
_FORMATS: Final[set[str]] = {"text", "json"}

_ACTIVE_CONFIG: tuple[str, str] | None = None


class _JsonFormatter(logging.Formatter):
    """Render log records as single-line JSON payloads."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.datetime.fromtimestamp(
                record.created, tz=datetime.timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


def _normalize_level(value: str) -> str:
    level = value.strip().upper()
    if level not in _LEVELS:
        raise ValueError(
            f"Invalid JOURNAL_LOG_LEVEL '{value}'. Expected one of: "
            + ", ".join(sorted(_LEVELS))
        )
    return level


def _normalize_format(value: str) -> str:
    fmt = value.strip().lower()
    if fmt not in _FORMATS:
        raise ValueError(
            f"Invalid JOURNAL_LOG_FORMAT '{value}'. Expected one of: "
            + ", ".join(sorted(_FORMATS))
        )
    return fmt


def _resolve_level(level: str | None) -> str:
    override = level if level is not None else os.environ.get("JOURNAL_LOG_LEVEL")
    return _normalize_level(override or LOGGING.level)


def _resolve_format(log_format: str | None) -> str:
    override = (
        log_format if log_format is not None else os.environ.get("JOURNAL_LOG_FORMAT")
    )
    return _normalize_format(override or LOGGING.format)


def _map_logger_name(name: str) -> str:
    if not name or not isinstance(name, str):
        raise ValueError("Logger name must be a non-empty string")
    if name.startswith("journal."):
        return name
    return f"journal.{name}"


def configure_logging(
    *, level: str | None = None, log_format: str | None = None
) -> None:
    """Configure the journal logger hierarchy for entrypoint use."""
    global _ACTIVE_CONFIG

    resolved_level = _resolve_level(level)
    resolved_format = _resolve_format(log_format)
    config_key = (resolved_level, resolved_format)

    journal_logger = logging.getLogger("journal")

    if _ACTIVE_CONFIG == config_key and journal_logger.handlers:
        return

    handler = logging.StreamHandler(sys.stderr)
    if resolved_format == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                datefmt="%H:%M:%S",
            )
        )

    for existing in list(journal_logger.handlers):
        journal_logger.removeHandler(existing)

    journal_logger.setLevel(getattr(logging, resolved_level))
    journal_logger.addHandler(handler)
    journal_logger.propagate = False

    _ACTIVE_CONFIG = config_key


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger under the ``journal`` hierarchy."""
    return logging.getLogger(_map_logger_name(name))


def add_logging_cli_args(parser: argparse.ArgumentParser) -> None:
    """Attach shared logging flags to an argparse parser."""
    parser.add_argument(
        "--log-level",
        choices=sorted(_LEVELS),
        help="Override log level (default from JOURNAL_LOG_LEVEL or INFO)",
    )
    parser.add_argument(
        "--log-format",
        choices=sorted(_FORMATS),
        help="Override log format (default from JOURNAL_LOG_FORMAT or text)",
    )


def resolve_logging_settings(args: argparse.Namespace) -> tuple[str | None, str | None]:
    """Extract logging overrides from parsed CLI args."""
    return getattr(args, "log_level", None), getattr(args, "log_format", None)
