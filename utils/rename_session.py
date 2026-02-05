#!/usr/bin/env python3
"""
Rename the most recent Flow session.

Sets or updates the title of the most recent flow session (ignores breaks).

IMPORTANT: Make sure Flow is NOT running when you execute this, or the
changes may not persist (Flow might have the DB locked or cached).

Usage:
    python rename_session.py "My new title"           # Preview the rename
    python rename_session.py "My new title" --confirm # Actually rename
"""

from __future__ import annotations

import argparse
import sys

from flow_db import (
    format_session,
    get_connection,
    get_recent_sessions,
)


def find_most_recent_flow(sessions: list[dict]) -> dict | None:
    """Find the most recent flow session (ignores breaks)."""
    for s in sessions:
        if s["phase"] == "flow":
            return s
    return None


def rename_session(conn, pk: int, new_title: str) -> None:
    """Update the title of a session."""
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE ZSESSION SET ZTITLE = ? WHERE Z_PK = ?",
        (new_title, pk),
    )


def main():
    parser = argparse.ArgumentParser(description="Rename the most recent Flow session.")
    parser.add_argument(
        "title",
        help="The new title for the session.",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually rename the session. Without this flag, only previews.",
    )
    args = parser.parse_args()

    try:
        conn = get_connection(readonly=not args.confirm)
    except Exception as e:
        print(f"Error: Could not open database: {e}")
        print("Make sure Flow is not running.")
        sys.exit(1)

    sessions = get_recent_sessions(conn, limit=10)
    flow = find_most_recent_flow(sessions)

    if not flow:
        print("No flow session found to rename.")
        conn.close()
        sys.exit(0)

    print("=" * 60)
    print("SESSION TO BE RENAMED:")
    print("=" * 60)

    print("\nCURRENT:")
    print(format_session(flow, include_pk=True))

    print(f'\nNEW TITLE: "{args.title}"')

    print("\n" + "=" * 60)

    if not args.confirm:
        print("\nThis is a PREVIEW. To actually rename, run:")
        print(f'  python rename_session.py "{args.title}" --confirm')
        print("\n⚠️  Make sure Flow is CLOSED before confirming!")
        conn.close()
        sys.exit(0)

    # Perform rename
    rename_session(conn, flow["pk"], args.title)
    conn.commit()
    conn.close()

    print(f'\n✅ Done! Session renamed to "{args.title}"')


if __name__ == "__main__":
    main()
