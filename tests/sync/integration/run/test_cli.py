from __future__ import annotations

import argparse
import sqlite3
from datetime import date, datetime, time, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

import sync.run.__main__ as cli
from sync.contracts.schedule import DayScheduleProfile

FLOW_GET_PHASE = 'tell application "Flow" to getPhase'
FLOW_GET_TIME = 'tell application "Flow" to getTime'
FLOW_SKIP = 'tell application "Flow" to skip'
FLOW_START = 'tell application "Flow" to start'
FLOW_SHOW = 'tell application "Flow" to show'


def _skip_args(state: str | None = None) -> argparse.Namespace:
    return argparse.Namespace(state=state)


def _remind_args(state: str | None = None) -> argparse.Namespace:
    return argparse.Namespace(state=state)


def _media_add_args(
    *,
    url: str = "https://www.youtube.com/watch?v=abc123",
    date: str | None = None,
    title: str | None = None,
    host: str | None = None,
) -> argparse.Namespace:
    return argparse.Namespace(url=url, date=date, title=title, host=host)


def _media_book_annotations_import_args(
    *,
    html_path: str,
    note: str,
    work: str | None = None,
) -> argparse.Namespace:
    return argparse.Namespace(html_path=html_path, note=note, work=work)


def _grades_sync_args(path: str | None = None) -> argparse.Namespace:
    return argparse.Namespace(path=path)


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=time(8, 0),
        study_end=time(18, 0),
        lunch_start=time(13, 30),
        lunch_end=time(14, 30),
        workout_start=time(18, 0),
        is_off_day=False,
    )


def _make_session_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE ZSESSION (
            ZPHASE TEXT,
            ZCOMPLETEDAT REAL,
            ZSTARTEDAT REAL
        )
        """
    )
    conn.commit()
    return conn


def _insert_session_row(
    conn: sqlite3.Connection,
    *,
    phase: str,
    completed_at: float | None,
    started_at: float = 1.0,
) -> None:
    conn.execute(
        "INSERT INTO ZSESSION (ZPHASE, ZCOMPLETEDAT, ZSTARTEDAT) VALUES (?, ?, ?)",
        (phase, completed_at, started_at),
    )
    conn.commit()


def _make_open_flow_conn(*, started_at: float = 1.0) -> sqlite3.Connection:
    conn = _make_session_conn()
    _insert_session_row(conn, phase="flow", completed_at=None, started_at=started_at)
    return conn


def _print_disabled_output(disabled: bool, *, label: str) -> str:
    value = "true" if disabled else "false"
    return f'{{\n  "{label}" => {value}\n}}'


def _set_remind_state_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(cli, "PATHS", SimpleNamespace(journal_cache_dir=str(cache_dir)))
    return cache_dir / cli.FLOW_REMINDER_STATE_FILENAME


def _patch_common_daily_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "bootstrap_cache_layout", lambda: None)
    monkeypatch.setattr(cli, "MarkdownNoteStore", lambda: object())
    monkeypatch.setattr(cli, "MarkdownGoalStore", lambda: object())
    monkeypatch.setattr(cli, "MarkdownReminderRuleStore", lambda: object())
    monkeypatch.setattr(cli, "VaultContextSource", lambda: object())
    monkeypatch.setattr(cli, "JsonGoalCarryForwardCacheStore", lambda: object())
    monkeypatch.setattr(cli, "JsonGoalReconcileCacheStore", lambda: object())
    monkeypatch.setattr(cli, "JsonDailyTrainingCacheStore", lambda: object())
    monkeypatch.setattr(cli, "JsonDailyScreenTimeCacheStore", lambda: object())
    monkeypatch.setattr(cli, "GoalSyncService", lambda **_kwargs: object())


def test_run_daily_sync_non_today_days_first_then_today(monkeypatch):
    anchor_day = date.today()
    loaded_session_days: list[date] = []
    resolved_schedule_days: list[date] = []
    synced_days: list[tuple[date, list[dict[str, str]]]] = []

    _patch_common_daily_runtime(monkeypatch)

    class _FakeSessionSource:
        def load_sessions(
            self,
            day: date,
            day_schedule: DayScheduleProfile,
        ) -> list[dict[str, str]]:
            loaded_session_days.append(day)
            assert day_schedule == _default_schedule()
            return [{"source_day": day.isoformat()}]

    class _FakeStatusSource:
        def __init__(self, *, screen_time_cache_store) -> None:
            _ = screen_time_cache_store

        def target_days(self, run_anchor: date) -> tuple[date, ...]:
            assert run_anchor == anchor_day
            return (
                run_anchor,
                run_anchor - timedelta(days=1),
                run_anchor - timedelta(days=2),
            )

    class _FakeDailySyncService:
        def __init__(self, **kwargs) -> None:
            _ = kwargs

        def sync_day(
            self,
            day: date,
            sessions: list[dict[str, str]],
            day_schedule: DayScheduleProfile,
        ):
            assert day_schedule == _default_schedule()
            synced_days.append((day, sessions))
            return True

    class _FakeScheduleSource:
        def resolve_day(self, day: date) -> DayScheduleProfile:
            resolved_schedule_days.append(day)
            return _default_schedule()

    monkeypatch.setattr(cli, "FlowStudySessionSource", lambda: _FakeSessionSource())
    monkeypatch.setattr(cli, "ICloudDailyStatusSource", _FakeStatusSource)
    monkeypatch.setattr(cli, "DailySyncService", _FakeDailySyncService)
    monkeypatch.setattr(cli, "MarkdownScheduleSource", _FakeScheduleSource)

    cli._run_daily_sync()

    expected_days = [
        anchor_day - timedelta(days=2),
        anchor_day - timedelta(days=1),
        anchor_day,
    ]
    assert loaded_session_days == expected_days
    assert resolved_schedule_days == expected_days
    assert [day for day, _sessions in synced_days] == expected_days


def test_run_daily_sync_today_only_when_no_backfill_targets(monkeypatch):
    anchor_day = date.today()
    loaded_session_days: list[date] = []
    resolved_schedule_days: list[date] = []
    synced_days: list[date] = []

    _patch_common_daily_runtime(monkeypatch)

    class _FakeSessionSource:
        def load_sessions(
            self,
            day: date,
            day_schedule: DayScheduleProfile,
        ) -> list[dict]:
            loaded_session_days.append(day)
            assert day_schedule == _default_schedule()
            return []

    class _FakeStatusSource:
        def __init__(self, *, screen_time_cache_store) -> None:
            _ = screen_time_cache_store

        def target_days(self, run_anchor: date) -> tuple[date, ...]:
            assert run_anchor == anchor_day
            return (run_anchor,)

    class _FakeDailySyncService:
        def __init__(self, **kwargs) -> None:
            _ = kwargs

        def sync_day(
            self,
            day: date,
            sessions: list[dict],
            day_schedule: DayScheduleProfile,
        ):
            _ = sessions
            assert day_schedule == _default_schedule()
            synced_days.append(day)
            return True

    class _FakeScheduleSource:
        def resolve_day(self, day: date) -> DayScheduleProfile:
            resolved_schedule_days.append(day)
            return _default_schedule()

    monkeypatch.setattr(cli, "FlowStudySessionSource", lambda: _FakeSessionSource())
    monkeypatch.setattr(cli, "ICloudDailyStatusSource", _FakeStatusSource)
    monkeypatch.setattr(cli, "DailySyncService", _FakeDailySyncService)
    monkeypatch.setattr(cli, "MarkdownScheduleSource", _FakeScheduleSource)

    cli._run_daily_sync()

    assert loaded_session_days == [anchor_day]
    assert resolved_schedule_days == [anchor_day]
    assert synced_days == [anchor_day]


def test_period_all_runs_in_expected_order(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    monkeypatch.setattr(cli, "_run_daily_sync", lambda: calls.append("daily"))
    monkeypatch.setattr(
        cli,
        "_run_weekly_sync",
        lambda *, date_arg, no_cleanup: calls.append(f"weekly:{date_arg}:{no_cleanup}"),
    )
    monkeypatch.setattr(
        cli,
        "_run_monthly_sync",
        lambda *, month_arg, no_cleanup: calls.append(
            f"monthly:{month_arg}:{no_cleanup}"
        ),
    )
    monkeypatch.setattr(
        cli,
        "_run_quarterly_sync",
        lambda *, quarter_arg: calls.append(f"quarterly:{quarter_arg}"),
    )
    monkeypatch.setattr(
        cli,
        "_run_yearly_sync",
        lambda *, year_arg: calls.append(f"yearly:{year_arg}"),
    )

    rc = cli.cmd_period_all(argparse.Namespace())

    assert rc == 0
    assert calls == [
        "daily",
        "weekly:None:False",
        "monthly:None:False",
        "quarterly:None",
        "yearly:None",
    ]


def test_period_all_is_fail_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def _boom_daily() -> None:
        calls.append("daily")
        raise RuntimeError("boom")

    monkeypatch.setattr(cli, "_run_daily_sync", _boom_daily)
    monkeypatch.setattr(
        cli,
        "_run_weekly_sync",
        lambda *, date_arg, no_cleanup: calls.append("weekly"),
    )

    rc = cli.main(["period", "all"])

    assert rc == 1
    assert calls == ["daily"]


def test_latest_row_is_open_flow_true_for_open_flow() -> None:
    conn = _make_session_conn()
    _insert_session_row(conn, phase="shortBreak", completed_at=None, started_at=1.0)
    _insert_session_row(conn, phase="flow", completed_at=None, started_at=2.0)

    assert cli._latest_row_is_open_flow(conn) is True
    conn.close()


def test_latest_row_is_open_flow_false_for_completed_flow() -> None:
    conn = _make_session_conn()
    _insert_session_row(conn, phase="flow", completed_at=1234.0)

    assert cli._latest_row_is_open_flow(conn) is False
    conn.close()


def test_latest_row_is_open_flow_false_for_open_break() -> None:
    conn = _make_session_conn()
    _insert_session_row(conn, phase="shortBreak", completed_at=None)

    assert cli._latest_row_is_open_flow(conn) is False
    conn.close()


def test_latest_row_is_open_flow_false_when_no_rows() -> None:
    conn = _make_session_conn()

    assert cli._latest_row_is_open_flow(conn) is False
    conn.close()


def test_session_skip_noops_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "_skip_enabled_state", lambda: False)

    def _fail_run(_script: str) -> str:
        raise AssertionError(
            "AppleScript should not run when skip automation is disabled"
        )

    monkeypatch.setattr(cli, "_run_applescript", _fail_run)

    def _fail_conn(*_args, **_kwargs):
        raise AssertionError("DB should not be opened when skip automation is disabled")

    monkeypatch.setattr(cli, "get_connection", _fail_conn)

    rc = cli.cmd_session_skip(_skip_args())
    assert rc == 0


def test_session_skip_noops_when_phase_is_not_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli, "_skip_enabled_state", lambda: True)
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Break"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    def _fail_conn(*_args, **_kwargs):
        raise AssertionError("DB should not be opened when phase is not Flow")

    monkeypatch.setattr(cli, "get_connection", _fail_conn)

    rc = cli.cmd_session_skip(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE]


def test_session_skip_executes_when_phase_flow_and_latest_row_open_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli, "_skip_enabled_state", lambda: True)
    conn = _make_session_conn()
    _insert_session_row(conn, phase="flow", completed_at=None)
    monkeypatch.setattr(cli, "get_connection", lambda readonly=True: conn)
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_skip(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE, FLOW_SKIP, FLOW_START, FLOW_SHOW]


def test_session_skip_noops_when_latest_row_is_completed_flow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli, "_skip_enabled_state", lambda: True)
    conn = _make_session_conn()
    _insert_session_row(conn, phase="flow", completed_at=1234.0)
    monkeypatch.setattr(cli, "get_connection", lambda readonly=True: conn)
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_skip(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE]


def test_session_skip_noops_on_db_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "_skip_enabled_state", lambda: True)
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    def _raise_db(*_args, **_kwargs):
        raise sqlite3.OperationalError("db unavailable")

    monkeypatch.setattr(cli, "get_connection", _raise_db)

    rc = cli.cmd_session_skip(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE]


def test_session_skip_executes_without_schedule_dependency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli, "_skip_enabled_state", lambda: True)

    def _fail_schedule_source() -> object:
        raise AssertionError("Schedule source should not be consulted by session skip")

    monkeypatch.setattr(cli, "MarkdownScheduleSource", _fail_schedule_source)
    conn = _make_session_conn()
    _insert_session_row(conn, phase="flow", completed_at=None)
    monkeypatch.setattr(cli, "get_connection", lambda readonly=True: conn)
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_skip(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE, FLOW_SKIP, FLOW_START, FLOW_SHOW]


def test_session_skip_state_status_prints_state(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        cli,
        "_run_launchctl",
        lambda args: (
            0,
            _print_disabled_output(disabled=False, label=cli.SKIP_LAUNCHD_LABEL),
            "",
        ),
    )

    rc = cli.cmd_session_skip(_skip_args("status"))

    assert rc == 0
    assert "Skip automation: ENABLED" in capsys.readouterr().out


def test_session_skip_state_toggle_calls_launchctl_disable(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    calls: list[list[str]] = []
    responses = [
        (0, _print_disabled_output(disabled=False, label=cli.SKIP_LAUNCHD_LABEL), ""),
        (0, "", ""),
        (0, _print_disabled_output(disabled=True, label=cli.SKIP_LAUNCHD_LABEL), ""),
    ]

    def _fake_launchctl(args: list[str]) -> tuple[int, str, str]:
        calls.append(args)
        return responses[len(calls) - 1]

    monkeypatch.setattr(cli, "_run_launchctl", _fake_launchctl)

    rc = cli.cmd_session_skip(_skip_args("toggle"))

    assert rc == 0
    assert calls == [
        ["print-disabled", cli.SKIP_LAUNCHD_DOMAIN],
        ["disable", cli.SKIP_LAUNCHD_TARGET],
        ["print-disabled", cli.SKIP_LAUNCHD_DOMAIN],
    ]
    assert "Skip automation: DISABLED" in capsys.readouterr().out


def test_session_remind_noops_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: False)

    def _fail_run(_script: str) -> str:
        raise AssertionError(
            "AppleScript should not run when remind automation is disabled"
        )

    monkeypatch.setattr(cli, "_run_applescript", _fail_run)

    def _fail_conn(*_args, **_kwargs):
        raise AssertionError(
            "DB should not be opened when remind automation is disabled"
        )

    monkeypatch.setattr(cli, "get_connection", _fail_conn)

    rc = cli.cmd_session_remind(_remind_args())
    assert rc == 0


def test_session_remind_noops_when_phase_is_not_flow_and_clears_state(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    state_path = _set_remind_state_dir(monkeypatch, tmp_path)
    cli._save_flow_reminder_state(
        {
            "open_session_started_at": 1.0,
            "remaining_time": "25:00",
            "stagnant_checks": 2,
            "last_reminded_epoch": 1000.0,
        }
    )
    assert state_path.exists()

    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: True)
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Break"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    def _fail_conn(*_args, **_kwargs):
        raise AssertionError("DB should not be opened when phase is not Flow")

    monkeypatch.setattr(cli, "get_connection", _fail_conn)

    rc = cli.cmd_session_remind(_remind_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE]
    assert not state_path.exists()


def test_session_remind_noops_when_latest_row_is_not_open_flow_and_clears_state(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    state_path = _set_remind_state_dir(monkeypatch, tmp_path)
    cli._save_flow_reminder_state(
        {
            "open_session_started_at": 1.0,
            "remaining_time": "25:00",
            "stagnant_checks": 2,
            "last_reminded_epoch": 1000.0,
        }
    )
    assert state_path.exists()

    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: True)
    conn = _make_session_conn()
    _insert_session_row(conn, phase="flow", completed_at=1234.0, started_at=2.0)
    monkeypatch.setattr(cli, "get_connection", lambda readonly=True: conn)
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_remind(_remind_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE]
    assert not state_path.exists()


def test_session_remind_establishes_baseline_without_revealing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _set_remind_state_dir(monkeypatch, tmp_path)
    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: True)
    monkeypatch.setattr(
        cli,
        "get_connection",
        lambda readonly=True: _make_open_flow_conn(started_at=10.0),
    )
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        if script == FLOW_GET_TIME:
            return "25:00"
        raise AssertionError("Flow show should not run while baseline is establishing")

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_remind(_remind_args())

    assert rc == 0
    assert calls == [FLOW_GET_PHASE, FLOW_GET_TIME]
    assert cli._load_flow_reminder_state() == {
        "open_session_started_at": 10.0,
        "remaining_time": "25:00",
        "stagnant_checks": 0,
        "last_reminded_epoch": None,
    }


def test_session_remind_reveals_on_first_stagnant_check(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _set_remind_state_dir(monkeypatch, tmp_path)
    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: True)
    monkeypatch.setattr(
        cli,
        "get_connection",
        lambda readonly=True: _make_open_flow_conn(started_at=10.0),
    )
    monkeypatch.setattr(cli, "_now", lambda: datetime(2026, 2, 27, 12, 0, 0))
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        if script == FLOW_GET_TIME:
            return "25:00"
        if script == FLOW_SHOW:
            return "Flow"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    first_rc = cli.cmd_session_remind(_remind_args())
    second_rc = cli.cmd_session_remind(_remind_args())

    assert first_rc == 0
    assert second_rc == 0
    assert calls == [
        FLOW_GET_PHASE,
        FLOW_GET_TIME,
        FLOW_GET_PHASE,
        FLOW_GET_TIME,
        FLOW_SHOW,
    ]
    state = cli._load_flow_reminder_state()
    assert state["open_session_started_at"] == 10.0
    assert state["remaining_time"] == "25:00"
    assert state["stagnant_checks"] == 1
    assert state["last_reminded_epoch"] == datetime(2026, 2, 27, 12, 0, 0).timestamp()


def test_session_remind_respects_cooldown(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _set_remind_state_dir(monkeypatch, tmp_path)
    cli._save_flow_reminder_state(
        {
            "open_session_started_at": 10.0,
            "remaining_time": "25:00",
            "stagnant_checks": 1,
            "last_reminded_epoch": 1000.0,
        }
    )
    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: True)
    monkeypatch.setattr(
        cli,
        "get_connection",
        lambda readonly=True: _make_open_flow_conn(started_at=10.0),
    )
    monkeypatch.setattr(cli, "_now", lambda: datetime.fromtimestamp(1060.0))
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        if script == FLOW_GET_TIME:
            return "25:00"
        raise AssertionError("Flow show should not run while cooldown is active")

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_remind(_remind_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE, FLOW_GET_TIME]
    state = cli._load_flow_reminder_state()
    assert state["stagnant_checks"] == 2
    assert state["last_reminded_epoch"] == 1000.0


def test_session_remind_allows_reremind_after_cooldown(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _set_remind_state_dir(monkeypatch, tmp_path)
    cli._save_flow_reminder_state(
        {
            "open_session_started_at": 10.0,
            "remaining_time": "25:00",
            "stagnant_checks": 1,
            "last_reminded_epoch": 1000.0,
        }
    )
    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: True)
    monkeypatch.setattr(
        cli,
        "get_connection",
        lambda readonly=True: _make_open_flow_conn(started_at=10.0),
    )
    monkeypatch.setattr(cli, "_now", lambda: datetime.fromtimestamp(1121.0))
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        if script == FLOW_GET_TIME:
            return "25:00"
        if script == FLOW_SHOW:
            return "Flow"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_remind(_remind_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE, FLOW_GET_TIME, FLOW_SHOW]
    state = cli._load_flow_reminder_state()
    assert state["stagnant_checks"] == 2
    assert state["last_reminded_epoch"] == 1121.0


def test_session_remind_resets_counter_when_timer_moves(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _set_remind_state_dir(monkeypatch, tmp_path)
    cli._save_flow_reminder_state(
        {
            "open_session_started_at": 10.0,
            "remaining_time": "25:00",
            "stagnant_checks": 4,
            "last_reminded_epoch": 1000.0,
        }
    )
    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: True)
    monkeypatch.setattr(
        cli,
        "get_connection",
        lambda readonly=True: _make_open_flow_conn(started_at=10.0),
    )
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        if script == FLOW_GET_TIME:
            return "24:59"
        raise AssertionError("Flow show should not run when timer moved")

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_remind(_remind_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE, FLOW_GET_TIME]
    state = cli._load_flow_reminder_state()
    assert state["stagnant_checks"] == 0
    assert state["remaining_time"] == "24:59"
    assert state["last_reminded_epoch"] == 1000.0


def test_session_remind_resets_baseline_when_session_marker_changes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _set_remind_state_dir(monkeypatch, tmp_path)
    cli._save_flow_reminder_state(
        {
            "open_session_started_at": 10.0,
            "remaining_time": "25:00",
            "stagnant_checks": 4,
            "last_reminded_epoch": 1000.0,
        }
    )
    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: True)
    monkeypatch.setattr(
        cli,
        "get_connection",
        lambda readonly=True: _make_open_flow_conn(started_at=11.0),
    )
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        if script == FLOW_GET_TIME:
            return "25:00"
        raise AssertionError("Flow show should not run when session marker changed")

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_remind(_remind_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE, FLOW_GET_TIME]
    state = cli._load_flow_reminder_state()
    assert state["open_session_started_at"] == 11.0
    assert state["stagnant_checks"] == 0
    assert state["last_reminded_epoch"] == 1000.0


def test_session_remind_state_status_prints_state(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        cli,
        "_run_launchctl",
        lambda args: (
            0,
            _print_disabled_output(disabled=False, label=cli.REMIND_LAUNCHD_LABEL),
            "",
        ),
    )

    rc = cli.cmd_session_remind(_remind_args("status"))

    assert rc == 0
    assert "Remind automation: ENABLED" in capsys.readouterr().out


def test_session_remind_state_toggle_calls_launchctl_disable(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    calls: list[list[str]] = []
    responses = [
        (0, _print_disabled_output(disabled=False, label=cli.REMIND_LAUNCHD_LABEL), ""),
        (0, "", ""),
        (0, _print_disabled_output(disabled=True, label=cli.REMIND_LAUNCHD_LABEL), ""),
    ]

    def _fake_launchctl(args: list[str]) -> tuple[int, str, str]:
        calls.append(args)
        return responses[len(calls) - 1]

    monkeypatch.setattr(cli, "_run_launchctl", _fake_launchctl)

    rc = cli.cmd_session_remind(_remind_args("toggle"))

    assert rc == 0
    assert calls == [
        ["print-disabled", cli.REMIND_LAUNCHD_DOMAIN],
        ["disable", cli.REMIND_LAUNCHD_TARGET],
        ["print-disabled", cli.REMIND_LAUNCHD_DOMAIN],
    ]
    assert "Remind automation: DISABLED" in capsys.readouterr().out


def test_session_remind_executes_without_schedule_dependency(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _set_remind_state_dir(monkeypatch, tmp_path)
    monkeypatch.setattr(cli, "_remind_enabled_state", lambda: True)

    def _fail_schedule_source() -> object:
        raise AssertionError(
            "Schedule source should not be consulted by session remind"
        )

    monkeypatch.setattr(cli, "MarkdownScheduleSource", _fail_schedule_source)
    monkeypatch.setattr(
        cli,
        "get_connection",
        lambda readonly=True: _make_open_flow_conn(started_at=10.0),
    )
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        if script == FLOW_GET_TIME:
            return "25:00"
        raise AssertionError("Flow show should not run while baseline is establishing")

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_session_remind(_remind_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE, FLOW_GET_TIME]


def _write_podcast_template(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "---",
                "host:",
                'date: <% tp.date.now("YYYY-MM-DD") %>',
                "link:",
                "genre: psychology",
                "---",
                "",
                "# Notes",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


class _StubMediaCacheStore:
    def __init__(self) -> None:
        self.saved: list[dict[str, dict[str, str]]] = []

    def load(self) -> dict[str, dict[str, str]]:
        return {"books": {"Book A": "2026-01-01"}, "podcasts": {}}

    def save(self, state: dict[str, dict[str, str]]) -> None:
        self.saved.append(state)


def _patch_media_paths(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    vault_dir = tmp_path / "vault"
    templates_dir = vault_dir / "notes" / "templates"
    podcasts_dir = vault_dir / "notes" / "podcasts"
    templates_dir.mkdir(parents=True, exist_ok=True)
    podcasts_dir.mkdir(parents=True, exist_ok=True)
    _write_book_template(templates_dir / "book.md")
    _write_podcast_template(templates_dir / "podcast.md")
    monkeypatch.setattr(
        cli,
        "PATHS",
        SimpleNamespace(vault_dir=str(vault_dir), podcasts_dir=str(podcasts_dir)),
    )
    return podcasts_dir


def _write_book_template(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "---",
                "author:",
                'started: <% tp.date.now("YYYY-MM-DD") %>',
                "completed:",
                "rating:",
                "---",
                "",
                "## Highlights",
                "---",
                "",
                "## Reflections",
                "---",
                "",
            ]
        ),
        encoding="utf-8",
    )


def _write_book_note(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "---",
                "author: Carl Jung",
                "started: 2026-01-01",
                "completed:",
                "rating:",
                "---",
                "",
                "## Highlights",
                "---",
                "",
                "| PAGE | QUOTE |",
                "| ---- | ----- |",
                "| **1** | Old quote |",
                "",
                "## Reflections",
                "---",
                "",
                "- Keep this reflection",
                "",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def _write_kindle_export(path: Path) -> None:
    path.write_text(
        "".join(
            [
                "<html><body>",
                '<div class="bookTitle">Memories Dreams Reflections</div>',
                '<div class="authors">Carl Jung</div>',
                '<div class="noteHeading">Highlight - Page 293 · Location 3835</div>',
                '<div class="noteText">First quote with a | pipe</div>',
                '<div class="noteHeading">Bookmark - Page 294 · Location 3840</div>',
                '<div class="noteHeading">Highlight - Location 3901</div>',
                '<div class="noteText">Second quote</div>',
                "</body></html>",
            ]
        ),
        encoding="utf-8",
    )


def _write_anthology_kindle_export(path: Path) -> None:
    path.write_text(
        "".join(
            [
                "<html><body>",
                '<div class="bookTitle">Complete Works of Fyodor Dostoyevsky</div>',
                '<div class="authors">Fyodor Dostoyevsky</div>',
                (
                    '<div class="noteHeading">'
                    'Highlight(<span class="highlight_yellow">yellow</span>) - '
                    "THE IDIOT > Location 38592"
                    "</div>"
                ),
                '<div class="noteText">The Idiot quote</div>',
                (
                    '<div class="noteHeading">'
                    'Highlight(<span class="highlight_yellow">yellow</span>) - '
                    "THE BROTHERS KARAMAZOV > Location 73625"
                    "</div>"
                ),
                '<div class="noteText">Karamazov quote one</div>',
                (
                    '<div class="noteHeading">'
                    'Highlight(<span class="highlight_yellow">yellow</span>) - '
                    "THE BROTHERS KARAMAZOV > Page 512 · Location 74206"
                    "</div>"
                ),
                '<div class="noteText">Karamazov quote two</div>',
                "</body></html>",
            ]
        ),
        encoding="utf-8",
    )


def test_media_podcast_add_creates_note_with_sanitized_filename(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    podcasts_dir = _patch_media_paths(monkeypatch, tmp_path)
    cache_store = _StubMediaCacheStore()
    monkeypatch.setattr(cli, "JsonMediaDateCacheStore", lambda: cache_store)
    monkeypatch.setattr(
        cli,
        "_fetch_youtube_oembed_metadata",
        lambda _url: ("2017 Personality 01: Introduction", "Jordan B Peterson"),
    )

    rc = cli.cmd_media_podcast_add(
        _media_add_args(
            url="https://www.youtube.com/watch?v=kYYJlNbV1OM",
            date="2026-02-20",
        )
    )

    assert rc == 0
    note_path = podcasts_dir / "2017 Personality 01 - Introduction.md"
    assert note_path.exists()
    lines = note_path.read_text(encoding="utf-8").splitlines()
    assert "host: Jordan B Peterson" in lines
    assert "date: 2026-02-20" in lines
    assert "link: https://www.youtube.com/watch?v=kYYJlNbV1OM" in lines
    assert "genre: psychology" in lines
    assert lines[-1] == "# Notes"
    assert cache_store.saved == [
        {
            "books": {"Book A": "2026-01-01"},
            "podcasts": {"2017 Personality 01 - Introduction": "2026-02-20"},
        }
    ]


def test_media_podcast_add_fails_when_note_already_exists(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    podcasts_dir = _patch_media_paths(monkeypatch, tmp_path)
    existing_path = podcasts_dir / "Existing Episode.md"
    existing_content = "---\nhost: Existing\ndate: 2026-01-01\nlink: x\n---\n"
    existing_path.write_text(existing_content, encoding="utf-8")
    cache_store = _StubMediaCacheStore()
    monkeypatch.setattr(cli, "JsonMediaDateCacheStore", lambda: cache_store)
    monkeypatch.setattr(
        cli,
        "_fetch_youtube_oembed_metadata",
        lambda _url: ("Existing Episode", "Jordan B Peterson"),
    )

    rc = cli.cmd_media_podcast_add(
        _media_add_args(url="https://www.youtube.com/watch?v=dup1", date="2026-02-20")
    )

    assert rc == 1
    assert existing_path.read_text(encoding="utf-8") == existing_content
    assert cache_store.saved == []


def test_media_podcast_add_uses_manual_overrides_when_metadata_fails(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    podcasts_dir = _patch_media_paths(monkeypatch, tmp_path)
    cache_store = _StubMediaCacheStore()
    monkeypatch.setattr(cli, "JsonMediaDateCacheStore", lambda: cache_store)
    monkeypatch.setattr(
        cli, "_fetch_youtube_oembed_metadata", lambda _url: (None, None)
    )

    rc = cli.cmd_media_podcast_add(
        _media_add_args(
            url="https://www.youtube.com/watch?v=manual1",
            date="2026-02-21",
            title="Manual: Title",
            host="Manual Host",
        )
    )

    assert rc == 0
    note_path = podcasts_dir / "Manual - Title.md"
    assert note_path.exists()
    lines = note_path.read_text(encoding="utf-8").splitlines()
    assert "host: Manual Host" in lines
    assert "date: 2026-02-21" in lines


def test_media_podcast_add_fails_when_title_and_host_cannot_be_resolved(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    monkeypatch.setattr(
        cli, "_fetch_youtube_oembed_metadata", lambda _url: (None, None)
    )

    rc = cli.cmd_media_podcast_add(
        _media_add_args(url="https://www.youtube.com/watch?v=missing")
    )

    assert rc == 1


def test_media_podcast_add_fails_on_invalid_date(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    monkeypatch.setattr(
        cli,
        "_fetch_youtube_oembed_metadata",
        lambda _url: ("Valid Title", "Valid Host"),
    )

    rc = cli.cmd_media_podcast_add(
        _media_add_args(
            url="https://www.youtube.com/watch?v=bad-date",
            date="2026-99-99",
        )
    )

    assert rc == 1


def test_media_book_annotations_import_replaces_highlights_and_keeps_reflections(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    html_path = tmp_path / "kindle.html"
    note_path = tmp_path / "book.md"
    _write_kindle_export(html_path)
    _write_book_note(note_path)

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(note_path),
        )
    )

    assert rc == 0
    content = note_path.read_text(encoding="utf-8")
    assert "| PAGE | QUOTE |" in content
    assert "| LOC. | QUOTE |" in content
    assert "| **293** | First quote with a \\| pipe |" in content
    assert "| **3901** | Second quote |" in content
    assert "Old quote" not in content
    assert "- Keep this reflection" in content
    assert not html_path.exists()


def test_media_book_annotations_import_creates_missing_sections(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    html_path = tmp_path / "kindle.html"
    note_path = tmp_path / "book.md"
    _write_kindle_export(html_path)
    note_path.write_text("---\nauthor: Carl Jung\n---\n", encoding="utf-8")

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(note_path),
        )
    )

    assert rc == 0
    lines = note_path.read_text(encoding="utf-8").splitlines()
    assert "## Highlights" in lines
    assert "## Reflections" in lines


def test_media_book_annotations_import_fails_on_relative_paths(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    html_path = tmp_path / "kindle.html"
    note_path = tmp_path / "book.md"
    _write_kindle_export(html_path)
    _write_book_note(note_path)

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=html_path.name,
            note=str(note_path),
        )
    )
    assert rc == 1

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=note_path.name,
        )
    )
    assert rc == 1


def test_media_book_annotations_import_creates_missing_note_from_template(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    html_path = tmp_path / "kindle.html"
    note_path = tmp_path / "The Brothers Karamazov.md"
    _write_anthology_kindle_export(html_path)

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(note_path),
        )
    )

    assert rc == 0
    assert not html_path.exists()
    lines = note_path.read_text(encoding="utf-8").splitlines()
    assert "author: Fyodor Dostoyevsky" in lines
    assert f"completed: {date.today().isoformat()}" in lines
    assert 'started: <% tp.date.now("YYYY-MM-DD") %>' in lines
    assert "rating:" in lines
    assert "| **73625** | Karamazov quote one |" in lines
    assert "| **512** | Karamazov quote two |" in lines
    assert "The Idiot quote" not in note_path.read_text(encoding="utf-8")


def test_media_book_annotations_import_fails_when_template_is_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    vault_dir = tmp_path / "vault"
    monkeypatch.setattr(
        cli,
        "PATHS",
        SimpleNamespace(
            vault_dir=str(vault_dir), podcasts_dir=str(vault_dir / "podcasts")
        ),
    )
    html_path = tmp_path / "kindle.html"
    _write_kindle_export(html_path)

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(tmp_path / "missing.md"),
        )
    )

    assert rc == 1
    assert html_path.exists()


def test_media_book_annotations_import_fails_when_no_parsable_rows(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    html_path = tmp_path / "kindle.html"
    note_path = tmp_path / "book.md"
    note_path.write_text(
        "## Highlights\n---\n\n## Reflections\n---\n", encoding="utf-8"
    )
    html_path.write_text(
        "".join(
            [
                "<html><body>",
                '<div class="bookTitle">Memories Dreams Reflections</div>',
                '<div class="noteHeading">Highlight - Chapter III</div>',
                '<div class="noteText">Quote without page or location</div>',
                "</body></html>",
            ]
        ),
        encoding="utf-8",
    )

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(note_path),
        )
    )

    assert rc == 1
    assert html_path.exists()


def test_media_book_annotations_import_supports_explicit_work_override(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    html_path = tmp_path / "anthology.html"
    note_path = tmp_path / "Selected Work.md"
    _write_anthology_kindle_export(html_path)
    _write_book_note(note_path)

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(note_path),
            work="The Brothers Karamazov",
        )
    )

    assert rc == 0
    content = note_path.read_text(encoding="utf-8")
    assert "Karamazov quote one" in content
    assert "Karamazov quote two" in content
    assert "The Idiot quote" not in content


def test_media_book_annotations_import_preserves_existing_completed_date(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    html_path = tmp_path / "anthology.html"
    note_path = tmp_path / "The Brothers Karamazov.md"
    _write_anthology_kindle_export(html_path)
    note_path.write_text(
        "\n".join(
            [
                "---",
                "author: Existing Author",
                "started: 2025-12-03",
                "completed: 2026-01-20",
                "rating: 10",
                "---",
                "",
                "## Highlights",
                "---",
                "",
                "## Reflections",
                "---",
                "",
                "- Keep this reflection",
            ]
        ),
        encoding="utf-8",
    )

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(note_path),
        )
    )

    assert rc == 0
    content = note_path.read_text(encoding="utf-8")
    assert "author: Existing Author" in content
    assert "completed: 2026-01-20" in content
    assert "- Keep this reflection" in content


def test_media_book_annotations_import_fails_when_work_title_has_no_match(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_media_paths(monkeypatch, tmp_path)
    html_path = tmp_path / "anthology.html"
    note_path = tmp_path / "Notes from Underground.md"
    _write_anthology_kindle_export(html_path)

    rc = cli.cmd_media_book_annotations_import(
        _media_book_annotations_import_args(
            html_path=str(html_path),
            note=str(note_path),
        )
    )

    assert rc == 1
    assert html_path.exists()
    assert not note_path.exists()


def _write_grades_note(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "## YEAR 1",
                "| EXAM | CFU | GRADE |",
                "| ---- | --- | ----- |",
                "| ALGORITHMS | 6 | 30L |",
                "| ENGLISH B1 | 3 | ID |",
                "",
                "## YEAR 2",
                "| EXAM | CFU | GRADE |",
                "| ---- | --- | ----- |",
                "| MICROECONOMIA | 6 | 24 |",
                "",
                "## OVERALL",
                "| AVERAGE GRADE | % | CFU | LODE | BONUS | THESIS | FINAL |",
                "| ------------- | - | --- | ---- | ----- | ------ | ----- |",
                "| 0 | 0 | 0 | 0 | 0 | 6 | 0 |",
                "",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def test_grades_sync_updates_overall_values(tmp_path: Path) -> None:
    grades_path = tmp_path / "GRADES.md"
    _write_grades_note(grades_path)

    rc = cli.cmd_grades_sync(_grades_sync_args(str(grades_path)))

    assert rc == 0
    content = grades_path.read_text(encoding="utf-8")
    assert "| 27.00 | 0.90 | 15 | 1 | 0 | 6 | 105 |" in content


def test_grades_sync_uses_default_path(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    grades_path = tmp_path / "GRADES.md"
    _write_grades_note(grades_path)
    monkeypatch.setattr(cli, "GRADES_PATH", str(grades_path))

    rc = cli.cmd_grades_sync(_grades_sync_args())

    assert rc == 0
    content = grades_path.read_text(encoding="utf-8")
    assert "| 27.00 | 0.90 | 15 | 1 | 0 | 6 | 105 |" in content


def test_grades_sync_returns_error_when_file_is_missing(tmp_path: Path) -> None:
    rc = cli.cmd_grades_sync(_grades_sync_args(str(tmp_path / "missing.md")))
    assert rc == 1


def test_cli_parser_has_expected_commands() -> None:
    parser = cli.build_parser()

    args = parser.parse_args(["session", "rename", "Retitle", "--confirm"])
    assert args.domain == "session"
    assert args.session_command == "rename"
    assert args.title == "Retitle"
    assert args.confirm is True

    args = parser.parse_args(["session", "undo", "--confirm"])
    assert args.domain == "session"
    assert args.session_command == "undo"
    assert args.confirm is True

    args = parser.parse_args(["session", "skip", "--state", "status"])
    assert args.domain == "session"
    assert args.session_command == "skip"
    assert args.state == "status"

    args = parser.parse_args(["session", "remind", "--state", "status"])
    assert args.domain == "session"
    assert args.session_command == "remind"
    assert args.state == "status"

    args = parser.parse_args(["period", "weekly", "--date", "2026-02-17"])
    assert args.domain == "period"
    assert args.period_command == "weekly"
    assert args.date == "2026-02-17"

    args = parser.parse_args(["period", "monthly", "--month", "2026-02"])
    assert args.domain == "period"
    assert args.period_command == "monthly"
    assert args.month == "2026-02"

    args = parser.parse_args(
        [
            "media",
            "podcast",
            "add",
            "https://www.youtube.com/watch?v=kYYJlNbV1OM",
            "--date",
            "2026-02-20",
            "--title",
            "Podcast Title",
            "--host",
            "Podcast Host",
        ]
    )
    assert args.domain == "media"
    assert args.media_command == "podcast"
    assert args.podcast_command == "add"
    assert args.date == "2026-02-20"
    assert args.title == "Podcast Title"
    assert args.host == "Podcast Host"

    args = parser.parse_args(
        [
            "media",
            "book",
            "annotations",
            "import",
            "/tmp/kindle.html",
            "--note",
            "/tmp/Book.md",
        ]
    )
    assert args.domain == "media"
    assert args.media_command == "book"
    assert args.book_command == "annotations"
    assert args.book_annotations_command == "import"
    assert args.html_path == "/tmp/kindle.html"
    assert args.note == "/tmp/Book.md"
    assert args.work is None

    args = parser.parse_args(["grades", "sync", "--path", "/tmp/GRADES.md"])
    assert args.domain == "grades"
    assert args.grades_command == "sync"
    assert args.path == "/tmp/GRADES.md"

    args = parser.parse_args(
        [
            "goals",
            "add",
            "--period",
            "monthly",
            "--next",
            "Prepare next month review",
        ]
    )
    assert args.domain == "goals"
    assert args.goals_command == "add"
    assert args.period == "monthly"
    assert args.next is True
    assert args.current is False
    assert args.text == "Prepare next month review"

    args = parser.parse_args(
        ["goals", "add", "--period", "daily", "Plan tomorrow priorities"]
    )
    assert args.domain == "goals"
    assert args.goals_command == "add"
    assert args.period == "daily"
    assert args.next is False
    assert args.current is False
    assert args.text == "Plan tomorrow priorities"

    with pytest.raises(SystemExit):
        parser.parse_args(["session-preview", "-n", "2"])
    with pytest.raises(SystemExit):
        parser.parse_args(["session", "skip", "--state", "on"])
    with pytest.raises(SystemExit):
        parser.parse_args(["session", "skip", "--state", "off"])
    with pytest.raises(SystemExit):
        parser.parse_args(["period", "weekly", "--file", "/tmp/test.md"])
    with pytest.raises(SystemExit):
        parser.parse_args(["goals", "add", "--period", "biweekly", "Invalid"])


def test_cli_parser_accepts_global_logging_flags() -> None:
    parser = cli.build_parser()
    args = parser.parse_args(
        [
            "--log-level",
            "DEBUG",
            "--log-format",
            "json",
            "period",
            "all",
        ]
    )
    assert args.log_level == "DEBUG"
    assert args.log_format == "json"
    assert args.domain == "period"
    assert args.period_command == "all"
