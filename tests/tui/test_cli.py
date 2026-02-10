from __future__ import annotations

import json

import tui.cli as cli


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
