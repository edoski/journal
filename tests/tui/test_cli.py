from __future__ import annotations

import argparse
import json
import sqlite3

import tui.cli as cli

FLOW_GET_PHASE = 'tell application "Flow" to getPhase'
FLOW_SKIP = 'tell application "Flow" to skip'
FLOW_START = 'tell application "Flow" to start'
FLOW_SHOW = 'tell application "Flow" to show'


def _skip_args() -> argparse.Namespace:
    return argparse.Namespace()


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


def _enabled_skip_config() -> dict:
    return {"enabled": True, "skip_times": []}


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


def test_skip_now_noops_when_disabled(monkeypatch) -> None:
    monkeypatch.setattr(
        cli, "_load_skip_config", lambda: {"enabled": False, "skip_times": []}
    )

    def _fail_run(_script: str) -> str:
        raise AssertionError(
            "AppleScript should not run when skip automation is disabled"
        )

    monkeypatch.setattr(cli, "_run_applescript", _fail_run)

    def _fail_conn(*_args, **_kwargs):
        raise AssertionError("DB should not be opened when skip automation is disabled")

    monkeypatch.setattr(cli, "get_connection", _fail_conn)

    rc = cli.cmd_skip_now(_skip_args())
    assert rc == 0


def test_skip_now_noops_when_phase_is_not_flow(monkeypatch) -> None:
    monkeypatch.setattr(cli, "_load_skip_config", _enabled_skip_config)
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

    rc = cli.cmd_skip_now(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE]


def test_skip_now_executes_when_phase_flow_and_latest_row_open_flow(
    monkeypatch,
) -> None:
    monkeypatch.setattr(cli, "_load_skip_config", _enabled_skip_config)
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

    rc = cli.cmd_skip_now(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE, FLOW_SKIP, FLOW_START, FLOW_SHOW]


def test_skip_now_noops_when_latest_row_is_completed_flow(monkeypatch) -> None:
    monkeypatch.setattr(cli, "_load_skip_config", _enabled_skip_config)
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

    rc = cli.cmd_skip_now(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE]


def test_skip_now_noops_when_latest_row_is_open_break(monkeypatch) -> None:
    monkeypatch.setattr(cli, "_load_skip_config", _enabled_skip_config)
    conn = _make_session_conn()
    _insert_session_row(conn, phase="shortBreak", completed_at=None)
    monkeypatch.setattr(cli, "get_connection", lambda readonly=True: conn)
    calls: list[str] = []

    def _fake_run(script: str) -> str:
        calls.append(script)
        if script == FLOW_GET_PHASE:
            return "Flow"
        return "ok"

    monkeypatch.setattr(cli, "_run_applescript", _fake_run)

    rc = cli.cmd_skip_now(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE]


def test_skip_now_noops_on_db_error(monkeypatch) -> None:
    monkeypatch.setattr(cli, "_load_skip_config", _enabled_skip_config)
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

    rc = cli.cmd_skip_now(_skip_args())
    assert rc == 0
    assert calls == [FLOW_GET_PHASE]


def test_cli_skip_toggle_writes_config(tmp_path, monkeypatch):
    config_path = tmp_path / "skip_schedule.json"
    monkeypatch.setattr(cli, "SKIP_CONFIG_PATH", config_path)

    rc = cli.main(["skip-toggle", "on"])
    assert rc == 0
    data = json.loads(config_path.read_text(encoding="utf-8"))
    assert data["enabled"] is True


def test_cli_parser_has_expected_commands():
    parser = cli.build_parser()
    args = parser.parse_args(["session-preview", "-n", "2"])
    assert args.command == "session-preview"
    assert args.count == 2


def test_cli_parser_accepts_global_logging_flags():
    parser = cli.build_parser()
    args = parser.parse_args(
        ["--log-level", "DEBUG", "--log-format", "json", "session-preview", "-n", "2"]
    )
    assert args.log_level == "DEBUG"
    assert args.log_format == "json"
    assert args.command == "session-preview"


def test_cap_log_file_truncates_large_file(tmp_path):
    log_path = tmp_path / "flow-skip.log"
    log_path.write_text("a" * 1024, encoding="utf-8")

    cli._cap_log_file(log_path, 128)

    assert log_path.stat().st_size <= 128
