from __future__ import annotations

import argparse
import sqlite3
from datetime import date, datetime, time

import pytest

import sync.study.__main__ as cli
from sync.contracts.schedule import DayScheduleProfile

FLOW_GET_PHASE = 'tell application "Flow" to getPhase'
FLOW_SKIP = 'tell application "Flow" to skip'
FLOW_START = 'tell application "Flow" to start'
FLOW_SHOW = 'tell application "Flow" to show'


def _skip_args(state: str | None = None) -> argparse.Namespace:
    return argparse.Namespace(state=state)


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=time(8, 0),
        study_end=time(18, 0),
        lunch_start=time(13, 30),
        lunch_end=time(14, 30),
        workout_start=time(18, 0),
    )


def _set_schedule_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "_now", lambda: datetime(2026, 2, 16, 10, 0))
    monkeypatch.setattr(cli, "_resolve_day_schedule", lambda _day: _default_schedule())


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


def _print_disabled_output(disabled: bool) -> str:
    value = "true" if disabled else "false"
    return f'{{\n  "{cli.SKIP_LAUNCHD_LABEL}" => {value}\n}}'


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
    _set_schedule_ready(monkeypatch)
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
    _set_schedule_ready(monkeypatch)
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
    _set_schedule_ready(monkeypatch)
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
    _set_schedule_ready(monkeypatch)
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


def test_session_skip_noops_when_schedule_cannot_be_resolved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli, "_skip_enabled_state", lambda: True)
    monkeypatch.setattr(cli, "_now", lambda: datetime(2026, 2, 16, 10, 0))

    def _raise_schedule(_day: date):
        raise ValueError("missing schedule")

    monkeypatch.setattr(cli, "_resolve_day_schedule", _raise_schedule)

    def _fail_run(_script: str) -> str:
        raise AssertionError("AppleScript should not run when schedule is unresolved")

    monkeypatch.setattr(cli, "_run_applescript", _fail_run)

    rc = cli.cmd_session_skip(_skip_args())
    assert rc == 0


def test_session_skip_noops_when_now_outside_schedule_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli, "_skip_enabled_state", lambda: True)
    monkeypatch.setattr(cli, "_now", lambda: datetime(2026, 2, 19, 9, 30))
    monkeypatch.setattr(
        cli,
        "_resolve_day_schedule",
        lambda _day: DayScheduleProfile(
            study_start=time(14, 30),
            study_end=time(18, 0),
            lunch_start=time(13, 30),
            lunch_end=time(14, 30),
            workout_start=time(18, 0),
        ),
    )

    def _fail_run(_script: str) -> str:
        raise AssertionError("AppleScript should not run outside schedule window")

    monkeypatch.setattr(cli, "_run_applescript", _fail_run)

    def _fail_conn(*_args, **_kwargs):
        raise AssertionError("DB should not be opened outside schedule window")

    monkeypatch.setattr(cli, "get_connection", _fail_conn)

    rc = cli.cmd_session_skip(_skip_args())
    assert rc == 0


def test_is_within_study_window_includes_end_minute_bucket() -> None:
    schedule = _default_schedule()

    assert cli._is_within_study_window(datetime(2026, 2, 16, 18, 0, 1), schedule)
    assert not cli._is_within_study_window(datetime(2026, 2, 16, 18, 1, 0), schedule)


def test_session_skip_state_status_prints_state(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        cli,
        "_run_launchctl",
        lambda args: (0, _print_disabled_output(disabled=False), ""),
    )

    rc = cli.cmd_session_skip(_skip_args("status"))

    assert rc == 0
    assert "Skip automation: ENABLED" in capsys.readouterr().out


def test_session_skip_state_toggle_calls_launchctl_disable(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    calls: list[list[str]] = []
    responses = [
        (0, _print_disabled_output(disabled=False), ""),
        (0, "", ""),
        (0, _print_disabled_output(disabled=True), ""),
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


def test_cli_parser_has_expected_commands() -> None:
    parser = cli.build_parser()

    args = parser.parse_args(["session-rename", "Retitle", "--confirm"])
    assert args.command == "session-rename"
    assert args.title == "Retitle"
    assert args.confirm is True

    args = parser.parse_args(["session-undo", "--confirm"])
    assert args.command == "session-undo"
    assert args.confirm is True

    args = parser.parse_args(["session-skip", "--state", "status"])
    assert args.command == "session-skip"
    assert args.state == "status"

    with pytest.raises(SystemExit):
        parser.parse_args(["session-preview", "-n", "2"])
    with pytest.raises(SystemExit):
        parser.parse_args(["session-skip", "--state", "on"])
    with pytest.raises(SystemExit):
        parser.parse_args(["session-skip", "--state", "off"])


def test_cli_parser_accepts_global_logging_flags() -> None:
    parser = cli.build_parser()
    args = parser.parse_args(
        [
            "--log-level",
            "DEBUG",
            "--log-format",
            "json",
            "session-skip",
            "--state",
            "status",
        ]
    )
    assert args.log_level == "DEBUG"
    assert args.log_format == "json"
    assert args.command == "session-skip"


def test_cap_log_file_truncates_large_file(tmp_path) -> None:
    log_path = tmp_path / "com.edo.skip.log"
    log_path.write_text("a" * 1024, encoding="utf-8")

    cli._cap_log_file(log_path, 128)

    assert log_path.stat().st_size <= 128
