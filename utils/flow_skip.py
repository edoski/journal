#!/usr/bin/env python3
"""
Flow Skip Automation.

Skips the current Flow session and starts the break.
Designed to be run by launchd at scheduled times.

Usage:
    python -m utils.flow_skip
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "skip_schedule.json"
LOG_PATH = Path("/tmp/flow-skip.log")


def log(message: str) -> None:
    """Append a timestamped message to the log file."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_PATH, "a") as f:
        f.write(f"[{timestamp}] {message}\n")
    print(f"[{timestamp}] {message}")


def run_applescript(script: str) -> str | None:
    """Execute an AppleScript and return the output."""
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        log(f"AppleScript error: {e.stderr.strip()}")
        return None


def get_phase() -> str | None:
    """Get the current Flow phase (Flow, Break, or None if idle/error)."""
    return run_applescript('tell application "Flow" to getPhase')


def skip_session() -> None:
    """Execute skip command."""
    run_applescript('tell application "Flow" to skip')


def start_session() -> None:
    """Execute start command (to begin the break after skipping)."""
    run_applescript('tell application "Flow" to start')


def show_app() -> None:
    """Show the Flow UI."""
    run_applescript('tell application "Flow" to show')


def load_config() -> dict:
    """Load the skip schedule configuration."""
    if not CONFIG_PATH.exists():
        return {"enabled": False, "skip_times": []}
    with open(CONFIG_PATH) as f:
        return json.load(f)


def main() -> int:
    """Main entry point for the skip automation."""
    log("Skip automation triggered")

    # Check if enabled
    config = load_config()
    if not config.get("enabled", False):
        log("Automation is disabled, exiting")
        return 0

    # Check current phase
    phase = get_phase()
    log(f"Current phase: {phase}")

    if phase != "Flow":
        log(f"Not in Flow phase (current: {phase}), skipping")
        return 0

    # Skip the session
    log("Skipping current session...")
    skip_session()

    # Start the break
    log("Starting break...")
    start_session()

    # Show the UI so user remembers to start next session
    log("Showing Flow UI...")
    show_app()

    log("Done!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
