import argparse
import os
from pathlib import Path
import subprocess
from typing import Any

import pytest

from learning import runtime


def arguments(**overrides: Any) -> argparse.Namespace:
    return argparse.Namespace(
        **{
            "prompt": None,
            "resume": False,
            "headless": False,
            "json": False,
            "no_open": False,
            "private": False,
            **overrides,
        }
    )


def test_regular_launch_retains_learning_tools_without_direct_file_editing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "learn"
    assets = tmp_path / "custom-assets"
    sessions = tmp_path / "native-sessions"
    monkeypatch.setenv("LEARNING_ASSETS", str(assets))
    monkeypatch.setenv("LEARNING_SESSION_DIR", str(sessions))
    monkeypatch.setattr(runtime.shutil, "which", lambda _: "/bin/pi")
    monkeypatch.chdir(tmp_path)
    command: list[str] = []

    def execute(executable: str, args: list[str]) -> None:
        assert executable == "/bin/pi"
        command.extend(args)

    monkeypatch.setattr(runtime.os, "execv", execute)
    # The exec path intentionally exports the environment to the replacement process.
    for key in (
        "LEARNING_ROOT",
        "LEARNING_VAULT",
        "VAULT_DIR",
        "LEARNING_PYTHON",
        "LEARNING_PACKAGE",
        "LEARNING_PRIVATE",
        "LEARNING_OPEN",
    ):
        monkeypatch.setenv(key, os.environ.get(key, ""))
    runtime.start_pi(tmp_path, root, arguments(resume=True, prompt="- explain it"))
    tools = command[command.index("--tools") + 1].split(",")
    assert {
        "learning_context",
        "learning_save",
        "learning_manage",
        "web_search",
        "url_context",
        "quiz",
        "correct_lesson",
    } <= set(tools)
    assert not {"edit", "write", "powershell"} & set(tools)
    assert "bash" in tools
    assert command[-2:] == ["--", "- explain it"]
    assert "--continue" in command and "--no-session" not in command
    assert Path.cwd() == root
    assert os.environ["LEARNING_ROOT"] == str(root)
    assert os.environ["LEARNING_ASSETS"] == str(assets)
    assert os.environ["LEARNING_PRIVATE"] == "0"
    assert os.environ["LEARNING_OPEN"] == "1"


@pytest.mark.parametrize("returncode", [0, 7])
def test_private_launch_uses_disposable_records_assets_and_transcript_location(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, returncode: int
) -> None:
    root = tmp_path / "learn"
    (root / "state").mkdir(parents=True)
    record = root / "state" / "course.json"
    record.write_text('{"knowledge":"existing"}', encoding="utf-8")
    preferences = root / "preferences.json"
    preferences.write_text('{"rules":[]}', encoding="utf-8")
    shared_assets = tmp_path / "shared-assets"
    shared_sessions = tmp_path / "shared-native-sessions"
    monkeypatch.setenv("LEARNING_ASSETS", str(shared_assets))
    monkeypatch.setenv("LEARNING_SESSION_DIR", str(shared_sessions))
    monkeypatch.setattr(runtime.shutil, "which", lambda _: "/bin/pi")
    before = dict(os.environ)
    temporary: list[Path] = []

    def run(
        command: list[str], *, cwd: Path, env: dict[str, str], check: bool
    ) -> subprocess.CompletedProcess[str]:
        temporary.append(cwd.parent)
        assert cwd != root and cwd.is_dir()
        assert env["LEARNING_ROOT"] == str(cwd)
        assert env["LEARNING_PRIVATE"] == "1"
        assert env["LEARNING_OPEN"] == "0"
        assert env["VAULT_DIR"] == env["LEARNING_VAULT"] == str(tmp_path)
        assert "--no-session" in command and "--continue" not in command
        assert Path(env["LEARNING_ASSETS"]).is_relative_to(cwd.parent)
        assert Path(env["LEARNING_SESSION_DIR"]).is_relative_to(cwd.parent)
        assert (
            command[command.index("--session-dir") + 1] == env["LEARNING_SESSION_DIR"]
        )
        assert (cwd / "state/course.json").read_bytes() == record.read_bytes()
        assert (cwd / "preferences.json").read_bytes() == preferences.read_bytes()
        (cwd / "state/course.json").write_text("temporary change", encoding="utf-8")
        (Path(env["LEARNING_ASSETS"]) / "diagram.svg").write_text(
            "temporary", encoding="utf-8"
        )
        return subprocess.CompletedProcess(command, returncode)

    monkeypatch.setattr(runtime.subprocess, "run", run)
    if returncode:
        with pytest.raises(SystemExit) as error:
            runtime.start_pi(tmp_path, root, arguments(private=True))
        assert error.value.code == returncode
    else:
        runtime.start_pi(tmp_path, root, arguments(private=True))
    assert temporary and not temporary[0].exists()
    assert record.read_text(encoding="utf-8") == '{"knowledge":"existing"}'
    assert preferences.read_text(encoding="utf-8") == '{"rules":[]}'
    assert not shared_assets.exists() and not shared_sessions.exists()
    assert dict(os.environ) == before


def test_private_continue_is_rejected_before_creating_shared_paths(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runtime.shutil, "which", lambda _: "/bin/pi")
    root = tmp_path / "absent"
    with pytest.raises(ValueError, match="Private study starts a new session"):
        runtime.start_pi(tmp_path, root, arguments(private=True, resume=True))
    assert not root.exists()
