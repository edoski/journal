#!/usr/bin/env python3
"""
Entry point for running daily sync as a module.

Usage:
    python -m daily_sync
"""
from __future__ import annotations

from .flow_db import get_todays_sessions
from .orchestrator import update_markdown


def main() -> None:
    """Run the daily sync process."""
    sessions = get_todays_sessions()
    changed = update_markdown(sessions)
    if changed is False:
        # Suppress noisy success logs on no-op runs.
        pass


if __name__ == "__main__":
    main()
