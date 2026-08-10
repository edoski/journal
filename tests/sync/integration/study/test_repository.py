from __future__ import annotations

import datetime
import sqlite3
from pathlib import Path

import pytest

from sync.study.core_data_time import datetime_to_core_data
from sync.study.repository import FlowSessionRepository


def _create_flow_db(path: Path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE ZSESSION (
            Z_PK INTEGER PRIMARY KEY,
            ZPHASE TEXT,
            ZDURATION REAL,
            ZSTARTEDAT REAL,
            ZCOMPLETEDAT REAL,
            ZTITLE TEXT
        );
        CREATE TABLE ZINTERRUPTION (ZSESSION INTEGER);
        """
    )
    connection.commit()
    connection.close()


def _repository(path: Path) -> FlowSessionRepository:
    def connect(readonly: bool) -> sqlite3.Connection:
        if readonly:
            return sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        return sqlite3.connect(path)

    return FlowSessionRepository(connection_factory=connect)


def _insert_session(
    path: Path,
    *,
    pk: int,
    phase: str,
    start: datetime.datetime,
    completed: datetime.datetime | None,
    title: str = "Study",
) -> None:
    connection = sqlite3.connect(path)
    connection.execute(
        """
        INSERT INTO ZSESSION
            (Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            pk,
            phase,
            60.0,
            datetime_to_core_data(start),
            datetime_to_core_data(completed),
            title,
        ),
    )
    connection.commit()
    connection.close()


def test_rename_sessions_updates_every_source_row(tmp_path: Path) -> None:
    db_path = tmp_path / "flow.sqlite"
    _create_flow_db(db_path)
    start = datetime.datetime(2026, 8, 10, 9, 0)
    end = start + datetime.timedelta(hours=1)
    _insert_session(db_path, pk=10, phase="flow", start=start, completed=end)
    _insert_session(db_path, pk=11, phase="flow", start=start, completed=end)

    _repository(db_path).rename_sessions([10, 11], "Architecture")

    connection = sqlite3.connect(db_path)
    titles = connection.execute(
        "SELECT Z_PK, ZTITLE FROM ZSESSION ORDER BY Z_PK"
    ).fetchall()
    connection.close()
    assert titles == [(10, "Architecture"), (11, "Architecture")]


def test_undo_session_deletes_all_source_rows_and_linked_breaks(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "flow.sqlite"
    _create_flow_db(db_path)
    start = datetime.datetime(2026, 8, 10, 13, 0)
    end = start + datetime.timedelta(hours=1)
    _insert_session(db_path, pk=10, phase="flow", start=start, completed=end)
    _insert_session(db_path, pk=11, phase="flow", start=start, completed=end)
    _insert_session(
        db_path,
        pk=20,
        phase="shortBreak",
        start=end + datetime.timedelta(minutes=1),
        completed=end + datetime.timedelta(minutes=16),
    )
    _insert_session(
        db_path,
        pk=21,
        phase="longBreak",
        start=end + datetime.timedelta(minutes=4),
        completed=end + datetime.timedelta(minutes=34),
    )
    _insert_session(
        db_path,
        pk=22,
        phase="shortBreak",
        start=end + datetime.timedelta(minutes=6),
        completed=end + datetime.timedelta(minutes=21),
    )
    connection = sqlite3.connect(db_path)
    connection.executemany(
        "INSERT INTO ZINTERRUPTION (ZSESSION) VALUES (?)",
        [(10,), (11,), (20,), (22,)],
    )
    connection.commit()
    connection.close()

    result = _repository(db_path).undo_session([10, 11], end)

    assert [item["pk"] for item in result.breaks] == [20, 21]
    assert result.deleted_interruptions == 3
    connection = sqlite3.connect(db_path)
    remaining_sessions = connection.execute(
        "SELECT Z_PK FROM ZSESSION ORDER BY Z_PK"
    ).fetchall()
    remaining_interruptions = connection.execute(
        "SELECT ZSESSION FROM ZINTERRUPTION ORDER BY ZSESSION"
    ).fetchall()
    connection.close()
    assert remaining_sessions == [(22,)]
    assert remaining_interruptions == [(22,)]


def test_undo_session_rolls_back_every_delete_on_failure(tmp_path: Path) -> None:
    db_path = tmp_path / "flow.sqlite"
    _create_flow_db(db_path)
    start = datetime.datetime(2026, 8, 10, 9, 0)
    end = start + datetime.timedelta(hours=1)
    _insert_session(db_path, pk=10, phase="flow", start=start, completed=end)
    _insert_session(db_path, pk=11, phase="flow", start=start, completed=end)
    connection = sqlite3.connect(db_path)
    connection.execute("INSERT INTO ZINTERRUPTION (ZSESSION) VALUES (10)")
    connection.execute(
        """
        CREATE TRIGGER reject_second_focus_delete
        BEFORE DELETE ON ZSESSION
        WHEN OLD.Z_PK = 11
        BEGIN
            SELECT RAISE(ABORT, 'blocked');
        END
        """
    )
    connection.commit()
    connection.close()

    with pytest.raises(sqlite3.IntegrityError, match="blocked"):
        _repository(db_path).undo_session([10, 11], end)

    connection = sqlite3.connect(db_path)
    session_pks = connection.execute(
        "SELECT Z_PK FROM ZSESSION ORDER BY Z_PK"
    ).fetchall()
    interruption_pks = connection.execute(
        "SELECT ZSESSION FROM ZINTERRUPTION"
    ).fetchall()
    connection.close()
    assert session_pks == [(10,), (11,)]
    assert interruption_pks == [(10,)]
