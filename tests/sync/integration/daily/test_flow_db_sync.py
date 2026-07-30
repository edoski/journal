"""Flow session ingestion and enrichment tests."""

from __future__ import annotations

import datetime
import sqlite3
import uuid

import pytest

from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.contracts.schedule import DayScheduleProfile
from sync.study.constants import CORE_DATA_EPOCH_OFFSET
from sync.study.core_data_time import core_data_to_datetime, datetime_to_core_data
from sync.study.enrichment import dedupe_sessions


class TestCoreDataToDatetime:
    """Tests for core_data_to_datetime function."""

    def test_converts_timestamp(self):
        """Converts CoreData timestamp to Python datetime."""
        # CoreData timestamp for 2025-01-01 00:00:00 UTC
        # Python timestamp = 1735689600
        # CoreData timestamp = Python_ts - offset
        python_ts = 1735689600  # 2025-01-01 00:00:00 UTC
        core_data_ts = python_ts - CORE_DATA_EPOCH_OFFSET
        result = core_data_to_datetime(core_data_ts)
        assert result is not None
        # Note: Exact datetime depends on local timezone
        assert result.year == 2025

    def test_none_returns_none(self):
        """None input returns None."""
        result = core_data_to_datetime(None)
        assert result is None


class TestDedupeSessions:
    """Tests for dedupe_sessions function."""

    def test_no_duplicates_unchanged(self):
        """Sessions with no duplicates are unchanged."""
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": datetime.datetime(2025, 12, 27, 9, 0),
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": datetime.datetime(2025, 12, 27, 11, 0),
                "end": datetime.datetime(2025, 12, 27, 12, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 12, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 2
        assert result[0]["pk"] == 1
        assert result[1]["pk"] == 2

    def test_merges_duplicates_within_tolerance(self):
        """Sessions within tolerance (60s default) are merged."""
        base_start = datetime.datetime(2025, 12, 27, 9, 0)
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": base_start
                + datetime.timedelta(seconds=30),  # 30s later, within tolerance
                "end": datetime.datetime(2025, 12, 27, 10, 5),
                "phase": "flow",
                "title": "Work",
                "completed_at": None,  # Open session
                "actual_elapsed": 65,
                "planned_duration": 60,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 1
        # Should have merged PKs
        assert set(result[0]["pks"]) == {1, 2}
        # When there's a completed session in the group, end comes from completed entries only
        # The completed session ended at 10:00
        assert result[0]["end"] == datetime.datetime(2025, 12, 27, 10, 0)

    def test_different_phases_not_merged(self):
        """Sessions with different phases are not merged."""
        base_start = datetime.datetime(2025, 12, 27, 9, 0)
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 9, 15),
                "phase": "shortBreak",  # Different phase
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 9, 15),
                "actual_elapsed": 15,
                "planned_duration": 15,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 2

    def test_different_titles_not_merged(self):
        """Sessions with different titles are not merged."""
        base_start = datetime.datetime(2025, 12, 27, 9, 0)
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Reading",  # Different title
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 2

    def test_empty_sessions_returns_empty(self):
        """Empty input returns empty list."""
        result = dedupe_sessions([])
        assert result == []

    def test_completed_session_anchors_times(self):
        """Completed session's times are preferred over open twins when within tolerance."""
        base_start = datetime.datetime(2025, 12, 27, 9, 0)
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": base_start,  # Same start (within tolerance)
                "end": datetime.datetime(2025, 12, 27, 11, 0),  # Ends later (open)
                "phase": "flow",
                "title": "Work",
                "completed_at": None,  # Open session
                "actual_elapsed": 120,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": base_start
                + datetime.timedelta(seconds=10),  # Within tolerance
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),  # Completed
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 1
        # Start should be from completed session (anchored)
        assert result[0]["start"] == base_start + datetime.timedelta(seconds=10)
        # End should be from completed session (completed ends only)
        assert result[0]["end"] == datetime.datetime(2025, 12, 27, 10, 0)


class TestRetroactiveLunchDetection:
    """Tests for retroactive lunch detection logic.

    Note: These tests verify the logic conceptually since get_todays_sessions
    requires a real database connection. The actual integration is tested
    via the overlap_minutes_with_window function from breaks module.
    """

    def test_gap_overlap_detection(self):
        """Gap between sessions correctly detects lunch overlap."""
        from sync.study.breaks import overlap_minutes_with_window

        # Session ends at 13:10, next starts at 14:35
        # Lunch window is 13:30-14:30
        prev_end = datetime.datetime(2025, 12, 27, 13, 10)
        current_start = datetime.datetime(2025, 12, 27, 14, 35)
        lunch_window = (datetime.time(13, 30), datetime.time(14, 30))

        overlap = overlap_minutes_with_window(prev_end, current_start, lunch_window)
        # Gap 13:10-14:35 overlaps lunch 13:30-14:30 for 60 minutes
        assert overlap == 60

    def test_gap_overlap_partial(self):
        """Partial overlap with lunch window is detected."""
        from sync.study.breaks import overlap_minutes_with_window

        # Session ends at 14:00, next starts at 14:45
        # Lunch window is 13:30-14:30
        prev_end = datetime.datetime(2025, 12, 27, 14, 0)
        current_start = datetime.datetime(2025, 12, 27, 14, 45)
        lunch_window = (datetime.time(13, 30), datetime.time(14, 30))

        overlap = overlap_minutes_with_window(prev_end, current_start, lunch_window)
        # Gap 14:00-14:45 overlaps lunch 13:30-14:30 for 30 minutes (14:00-14:30)
        assert overlap == 30

    def test_no_overlap_before_lunch(self):
        """Gap entirely before lunch window has no overlap."""
        from sync.study.breaks import overlap_minutes_with_window

        # Session ends at 12:00, next starts at 13:00
        # Lunch window is 13:30-14:30
        prev_end = datetime.datetime(2025, 12, 27, 12, 0)
        current_start = datetime.datetime(2025, 12, 27, 13, 0)
        lunch_window = (datetime.time(13, 30), datetime.time(14, 30))

        overlap = overlap_minutes_with_window(prev_end, current_start, lunch_window)
        assert overlap == 0


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
        is_off_day=False,
    )


def _make_flow_conn() -> tuple[sqlite3.Connection, str]:
    uri = f"file:flow-db-{uuid.uuid4().hex}?mode=memory&cache=shared"
    conn = sqlite3.connect(uri, uri=True)
    conn.execute(
        """
        CREATE TABLE ZSESSION (
            Z_PK INTEGER PRIMARY KEY,
            ZSTARTEDAT REAL,
            ZDURATION REAL,
            ZPHASE TEXT,
            ZTITLE TEXT,
            ZCOMPLETEDAT REAL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE ZINTERRUPTION (
            ZSESSION INTEGER,
            ZSTARTEDAT REAL,
            ZFINISHEDAT REAL
        )
        """
    )
    conn.commit()
    return conn, uri


def _insert_session(
    conn: sqlite3.Connection,
    *,
    pk: int,
    start: datetime.datetime,
    duration: float,
    phase: str,
    title: str,
    completed_at: datetime.datetime | None,
) -> None:
    conn.execute(
        """
        INSERT INTO ZSESSION (Z_PK, ZSTARTEDAT, ZDURATION, ZPHASE, ZTITLE, ZCOMPLETEDAT)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            pk,
            datetime_to_core_data(start),
            duration,
            phase,
            title,
            datetime_to_core_data(completed_at),
        ),
    )
    conn.commit()


def _load_day_sessions(
    _monkeypatch: pytest.MonkeyPatch,
    db_uri: str,
    day: datetime.date,
) -> list[dict[str, object]]:
    source = FlowStudySessionSource(
        connection_factory=lambda _readonly: sqlite3.connect(db_uri, uri=True),
        break_defaults={"shortBreak": 30, "longBreak": 60},
    )
    return source.load_sessions(day, _default_schedule())


@pytest.mark.parametrize(
    ("gap_seconds", "expected_break_minutes"),
    [(5, 0), (20, 0), (29, 0), (30, 1)],
)
def test_get_sessions_for_day_rounds_micro_break_gaps(
    monkeypatch: pytest.MonkeyPatch,
    gap_seconds: int,
    expected_break_minutes: int,
) -> None:
    day = datetime.date(2025, 12, 27)
    conn, db_uri = _make_flow_conn()
    first_start = datetime.datetime(2025, 12, 27, 9, 0)
    first_end = datetime.datetime(2025, 12, 27, 10, 0)
    next_start = first_end + datetime.timedelta(seconds=gap_seconds)

    _insert_session(
        conn,
        pk=1,
        start=first_start,
        duration=60,
        phase="flow",
        title="Study",
        completed_at=first_end,
    )
    _insert_session(
        conn,
        pk=2,
        start=first_end,
        duration=30,
        phase="shortBreak",
        title="Study",
        completed_at=first_end + datetime.timedelta(minutes=30),
    )
    _insert_session(
        conn,
        pk=3,
        start=next_start,
        duration=60,
        phase="flow",
        title="Study",
        completed_at=next_start + datetime.timedelta(minutes=60),
    )

    sessions = _load_day_sessions(monkeypatch, db_uri, day)

    assert sessions[0]["break_reason"] is None
    assert sessions[0]["break_expected"] == expected_break_minutes
    assert sessions[0]["break_duration"] == expected_break_minutes
    conn.close()


def test_get_sessions_for_day_restores_lunch_after_micro_session_undo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = datetime.date(2025, 12, 27)
    conn, db_uri = _make_flow_conn()
    lunch_start = datetime.datetime(2025, 12, 27, 12, 30)
    lunch_end = datetime.datetime(2025, 12, 27, 13, 30)

    _insert_session(
        conn,
        pk=1,
        start=lunch_start,
        duration=60,
        phase="flow",
        title="Study",
        completed_at=lunch_end,
    )
    _insert_session(
        conn,
        pk=2,
        start=lunch_end,
        duration=30,
        phase="shortBreak",
        title="Study",
        completed_at=None,
    )
    _insert_session(
        conn,
        pk=3,
        start=lunch_end + datetime.timedelta(minutes=9, seconds=20),
        duration=30,
        phase="shortBreak",
        title="Study",
        completed_at=None,
    )

    sessions = _load_day_sessions(monkeypatch, db_uri, day)

    assert len(sessions) == 1
    assert sessions[0]["break_reason"] == "lunch"
    assert sessions[0]["break_expected"] == 60
    conn.close()


def test_get_sessions_for_day_reuses_repaired_break_before_later_lunch_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = datetime.date(2025, 12, 27)
    conn, db_uri = _make_flow_conn()
    first_end = datetime.datetime(2025, 12, 27, 13, 30)
    second_start = datetime.datetime(2025, 12, 27, 13, 45)
    second_end = datetime.datetime(2025, 12, 27, 14, 0)

    _insert_session(
        conn,
        pk=1,
        start=datetime.datetime(2025, 12, 27, 12, 30),
        duration=60,
        phase="flow",
        title="Study",
        completed_at=first_end,
    )
    _insert_session(
        conn,
        pk=2,
        start=first_end,
        duration=30,
        phase="shortBreak",
        title="Study",
        completed_at=None,
    )
    _insert_session(
        conn,
        pk=3,
        start=second_start,
        duration=15,
        phase="flow",
        title="Study",
        completed_at=second_end,
    )

    sessions = _load_day_sessions(monkeypatch, db_uri, day)

    assert sessions[0]["break_reason"] is None
    assert sessions[0]["break_expected"] == 15
    assert sessions[0].get("linked_break_start") == first_end
    assert sessions[1]["break_reason"] == "lunch"
    assert sessions[1]["break_expected"] == 60
    conn.close()


def test_get_sessions_for_day_uses_repaired_break_before_later_focus(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = datetime.date(2025, 12, 27)
    conn, db_uri = _make_flow_conn()
    first_end = datetime.datetime(2025, 12, 27, 10, 0)
    next_start = datetime.datetime(2025, 12, 27, 10, 3)

    _insert_session(
        conn,
        pk=1,
        start=datetime.datetime(2025, 12, 27, 9, 0),
        duration=60,
        phase="flow",
        title="Study",
        completed_at=first_end,
    )
    _insert_session(
        conn,
        pk=2,
        start=first_end,
        duration=30,
        phase="shortBreak",
        title="Study",
        completed_at=None,
    )
    _insert_session(
        conn,
        pk=3,
        start=next_start,
        duration=45,
        phase="flow",
        title="Study",
        completed_at=next_start + datetime.timedelta(minutes=45),
    )

    sessions = _load_day_sessions(monkeypatch, db_uri, day)

    assert sessions[0]["break_expected"] == 3
    assert sessions[0]["break_reason"] is None
    assert sessions[0].get("linked_break_start") == first_end
    conn.close()


def test_get_sessions_for_day_clamps_overlapping_next_session_break_to_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = datetime.date(2025, 12, 27)
    conn, db_uri = _make_flow_conn()
    first_start = datetime.datetime(2025, 12, 27, 12, 0)
    overlapping_start = datetime.datetime(2025, 12, 27, 12, 59)

    _insert_session(
        conn,
        pk=1,
        start=first_start,
        duration=60,
        phase="flow",
        title="Study",
        completed_at=None,
    )
    _insert_session(
        conn,
        pk=2,
        start=overlapping_start,
        duration=30,
        phase="flow",
        title="Study",
        completed_at=None,
    )

    sessions = _load_day_sessions(monkeypatch, db_uri, day)

    assert sessions[0]["break_expected"] == 0
    assert sessions[0]["break_duration"] == 0
    repaired_completed_at = conn.execute(
        "SELECT ZCOMPLETEDAT FROM ZSESSION WHERE Z_PK = 1"
    ).fetchone()
    assert repaired_completed_at is not None
    assert core_data_to_datetime(repaired_completed_at[0]) == overlapping_start
    conn.close()


def test_get_sessions_for_day_repairs_superseded_open_break_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = datetime.date(2025, 12, 27)
    conn, db_uri = _make_flow_conn()
    focus_end = datetime.datetime(2025, 12, 27, 10, 0)
    next_start = datetime.datetime(2025, 12, 27, 10, 3)

    _insert_session(
        conn,
        pk=1,
        start=datetime.datetime(2025, 12, 27, 9, 0),
        duration=60,
        phase="flow",
        title="Study",
        completed_at=focus_end,
    )
    _insert_session(
        conn,
        pk=2,
        start=focus_end,
        duration=30,
        phase="shortBreak",
        title="Study",
        completed_at=None,
    )
    _insert_session(
        conn,
        pk=3,
        start=next_start,
        duration=45,
        phase="flow",
        title="Study",
        completed_at=next_start + datetime.timedelta(minutes=45),
    )

    _load_day_sessions(monkeypatch, db_uri, day)

    repaired_completed_at = conn.execute(
        "SELECT ZCOMPLETEDAT FROM ZSESSION WHERE Z_PK = 2"
    ).fetchone()
    assert repaired_completed_at is not None
    assert core_data_to_datetime(repaired_completed_at[0]) == next_start
    conn.close()


def test_get_sessions_for_day_leaves_latest_open_row_unrepaired(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = datetime.date(2025, 12, 27)
    conn, db_uri = _make_flow_conn()

    _insert_session(
        conn,
        pk=1,
        start=datetime.datetime(2025, 12, 27, 12, 0),
        duration=60,
        phase="flow",
        title="Study",
        completed_at=None,
    )

    _load_day_sessions(monkeypatch, db_uri, day)

    repaired_completed_at = conn.execute(
        "SELECT ZCOMPLETEDAT FROM ZSESSION WHERE Z_PK = 1"
    ).fetchone()
    assert repaired_completed_at is not None
    assert repaired_completed_at[0] is None
    conn.close()


def test_get_sessions_for_day_does_not_repair_from_next_day_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = datetime.date(2025, 12, 27)
    conn, db_uri = _make_flow_conn()
    next_day_start = datetime.datetime(2025, 12, 28, 8, 0)

    _insert_session(
        conn,
        pk=1,
        start=datetime.datetime(2025, 12, 27, 23, 0),
        duration=60,
        phase="flow",
        title="Study",
        completed_at=None,
    )
    _insert_session(
        conn,
        pk=2,
        start=next_day_start,
        duration=60,
        phase="flow",
        title="Study",
        completed_at=next_day_start + datetime.timedelta(minutes=60),
    )

    _load_day_sessions(monkeypatch, db_uri, day)

    repaired_completed_at = conn.execute(
        "SELECT ZCOMPLETEDAT FROM ZSESSION WHERE Z_PK = 1"
    ).fetchone()
    assert repaired_completed_at is not None
    assert repaired_completed_at[0] is None
    conn.close()
