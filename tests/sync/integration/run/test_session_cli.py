from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from unittest.mock import Mock

import sync.run.commands.session as session_cmd
from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.markdown_schedule import MarkdownScheduleSource
from sync.study.core_data_time import datetime_to_core_data
from sync.study.repository import FlowSessionRepository


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


def test_record_to_cli_session_preserves_all_source_primary_keys() -> None:
    session = session_cmd._record_to_cli_session(
        {
            "pk": 10,
            "pks": [10, 11],
            "phase": "flow",
            "planned_duration": 60,
            "title": "Study",
        }
    )

    assert session["pk"] == 10
    assert session["pks"] == [10, 11]


def test_cmd_session_undo_json_preview_contains_only_hud_fields(
    monkeypatch,
    capsys,
) -> None:
    focus = {
        "pk": 10,
        "pks": [10],
        "phase": "flow",
        "duration": 90.0,
        "start": session_cmd.datetime.datetime(2026, 8, 13, 16, 54, 43),
        "completed": None,
        "title": "Metodi Numerici",
        "interruptions_count": 0,
        "interruptions_duration": 0.0,
    }
    monkeypatch.setattr(
        session_cmd,
        "_load_recent_focus_sessions",
        lambda *_args, **_kwargs: [focus],
    )
    repository = Mock(spec=FlowSessionRepository)
    repository.find_associated_break_sessions.return_value = ()
    deps = session_cmd.SessionCommandDeps(
        session_source_factory=lambda: FlowStudySessionSource(repository=repository),
        schedule_source_factory=MarkdownScheduleSource,
        repository=repository,
    )

    result = session_cmd.cmd_session_undo(
        argparse.Namespace(confirm=False, json=True),
        deps=deps,
    )

    assert result == 0
    assert json.loads(capsys.readouterr().out) == {
        "session": {
            "title": "Metodi Numerici",
            "started_at": "2026-08-13 16:54:43",
            "duration_minutes": 90.0,
            "status": "in-progress",
        },
        "associated_break_count": 0,
    }


def test_cmd_session_rename_updates_all_source_primary_keys(
    monkeypatch,
    tmp_path: Path,
    capsys,
) -> None:
    db_path = tmp_path / "sessions.sqlite"
    _create_session_db(db_path)
    start = session_cmd.datetime.datetime(2026, 8, 10, 9, 0)
    end = start + session_cmd.datetime.timedelta(hours=1)
    focus = {
        "pk": 10,
        "pks": [10, 11],
        "phase": "flow",
        "duration": 60.0,
        "start": start,
        "completed": end,
        "title": "Study",
        "interruptions_count": 0,
        "interruptions_duration": 0.0,
    }
    connection = sqlite3.connect(db_path)
    connection.executemany(
        """
        INSERT INTO ZSESSION (Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                pk,
                focus["phase"],
                focus["duration"],
                datetime_to_core_data(start),
                datetime_to_core_data(end),
                focus["title"],
            )
            for pk in focus["pks"]
        ],
    )
    connection.commit()
    connection.close()
    monkeypatch.setattr(
        session_cmd,
        "_load_recent_focus_sessions",
        lambda *_args, **_kwargs: [focus],
    )
    repository = FlowSessionRepository(
        connection_factory=lambda _readonly: sqlite3.connect(db_path)
    )
    deps = session_cmd.SessionCommandDeps(
        session_source_factory=lambda: FlowStudySessionSource(
            repository=repository,
            break_defaults={"shortBreak": 30, "longBreak": 60},
        ),
        schedule_source_factory=MarkdownScheduleSource,
        repository=repository,
    )
    rename_sessions = repository.rename_sessions

    def rename_after_target_is_printed(pks: list[int], title: str) -> None:
        assert "SESSION TO BE RENAMED" in capsys.readouterr().out
        rename_sessions(pks, title)

    monkeypatch.setattr(repository, "rename_sessions", rename_after_target_is_printed)

    result = session_cmd.cmd_session_rename(
        argparse.Namespace(confirm=True, title="Architecture"),
        deps=deps,
    )

    assert result == 0
    connection = sqlite3.connect(db_path)
    titles = connection.execute("SELECT ZTITLE FROM ZSESSION ORDER BY Z_PK").fetchall()
    connection.close()
    assert titles == [("Architecture",), ("Architecture",)]


def test_cmd_session_undo_deletes_all_breaks_linked_from_focus_end(
    monkeypatch,
    tmp_path: Path,
    capsys,
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
        "pks": [100, 104],
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
    conn = sqlite3.connect(db_path)
    conn.executemany(
        """
        INSERT INTO ZSESSION (Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                pk,
                focus["phase"],
                focus["duration"],
                datetime_to_core_data(focus_start),
                datetime_to_core_data(focus_end),
                focus["title"],
            )
            for pk in focus["pks"]
        ],
    )
    conn.executemany(
        "INSERT INTO ZINTERRUPTION (ZSESSION) VALUES (?)",
        [(100,), (104,), (101,)],
    )
    conn.commit()
    conn.close()

    repository = FlowSessionRepository(
        connection_factory=lambda _readonly: sqlite3.connect(db_path)
    )
    deps = session_cmd.SessionCommandDeps(
        session_source_factory=lambda: FlowStudySessionSource(
            repository=repository,
            break_defaults={"shortBreak": 30, "longBreak": 60},
        ),
        schedule_source_factory=MarkdownScheduleSource,
        repository=repository,
    )
    undo_session = repository.undo_session

    def undo_after_target_is_printed(pks, end, break_pks):
        assert "SESSIONS TO DELETE" in capsys.readouterr().out
        return undo_session(pks, end, break_pks)

    monkeypatch.setattr(repository, "undo_session", undo_after_target_is_printed)
    rc = session_cmd.cmd_session_undo(
        argparse.Namespace(confirm=True),
        deps=deps,
    )

    assert rc == 0

    conn = sqlite3.connect(db_path)
    remaining = conn.execute("SELECT Z_PK FROM ZSESSION ORDER BY Z_PK").fetchall()
    remaining_interruptions = conn.execute(
        "SELECT ZSESSION FROM ZINTERRUPTION ORDER BY ZSESSION"
    ).fetchall()
    conn.close()

    assert remaining == [(103,)]
    assert remaining_interruptions == []


def test_cmd_session_undo_aborts_when_a_break_appears_after_display(
    monkeypatch,
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "sessions.sqlite"
    _create_session_db(db_path)
    focus_start = session_cmd.datetime.datetime(2026, 8, 10, 13, 0)
    focus_end = focus_start + session_cmd.datetime.timedelta(hours=1)
    _insert_break_row(
        path=db_path,
        pk=101,
        started_at=datetime_to_core_data(
            focus_end + session_cmd.datetime.timedelta(minutes=1)
        ),
    )
    focus = {
        "pk": 100,
        "pks": [100],
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
    connection = sqlite3.connect(db_path)
    connection.execute(
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
    connection.execute("INSERT INTO ZINTERRUPTION (ZSESSION) VALUES (100)")
    connection.commit()
    connection.close()
    repository = FlowSessionRepository(
        connection_factory=lambda _readonly: sqlite3.connect(db_path)
    )
    deps = session_cmd.SessionCommandDeps(
        session_source_factory=lambda: FlowStudySessionSource(
            repository=repository,
            break_defaults={"shortBreak": 30, "longBreak": 60},
        ),
        schedule_source_factory=MarkdownScheduleSource,
        repository=repository,
    )
    find_breaks = repository.find_associated_break_sessions

    def find_breaks_then_add_one(end):
        displayed = find_breaks(end)
        _insert_break_row(
            path=db_path,
            pk=102,
            started_at=datetime_to_core_data(
                focus_end + session_cmd.datetime.timedelta(minutes=2)
            ),
        )
        return displayed

    monkeypatch.setattr(
        repository,
        "find_associated_break_sessions",
        find_breaks_then_add_one,
    )

    result = session_cmd.cmd_session_undo(
        argparse.Namespace(confirm=True),
        deps=deps,
    )

    assert result == 1
    connection = sqlite3.connect(db_path)
    remaining_sessions = connection.execute(
        "SELECT Z_PK FROM ZSESSION ORDER BY Z_PK"
    ).fetchall()
    remaining_interruptions = connection.execute(
        "SELECT ZSESSION FROM ZINTERRUPTION"
    ).fetchall()
    connection.close()
    assert remaining_sessions == [(100,), (101,), (102,)]
    assert remaining_interruptions == [(100,)]
