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
