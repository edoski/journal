import json
from pathlib import Path
import subprocess
from typing import Any

import pytest

from learning import install, preferences, readiness
from learning.workspace import Workspace, initialize


def fake_claude(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
    separator = command.index("--")
    entry = {
        "type": "stdio",
        "command": command[separator + 1],
        "args": command[separator + 2 :],
        "env": dict([command[command.index("-e") + 1].split("=", 1)]),
    }
    install.code_config().write_text(json.dumps({"mcpServers": {"learning": entry}}))
    return subprocess.CompletedProcess(command, 0)


@pytest.fixture
def installed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[Workspace, Path]:
    repo = tmp_path / "repo"
    package = repo / "learning"
    for name in ("__main__.py", "mcp.py", "skills/learn/SKILL.md"):
        (package / name).parent.mkdir(parents=True, exist_ok=True)
        (package / name).write_text("x\n")
    python = install.interpreter(repo)
    python.parent.mkdir(parents=True)
    python.write_text("#!/bin/sh\n")
    python.chmod(0o755)
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setattr(install, "package_directory", lambda: package)
    monkeypatch.setattr(install.shutil, "which", lambda name: f"/bin/{name}")
    monkeypatch.setattr(install.subprocess, "run", fake_claude)
    install.install()
    course = tmp_path / "course"
    course.mkdir()
    return initialize(course), package


def names(result: dict[str, Any]) -> set[str]:
    return {item["name"] for item in result["issues"]}


def test_an_installed_host_is_ready_and_the_check_is_read_only(
    installed: tuple[Workspace, Path], tmp_path: Path
) -> None:
    workspace, package = installed
    before = {str(path): path.stat().st_mtime_ns for path in tmp_path.rglob("*")}
    result = readiness.check(workspace, package=package)
    assert result["ready"] is True and result["issues"] == []
    checks = {row["name"] for row in result["checks"]}  # type: ignore[union-attr]
    assert {
        "claude_desktop_mcp",
        "claude_skill_archive",
        "claude_code_mcp",
        "claude_code_skill",
        "codex_mcp",
        "codex_skill",
        "course_record",
        "registry",
        "mcp_server",
    } <= checks
    assert not {"pi_runtime", "node_runtime", "pi_sessions"} & checks
    assert before == {
        str(path): path.stat().st_mtime_ns for path in tmp_path.rglob("*")
    }


@pytest.mark.parametrize(
    ("host", "breakage", "expected"),
    [
        (
            "claude-desktop",
            lambda p: install.desktop_config().write_text('{"mcpServers": {}}'),
            {"claude_desktop_mcp"},
        ),
        (
            "claude-desktop",
            lambda p: (p / "skills/learn/SKILL.md").write_text("changed\n"),
            {"claude_skill_archive"},
        ),
        (
            "claude-code",
            lambda p: install.code_config().write_text("{}"),
            {"claude_code_mcp"},
        ),
        (
            "claude-code",
            lambda p: install.skill_links()["claude-code"].unlink(),
            {"claude_code_skill"},
        ),
        (
            "codex",
            lambda p: install.codex_config().write_text(
                "# Learning communication\n" + install.codex_config().read_text()
            ),
            {"codex_mcp"},
        ),
        (
            "codex",
            lambda p: install.codex_config().write_text("not = [toml"),
            {"codex_mcp"},
        ),
    ],
)
def test_host_problems_are_reported_for_the_selected_host(
    installed: tuple[Workspace, Path], host: str, breakage: Any, expected: set[str]
) -> None:
    workspace, package = installed
    breakage(package)
    result = readiness.check(workspace, host, package=package)
    assert names(result) == expected
    others = [name for name in readiness.HOSTS if name != host]
    for other in others:
        assert readiness.check(workspace, other, package=package)["issues"] == []


def test_course_registry_and_global_preferences_are_checked(
    installed: tuple[Workspace, Path], tmp_path: Path
) -> None:
    workspace, package = installed
    for contents, message in (
        ('{"schema": 5}', "schema 6"),
        ("{", "invalid JSON"),
        ('{"schema": 6, "focus": "missing"}', 'unknown task "missing"'),
    ):
        workspace.record.write_text(contents)
        result = readiness.check(workspace, "codex", package=package)
        assert result["ready"] is False and names(result) == {"course_record"}
        (issue,) = result["issues"]  # type: ignore[misc]
        assert issue["detail"].startswith("Course record is invalid: ")
        assert message in issue["detail"]
    workspace.record.write_text('{"schema": 6, "title": "Course"}')
    preferences.global_path().write_text('{"schema": 1, "preferences": []}')
    unregistered = Workspace(tmp_path / "elsewhere")
    unregistered.directory.mkdir()
    result = readiness.check(unregistered, "codex", package=package)
    statuses = {item["name"]: item["status"] for item in result["issues"]}  # type: ignore[union-attr]
    assert statuses == {"registry": "warning", "global_preferences": "fail"}


def test_missing_material_and_conflict_copies_are_reported_without_disclosure(
    installed: tuple[Workspace, Path], tmp_path: Path
) -> None:
    workspace, package = installed
    (workspace.root / "course (device's conflicted copy 2026).json").write_text(
        "SENSITIVE LEARNER DATA"
    )
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "other.sync-conflict-20260922.json").write_text("")
    (workspace.root / "external").symlink_to(outside, target_is_directory=True)
    linked = Workspace(workspace.directory, tmp_path / "absent")
    result = readiness.check(linked, "codex", package=package)
    assert names(result) == {"sources_directory", "cloud_conflict"}
    assert "SENSITIVE" not in json.dumps(result)
    assert "other.sync-conflict" not in json.dumps(result)


def test_invalid_host_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="host must be"):
        readiness.check(Workspace(tmp_path), host="pi")
