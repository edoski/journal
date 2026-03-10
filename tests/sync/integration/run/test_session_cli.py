from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

import sync.run.commands.session as session_cmd
from sync.study.core_data_time import datetime_to_core_data


def _create_session_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE ZSESSION (
            Z_PK INTEGER PRIMARY KEY,
            ZPHASE TEXT,
            ZDURATION REAL,
            ZSTARTEDAT REAL,
            ZCOMPLETEDAT REAL,
            ZTITLE TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE ZINTERRUPTION (
            ZSESSION INTEGER
        )
        """
    )
    conn.commit()
    conn.close()


def _insert_break_row(
    path: Path,
    *,
    pk: int,
    started_at: float,
    duration: float = 30.0,
    phase: str = "shortBreak",
) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        """
        INSERT INTO ZSESSION (Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (pk, phase, duration, started_at, None, "Study"),
    )
    conn.commit()
    conn.close()


def test_cmd_session_undo_deletes_all_breaks_linked_from_focus_end(
    monkeypatch,
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "sessions.sqlite"
    _create_session_db(db_path)

    focus_start = session_cmd.datetime.datetime(2025, 12, 27, 13, 0)
    focus_end = session_cmd.datetime.datetime(2025, 12, 27, 14, 0)
    break_one = focus_end + session_cmd.datetime.timedelta(minutes=1)
    break_two = focus_end + session_cmd.datetime.timedelta(minutes=4)
    break_outside_window = focus_end + session_cmd.datetime.timedelta(minutes=6)

    _insert_break_row(path=db_path, pk=101, started_at=datetime_to_core_data(break_one))
    _insert_break_row(path=db_path, pk=102, started_at=datetime_to_core_data(break_two))
    _insert_break_row(
        path=db_path,
        pk=103,
        started_at=datetime_to_core_data(break_outside_window),
    )

    focus = {
        "pk": 100,
        "phase": "flow",
        "duration": 60.0,
        "start": focus_start,
        "completed": focus_end,
        "title": "Study",
        "interruptions_count": 0,
        "interruptions_duration": 0.0,
    }

    monkeypatch.setattr(
        session_cmd,
        "_load_recent_focus_sessions",
        lambda *_args, **_kwargs: [focus],
    )
    monkeypatch.setattr(
        session_cmd,
        "get_connection",
        lambda readonly=True: sqlite3.connect(db_path),
    )

    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        INSERT INTO ZSESSION (Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            focus["pk"],
            focus["phase"],
            focus["duration"],
            datetime_to_core_data(focus_start),
            datetime_to_core_data(focus_end),
            focus["title"],
        ),
    )
    conn.commit()
    conn.close()

    rc = session_cmd.cmd_session_undo(argparse.Namespace(confirm=True))

    assert rc == 0

    conn = sqlite3.connect(db_path)
    remaining = conn.execute("SELECT Z_PK FROM ZSESSION ORDER BY Z_PK").fetchall()
    conn.close()

    assert remaining == [(103,)]
