import argparse
import os
from pathlib import Path
import subprocess
from typing import Any

import pytest

from learning import runtime
from learning.workspace import initialize, resolve


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


def test_regular_launch_pins_workspace_tools_and_resume(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = initialize(tmp_path)
    monkeypatch.setattr(runtime.shutil, "which", lambda _: "/bin/pi")
    monkeypatch.chdir(tmp_path)
    command: list[str] = []
    monkeypatch.setattr(
        runtime.os, "execv", lambda executable, args: command.extend(args)
    )
    for key in (
        "STUDY_WORKSPACE",
        "LEARNING_PYTHON",
        "LEARNING_PACKAGE",
        "LEARNING_PRIVATE",
        "LEARNING_OPEN",
    ):
        monkeypatch.setenv(key, os.environ.get(key, ""))
    runtime.start_pi(workspace, arguments(resume=True, prompt="- explain it"))
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
    assert command[-2:] == ["--", "- explain it"]
    assert "--continue" in command and "--no-session" not in command
    assert Path.cwd() == workspace.directory
    assert os.environ["STUDY_WORKSPACE"] == str(workspace.directory)
    assert command[command.index("--session-dir") + 1] == str(workspace.conversations)
    assert os.environ["LEARNING_PRIVATE"] == "0"
    assert os.environ["LEARNING_OPEN"] == "1"
    sibling = tmp_path / "other"
    sibling.mkdir()
    other = initialize(sibling)
    monkeypatch.chdir(sibling)
    assert resolve() == workspace  # Native calls retain the session binding.
    assert resolve(sibling) == other


@pytest.mark.parametrize("returncode", [0, 7])
def test_private_launch_uses_only_selected_records_and_disposable_outputs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, returncode: int
) -> None:
    workspace = initialize(tmp_path)
    (workspace.root / "state").mkdir()
    record = workspace.root / "state/course.json"
    record.write_text('{"knowledge":"existing"}')
    preferences = workspace.root / "preferences.json"
    preferences.write_text('{"rules":[]}')
    monkeypatch.setattr(runtime.shutil, "which", lambda _: "/bin/pi")
    before = dict(os.environ)
    temporary: list[Path] = []

    def run(
        command: list[str], *, cwd: Path, env: dict[str, str], check: bool
    ) -> subprocess.CompletedProcess[str]:
        temporary.append(cwd)
        root = cwd / ".study"
        assert cwd != workspace.directory and root.is_dir()
        assert env["STUDY_WORKSPACE"] == str(cwd)
        assert env["LEARNING_PRIVATE"] == "1" and env["LEARNING_OPEN"] == "0"
        assert env["LEARNING_SOURCE_ROOT"] == str(workspace.directory)
        assert "--no-session" in command and "--continue" not in command
        assert command[command.index("--session-dir") + 1] == str(
            root / "conversations"
        )
        assert (root / "state/course.json").read_bytes() == record.read_bytes()
        assert (root / "preferences.json").read_bytes() == preferences.read_bytes()
        (root / "state/course.json").write_text("temporary change")
        (root / "assets/diagram.svg").write_text("temporary")
        return subprocess.CompletedProcess(command, returncode)

    monkeypatch.setattr(runtime.subprocess, "run", run)
    if returncode:
        with pytest.raises(SystemExit) as error:
            runtime.start_pi(workspace, arguments(private=True))
        assert error.value.code == returncode
    else:
        runtime.start_pi(workspace, arguments(private=True))
    assert temporary and not temporary[0].exists()
    assert record.read_text() == '{"knowledge":"existing"}'
    assert preferences.read_text() == '{"rules":[]}'
    assert not workspace.assets.exists() and not workspace.conversations.exists()
    assert dict(os.environ) == before


def test_private_continue_is_rejected_before_creating_outputs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = initialize(tmp_path)
    monkeypatch.setattr(runtime.shutil, "which", lambda _: "/bin/pi")
    with pytest.raises(ValueError, match="Private study starts a new session"):
        runtime.start_pi(workspace, arguments(private=True, resume=True))
    assert not workspace.assets.exists()
