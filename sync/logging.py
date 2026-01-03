"""
Logging configuration for journal sync.

Provides a simple, human-readable logger for sync operations.
"""

from __future__ import annotations

import logging
import sys

# Configure the journal sync logger
_logger = logging.getLogger("journal.sync")
_logger.setLevel(logging.INFO)

# Only add handler if not already configured (avoid duplicates on re-import)
if not _logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(message)s",
            datefmt="%H:%M:%S",
        )
    )
    _logger.addHandler(_handler)
    _logger.propagate = False


def get_logger() -> logging.Logger:
    """Get the journal sync logger."""
    return _logger
