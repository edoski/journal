#!/usr/bin/env python3
"""
Undo the most recent Flow session.

Deletes the most recent flow session and its associated break from the
Flow database. Useful for when you accidentally start a session.

IMPORTANT: Make sure Flow is NOT running when you execute this, or the
changes may not persist (Flow might have the DB locked or cached).

Usage:
    python undo_last_session.py          # Preview what will be deleted
    python undo_last_session.py --confirm  # Actually delete
"""

from __future__ import annotations

import argparse
import sys

from flow_db import (
    format_session,
    get_connection,
    get_recent_sessions,
)


def find_last_flow_and_break(sessions: list[dict]) -> tuple[dict | None, dict | None]:
    """
    Find the most recent flow session and its associated break.

    Returns (flow_session, break_session) where break_session may be None.
    """
    flow = None
    associated_break = None

    # Find the most recent flow
    for s in sessions:
        if s["phase"] == "flow":
            flow = s
            break

    if not flow:
        return None, None

    # Look for a break that started within 2 minutes after the flow
    for s in sessions:
        if s["phase"] in ("shortBreak", "longBreak") and s["start"]:
            if flow["start"] and s["start"] >= flow["start"]:
                gap = (s["start"] - flow["start"]).total_seconds()
                if gap <= 120:
                    associated_break = s
                    break

    return flow, associated_break


def delete_session(conn, pk: int) -> int:
    """Delete a session and its interruptions. Returns count of deleted interruptions."""
    cursor = conn.cursor()

    # First delete any interruptions linked to this session
    cursor.execute("DELETE FROM ZINTERRUPTION WHERE ZSESSION = ?", (pk,))
    interruptions_deleted = cursor.rowcount

    # Then delete the session itself
    cursor.execute("DELETE FROM ZSESSION WHERE Z_PK = ?", (pk,))

    return interruptions_deleted


def main():
    parser = argparse.ArgumentParser(
        description="Undo the most recent Flow session (and associated break)."
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually delete the sessions. Without this flag, only previews.",
    )
    args = parser.parse_args()

    try:
        conn = get_connection(readonly=not args.confirm)
    except Exception as e:
        print(f"Error: Could not open database: {e}")
        print("Make sure Flow is not running.")
        sys.exit(1)

    sessions = get_recent_sessions(conn, limit=10)
    flow, brk = find_last_flow_and_break(sessions)

    if not flow:
        print("No flow session found to delete.")
        conn.close()
        sys.exit(0)

    print("=" * 60)
    print("SESSIONS TO BE DELETED:")
    print("=" * 60)

    print("\nFLOW SESSION:")
    print(format_session(flow, include_pk=True))

    if brk:
        print("\nASSOCIATED BREAK:")
        print(format_session(brk, include_pk=True))
    else:
        print("\nNo associated break found.")

    print("\n" + "=" * 60)

    if not args.confirm:
        print("\nThis is a PREVIEW. To actually delete, run:")
        print("  python undo_last_session.py --confirm")
        print("\n⚠️  Make sure Flow is CLOSED before confirming!")
        conn.close()
        sys.exit(0)

    # Perform deletion
    print("\n⚠️  DELETING...")

    total_interruptions = 0

    if brk:
        int_count = delete_session(conn, brk["pk"])
        total_interruptions += int_count
        print(f"  Deleted break (PK={brk['pk']}) + {int_count} interruptions")

    int_count = delete_session(conn, flow["pk"])
    total_interruptions += int_count
    print(f"  Deleted flow (PK={flow['pk']}) + {int_count} interruptions")

    conn.commit()
    conn.close()

    print("\n✅ Done! The accidental session has been removed.")
    print("   You can now start a new session when you're ready.")


if __name__ == "__main__":
    main()
