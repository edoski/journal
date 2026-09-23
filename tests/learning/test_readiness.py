import json
from pathlib import Path
from typing import Any

import pytest

from learning import readiness


def setup_host(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[Path, Path, Path]:
    home = tmp_path / "home"
    package = tmp_path / "package"
    vault = tmp_path / "vault"
    home.mkdir()
    vault.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("LEARNING_ASSETS", raising=False)
    monkeypatch.delenv("LEARNING_SESSION_DIR", raising=False)
    skill = package / "skills/learn"
    command = skill / "scripts/learn"
    command.parent.mkdir(parents=True)
    command.write_text("#!/bin/sh\n", encoding="utf-8")
    command.chmod(0o755)
    (skill / "SKILL.md").write_text("Learn.", encoding="utf-8")
    (package / "pi.ts").write_text("// extension", encoding="utf-8")
    instructions = package / "clients/codex/instructions.md"
    instructions.parent.mkdir(parents=True)
    instructions.write_text("Teach quietly.", encoding="utf-8")
    for host in (".agents", ".claude"):
        target = home / host / "skills/learn"
        target.parent.mkdir(parents=True)
        target.symlink_to(skill, target_is_directory=True)
    config = home / ".codex/config.toml"
    config.parent.mkdir()
    config.write_text(
        '# Learning communication\ndeveloper_instructions = "Teach quietly."\n'
        '# End learning communication\nsecret = "DO-NOT-EXPOSE"\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(readiness.shutil, "which", lambda command: f"/bin/{command}")
    return vault / "learn", vault, package


def test_readiness_is_read_only_and_checks_all_integrations(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root, vault, package = setup_host(tmp_path, monkeypatch)
    before = {str(path): path.stat().st_mtime_ns for path in tmp_path.rglob("*")}
    result = readiness.check(root, vault, package)
    assert result["ready"] is True
    assert result["issues"] == []
    assert not root.exists()
    assert before == {
        str(path): path.stat().st_mtime_ns for path in tmp_path.rglob("*")
    }
    assert "DO-NOT-EXPOSE" not in json.dumps(result)
    assert {row["name"] for row in result["limitations"]} == {  # type: ignore[union-attr]
        "local_permissions",
        "cloud_sync",
        "host_access",
        "privacy_scope",
    }


def test_host_selection_reports_only_relevant_integration_failures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root, vault, package = setup_host(tmp_path, monkeypatch)
    (Path.home() / ".codex/config.toml").unlink()
    monkeypatch.setattr(readiness.shutil, "which", lambda command: None)
    result = readiness.check(root, vault, package, "claude")
    assert result["ready"] is True
    assert result["issues"] == []
    pi_result = readiness.check(root, vault, package, "pi")
    assert pi_result["ready"] is False
    assert {item["name"] for item in pi_result["issues"]} == {  # type: ignore[union-attr]
        "pi_runtime",
        "node_runtime",
    }


@pytest.mark.parametrize(
    "contents",
    [
        '# Learning communication\ndeveloper_instructions = "Old."\n# End learning communication\n',
        '# Learning communication\ndeveloper_instructions = "Teach quietly."\n',
        "# End learning communication\n",
    ],
)
def test_codex_drift_or_incomplete_blocks_fail_without_disclosing_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, contents: str
) -> None:
    root, vault, package = setup_host(tmp_path, monkeypatch)
    (Path.home() / ".codex/config.toml").write_text(
        'token = "PRIVATE"\n' + contents, encoding="utf-8"
    )
    result = readiness.check(root, vault, package, "codex")
    assert result["ready"] is False
    assert "PRIVATE" not in json.dumps(result)
    assert "codex_instructions" in json.dumps(result["issues"])


def test_wrong_link_and_unusable_paths_are_reported(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root, vault, package = setup_host(tmp_path, monkeypatch)
    target = Path.home() / ".claude/skills/learn"
    target.unlink()
    target.symlink_to(tmp_path / "missing", target_is_directory=True)
    root.write_text("not a directory", encoding="utf-8")
    result = readiness.check(root, vault / "absent", package, "claude")
    assert result["ready"] is False
    issues: Any = result["issues"]
    assert {item["name"] for item in issues} == {
        "learning_root",
        "learning_assets",
        "vault",
        "claude_skill",
    }


def test_conflict_scan_warns_without_reading_state_or_following_links(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root, vault, package = setup_host(tmp_path, monkeypatch)
    root.mkdir()
    (root / "course (device's conflicted copy 2026).json").write_text(
        "SENSITIVE LEARNER DATA", encoding="utf-8"
    )
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "other.sync-conflict-20260922.json").write_text("", encoding="utf-8")
    (root / "external").symlink_to(outside, target_is_directory=True)
    result = readiness.check(root, vault, package, "pi")
    assert result["ready"] is True
    issues: Any = result["issues"]
    assert len(issues) == 1
    assert issues[0]["name"] == "cloud_conflict"
    assert "SENSITIVE" not in json.dumps(result)
    assert "other.sync-conflict" not in json.dumps(result)


def test_invalid_host_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="host must be"):
        readiness.check(tmp_path, tmp_path, host="unknown")


@pytest.mark.parametrize(
    ("directory", "check_name"),
    [("assets", "learning_assets"), ("conversations", "pi_sessions")],
)
def test_workspace_output_directories_reject_regular_files_without_writes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, directory: str, check_name: str
) -> None:
    root, vault, package = setup_host(tmp_path, monkeypatch)
    root.mkdir()
    output = root / directory
    output.write_text("Keep existing content.")
    result = readiness.check(root, vault, package, "pi")
    assert result["ready"] is False
    issues: Any = result["issues"]
    assert [(row["name"], row["path"]) for row in issues] == [(check_name, str(output))]
    assert output.read_text() == "Keep existing content."


def test_pi_outputs_are_local_to_the_workspace(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root, vault, package = setup_host(tmp_path, monkeypatch)
    result = readiness.check(root, vault, package, "pi")
    checks: Any = result["checks"]
    paths = {row["name"]: row.get("path") for row in checks}
    assert paths["learning_assets"] == str(root / "assets")
    assert paths["pi_sessions"] == str(root / "conversations")
    assert not Path(paths["learning_assets"]).exists()
    assert not Path(paths["pi_sessions"]).exists()
