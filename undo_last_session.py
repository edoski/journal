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
import datetime
import sqlite3
import sys

# Flow database path
DB_PATH = "/Users/edo/Library/Containers/design.yugen.Flow/Data/Library/Application Support/Flow/CoreData.sqlite"

# CoreData uses an epoch starting at 2001-01-01 instead of 1970-01-01
CORE_DATA_EPOCH_OFFSET = 978307200


def core_data_to_datetime(timestamp: float | None) -> datetime.datetime | None:
    """Convert a CoreData timestamp to a Python datetime."""
    if timestamp is None:
        return None
    return datetime.datetime.fromtimestamp(timestamp + CORE_DATA_EPOCH_OFFSET)


def get_recent_sessions(conn: sqlite3.Connection, limit: int = 5) -> list[dict]:
    """Get the N most recent sessions."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE
        FROM ZSESSION
        ORDER BY ZSTARTEDAT DESC
        LIMIT ?
    """, (limit,))
    
    sessions = []
    for row in cursor.fetchall():
        pk, phase, duration, started_at, completed_at, title = row
        sessions.append({
            "pk": pk,
            "phase": phase,
            "duration": duration,
            "start": core_data_to_datetime(started_at),
            "completed": core_data_to_datetime(completed_at),
            "title": title or "(no title)",
        })
    return sessions


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
    
    # Look for a break that started within 60 seconds after the flow
    for s in sessions:
        if s["phase"] in ("shortBreak", "longBreak") and s["start"]:
            if flow["start"] and s["start"] >= flow["start"]:
                gap = (s["start"] - flow["start"]).total_seconds()
                # Break should start very shortly after or during the flow
                if gap <= 120:  # Within 2 minutes
                    associated_break = s
                    break
    
    return flow, associated_break


def delete_session(conn: sqlite3.Connection, pk: int) -> int:
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
    
    # Open database (read-write mode for deletion)
    try:
        conn = sqlite3.connect(DB_PATH)
    except sqlite3.Error as e:
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
    
    def fmt_session(s: dict, label: str) -> None:
        completed = "✓ completed" if s["completed"] else "⏳ in-progress"
        start_str = s["start"].strftime("%Y-%m-%d %H:%M:%S") if s["start"] else "?"
        print(f"\n{label}:")
        print(f"  PK:       {s['pk']}")
        print(f"  Phase:    {s['phase']}")
        print(f"  Title:    {s['title']}")
        print(f"  Started:  {start_str}")
        print(f"  Duration: {s['duration']} min (planned)")
        print(f"  Status:   {completed}")
    
    fmt_session(flow, "FLOW SESSION")
    if brk:
        fmt_session(brk, "ASSOCIATED BREAK")
    else:
        print("\nNo associated break found.")
    
    print("\n" + "=" * 60)
    
    if not args.confirm:
        print("\nThis is a PREVIEW. To actually delete, run:")
        print("  python undo_last_session.py --confirm")
        print("\n⚠️  Make sure Flow is CLOSED before confirming!")
        conn.close()
        sys.exit(0)
    
    # Confirm deletion
    print("\n⚠️  DELETING...")
    
    total_interruptions = 0
    
    # Delete the break first (if exists)
    if brk:
        int_count = delete_session(conn, brk["pk"])
        total_interruptions += int_count
        print(f"  Deleted break (PK={brk['pk']}) + {int_count} interruptions")
    
    # Delete the flow session
    int_count = delete_session(conn, flow["pk"])
    total_interruptions += int_count
    print(f"  Deleted flow (PK={flow['pk']}) + {int_count} interruptions")
    
    conn.commit()
    conn.close()
    
    print("\n✅ Done! The accidental session has been removed.")
    print("   You can now start a new session when you're ready.")


if __name__ == "__main__":
    main()
