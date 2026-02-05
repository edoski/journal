#!/usr/bin/env python3
"""
Preview the current/most recent Flow session with detailed stats.

Displays comprehensive information about the most recent flow session,
including timing, interruptions, and status. Useful for debugging and
for agents to inspect session state.

Usage:
    python session_preview.py          # Show most recent session
    python session_preview.py -n 5     # Show last 5 sessions
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

from flow_db import (
    get_connection,
    get_interruptions_for_session,
    get_recent_sessions,
)


def calculate_actual_duration(session: dict) -> float | None:
    """Calculate actual duration in minutes from start to completed."""
    if not session["start"]:
        return None

    end_time = session["completed"] or datetime.now()
    delta = end_time - session["start"]
    return delta.total_seconds() / 60


def format_session_detailed(session: dict, interruptions: list[dict]) -> str:
    """Format a session with full details including interruptions."""
    lines = []

    # Header
    phase_emoji = "🧘" if session["phase"] == "flow" else "☕"
    title = session["title"] or "(no title)"
    lines.append(f"{phase_emoji} {title}")
    lines.append("-" * 50)

    # Basic info
    lines.append(f"  PK:            {session['pk']}")
    lines.append(f"  Phase:         {session['phase']}")

    # Timing
    if session["start"]:
        lines.append(
            f"  Started:       {session['start'].strftime('%Y-%m-%d %H:%M:%S')}"
        )

    if session["completed"]:
        lines.append(
            f"  Completed:     {session['completed'].strftime('%Y-%m-%d %H:%M:%S')}"
        )
        status = "✓ completed"
    else:
        status = "⏳ in-progress"

    lines.append(f"  Status:        {status}")

    # Duration stats
    lines.append(f"  Planned:       {session['duration']} min")

    actual = calculate_actual_duration(session)
    if actual is not None:
        lines.append(f"  Actual:        {actual:.1f} min")

        if session["duration"]:
            diff = actual - session["duration"]
            if diff > 0:
                lines.append(f"  Over/Under:    +{diff:.1f} min (over)")
            elif diff < 0:
                lines.append(f"  Over/Under:    {diff:.1f} min (under)")

    # Interruptions
    if interruptions:
        total_int_duration = sum(i["duration"] or 0 for i in interruptions)
        lines.append(f"\n  Interruptions: {len(interruptions)}")
        lines.append(f"  Int. Duration: {total_int_duration:.1f} min total")

        for i, intr in enumerate(interruptions, 1):
            dur = intr["duration"] or 0
            start_str = intr["start"].strftime("%H:%M") if intr["start"] else "?"
            lines.append(f"    {i}. at {start_str} ({dur:.1f} min)")
    else:
        lines.append("\n  Interruptions: 0")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Preview Flow session details and stats."
    )
    parser.add_argument(
        "-n",
        "--count",
        type=int,
        default=1,
        help="Number of sessions to show (default: 1)",
    )
    parser.add_argument(
        "--all-phases",
        action="store_true",
        help="Include breaks, not just flow sessions.",
    )
    args = parser.parse_args()

    try:
        conn = get_connection(readonly=True)
    except Exception as e:
        print(f"Error: Could not open database: {e}")
        sys.exit(1)

    sessions = get_recent_sessions(conn, limit=50)

    # Filter to flow sessions only unless --all-phases
    if not args.all_phases:
        sessions = [s for s in sessions if s["phase"] == "flow"]

    if not sessions:
        print("No sessions found.")
        conn.close()
        sys.exit(0)

    # Limit to requested count
    sessions = sessions[: args.count]

    print("=" * 60)
    print(f"FLOW SESSION{'S' if len(sessions) > 1 else ''} PREVIEW")
    print("=" * 60)

    for i, session in enumerate(sessions):
        if i > 0:
            print("\n" + "=" * 60 + "\n")

        interruptions = get_interruptions_for_session(conn, session["pk"])
        print(format_session_detailed(session, interruptions))

    conn.close()

    # Summary stats if showing multiple
    if len(sessions) > 1:
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("-" * 60)

        total_planned = sum(s["duration"] or 0 for s in sessions)
        total_actual = sum(calculate_actual_duration(s) or 0 for s in sessions)
        completed_count = sum(1 for s in sessions if s["completed"])

        print(f"  Sessions shown:    {len(sessions)}")
        print(f"  Completed:         {completed_count}/{len(sessions)}")
        print(f"  Total planned:     {total_planned} min")
        print(f"  Total actual:      {total_actual:.1f} min")


if __name__ == "__main__":
    main()
