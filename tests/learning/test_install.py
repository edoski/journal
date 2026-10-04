import json
import os
from pathlib import Path
import subprocess
import tomllib
from typing import Any
import zipfile

import pytest

from learning import install
from learning.workspace import support_directory

SKILL = {"SKILL.md": "Learn.\n", "references/records.md": "Records.\n"}


class FakeClaude:
    """Records `claude mcp` calls and writes ~/.claude.json the way the CLI does."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def __call__(
        self, command: list[str], **kwargs: Any
    ) -> subprocess.CompletedProcess[str]:
        assert kwargs["check"] is True
        self.calls.append(command[1:])
        path = install.code_config()
        data = json.loads(path.read_text()) if path.exists() else {}
        servers = data.setdefault("mcpServers", {})
        if command[2] == "remove":
            del servers[command[-1]]
        else:
            separator = command.index("--")
            env = dict([command[command.index("-e") + 1].split("=", 1)])
            servers[command[separator - 1]] = {
                "type": "stdio",
                "command": command[separator + 1],
                "args": command[separator + 2 :],
                "env": env,
            }
        path.write_text(json.dumps(data))
        return subprocess.CompletedProcess(command, 0)


@pytest.fixture
def installation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[Path, Path, FakeClaude]:
    repo = tmp_path / "repo"
    package = repo / "learning"
    for name in ("__main__.py", "mcp.py"):
        (package / name).parent.mkdir(parents=True, exist_ok=True)
        (package / name).write_text("# module\n")
    for name, text in SKILL.items():
        path = package / "skills/learn" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    python = install.interpreter(repo)
    python.parent.mkdir(parents=True)
    python.write_text("#!/bin/sh\n")
    python.chmod(0o755)
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setattr(install, "package_directory", lambda: package)
    claude = FakeClaude()
    monkeypatch.setattr(install.shutil, "which", lambda name: f"/bin/{name}")
    monkeypatch.setattr(install.subprocess, "run", claude)
    return package, home, claude


def snapshot(home: Path) -> dict[str, int]:
    return {str(path): path.stat().st_mtime_ns for path in home.rglob("*")}


def test_install_configures_every_host_and_is_idempotent(
    installation: tuple[Path, Path, FakeClaude],
) -> None:
    package, home, claude = installation
    repo = package.parent
    entry = install.server(repo)
    assert entry == {
        "command": str(repo / ".venv/bin/python"),
        "args": ["-m", "learning.mcp"],
        "env": {"PYTHONPATH": str(repo)},
    }
    result = install.install()
    assert result["claude-desktop"] == result["claude-code"] == "updated"
    assert result["codex"] == "updated" and result["study_command"] == "updated"
    assert result["skill_links"] == "updated: claude-code, codex"
    desktop = json.loads(install.desktop_config().read_text())
    assert desktop == {"mcpServers": {"learning": entry}}
    assert claude.calls == [
        [
            "mcp",
            "add",
            "--scope",
            "user",
            "-e",
            f"PYTHONPATH={repo}",
            "learning",
            "--",
            entry["command"],
            "-m",
            "learning.mcp",
        ]
    ]
    codex = tomllib.loads(install.codex_config().read_text())
    assert codex == {"mcp_servers": {"learning": entry}}
    for link in install.skill_links().values():
        assert link.resolve() == package / "skills/learn"
    with zipfile.ZipFile(result["skill_archive"]) as archive:
        assert {name: archive.read(name).decode() for name in archive.namelist()} == {
            f"learn/{name}": text for name, text in SKILL.items()
        }
    command = home / ".local/bin/study"
    assert command.read_text() == install.command_content(repo)
    assert os.access(command, os.X_OK)
    assert result["backups"] == "none"
    before = snapshot(home)
    again = install.install()
    assert {key: again[key] for key in ("claude-desktop", "claude-code", "codex")} == {
        "claude-desktop": "unchanged",
        "claude-code": "unchanged",
        "codex": "unchanged",
    }
    assert again["skill_links"] == again["study_command"] == "unchanged"
    assert len(claude.calls) == 1
    archive = Path(result["skill_archive"])
    assert {
        path: stamp for path, stamp in snapshot(home).items() if path != str(archive)
    } == {path: stamp for path, stamp in before.items() if path != str(archive)}


def test_existing_configs_are_merged_and_backed_up(
    installation: tuple[Path, Path, FakeClaude],
) -> None:
    package, _, claude = installation
    desktop = install.desktop_config()
    desktop.parent.mkdir(parents=True)
    original_desktop = {
        "theme": "dark",
        "mcpServers": {"other": {"command": "x"}, "learning": {"command": "old"}},
    }
    desktop.write_text(json.dumps(original_desktop))
    codex = install.codex_config()
    codex.parent.mkdir()
    original_codex = (
        '# Learning communication\ndeveloper_instructions = "Teach quietly."\n'
        '# End learning communication\nmodel = "gpt"\n\n'
        '[mcp_servers.other]\ncommand = "other"\n'
    )
    codex.write_text(original_codex)
    install.code_config().write_text(
        json.dumps({"projects": {}, "mcpServers": {"learning": {"command": "old"}}})
    )
    result = install.install()
    merged = json.loads(desktop.read_text())
    assert merged["theme"] == "dark"
    assert merged["mcpServers"]["other"] == {"command": "x"}
    assert merged["mcpServers"]["learning"] == install.server(package.parent)
    text = codex.read_text()
    assert "developer_instructions" not in text and "Learning communication" not in text
    parsed = tomllib.loads(text)
    assert parsed["model"] == "gpt"
    assert parsed["mcp_servers"]["other"] == {"command": "other"}
    assert parsed["mcp_servers"]["learning"] == install.server(package.parent)
    assert [call[1] for call in claude.calls] == ["remove", "add"]
    assert json.loads(install.code_config().read_text())["projects"] == {}
    backups = Path(result["backups"])
    assert json.loads((backups / "claude_desktop_config.json").read_text()) == (
        original_desktop
    )
    assert (backups / "codex-config.toml").read_text() == original_codex


def test_claude_code_is_skipped_without_its_cli(
    installation: tuple[Path, Path, FakeClaude], monkeypatch: pytest.MonkeyPatch
) -> None:
    _, _, claude = installation
    monkeypatch.setattr(install.shutil, "which", lambda name: None)
    assert install.install()["claude-code"].startswith("skipped")
    assert claude.calls == []
    assert not install.code_config().exists()


@pytest.mark.parametrize(
    ("setup", "message"),
    [
        (lambda p, h: install.interpreter(p.parent).unlink(), "virtual environment"),
        (lambda p, h: (p / "mcp.py").unlink(), "installation source"),
        (
            lambda p, h: (
                install.desktop_config().parent.mkdir(parents=True),
                install.desktop_config().write_text("{"),
            ),
            "cannot read",
        ),
        (
            lambda p, h: (
                install.codex_config().parent.mkdir(),
                install.codex_config().write_text(
                    '[mcp_servers.learning]\ncommand = "x"\n'
                ),
            ),
            "outside the installer's markers",
        ),
        (
            lambda p, h: (
                install.codex_config().parent.mkdir(),
                install.codex_config().write_text("# Learning communication\nx = 1\n"),
            ),
            "incomplete old learning communication block",
        ),
        (lambda p, h: (h / ".agents").write_text("a file"), "not writable"),
    ],
)
def test_preflight_failures_change_nothing(
    installation: tuple[Path, Path, FakeClaude], setup: Any, message: str
) -> None:
    package, home, claude = installation
    setup(package, home)
    before = {path: path.read_bytes() for path in home.rglob("*") if path.is_file()}
    with pytest.raises(ValueError, match=message):
        install.install()
    assert before == {
        path: path.read_bytes() for path in home.rglob("*") if path.is_file()
    }
    assert not support_directory().exists()
    assert claude.calls == []


def test_codex_block_is_appended_after_existing_tables(tmp_path: Path) -> None:
    original = 'model = "gpt"\n[profiles.fast]\nmodel = "mini"'
    updated = install.codex_content(original, tmp_path)
    parsed = tomllib.loads(updated)
    assert parsed["profiles"] == {"fast": {"model": "mini"}}
    assert parsed["mcp_servers"]["learning"] == install.server(tmp_path)
    assert install.codex_content(updated, tmp_path) == updated
    moved = install.codex_content(updated, tmp_path / "moved")
    assert moved.count(install.CODEX_START) == 1
    assert tomllib.loads(moved)["mcp_servers"]["learning"]["command"].startswith(
        str(tmp_path / "moved")
    )


def test_study_symlink_target_is_never_modified(
    installation: tuple[Path, Path, FakeClaude],
) -> None:
    _, home, _ = installation
    target = home / "personal-script"
    target.write_text("Keep this unrelated command.")
    target.chmod(0o600)
    command = home / ".local/bin/study"
    command.parent.mkdir(parents=True)
    command.symlink_to(target)
    result = install.install()
    assert not command.is_symlink()
    assert target.read_text() == "Keep this unrelated command."
    assert target.stat().st_mode & 0o777 == 0o600
    assert (Path(result["backups"]) / "study").is_symlink()


def test_installed_study_command_initializes_and_links(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    repo = Path(__file__).resolve().parents[2]
    if not install.interpreter(repo).exists():
        pytest.skip("the repository virtual environment is not installed")
    install.install_command(repo, install.Backup(tmp_path / "support"))
    command = home / ".local/bin/study"
    course = tmp_path / "course with spaces"
    course.mkdir()
    environment = {**os.environ, "HOME": str(home)}
    result = json.loads(
        subprocess.check_output(
            [str(command), "init"], cwd=course, text=True, env=environment
        )
    )
    assert result["workspace"] == str(course)
    unknown = subprocess.run(
        [str(command), "resume"],
        cwd=course,
        env=environment,
        capture_output=True,
        text=True,
    )
    assert unknown.returncode == 2 and "MCP server" in unknown.stderr
    assert not (repo / ".study").exists()
