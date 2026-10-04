import json
import os
from pathlib import Path
import subprocess
import tomllib
from typing import Any
import zipfile

import pytest

from learning import install
from learning.workspace import Workspace, initialize, support_directory

SKILL = {"SKILL.md": "Learn.\n", "references/records.md": "Records.\n"}
OLD_CODEX = (
    '# Learning communication\ndeveloper_instructions = "Teach quietly."\n'
    '# End learning communication\nmodel = "gpt"\n\n'
    '[mcp_servers.other]\ncommand = "other"\n'
)


class FakeClaude:
    """Records `claude mcp remove` and edits ~/.claude.json the way the CLI does."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def __call__(
        self, command: list[str], **kwargs: Any
    ) -> subprocess.CompletedProcess[str]:
        self.calls.append(command[1:])
        assert command[1:] == ["mcp", "remove", "learning", "-s", "user"]
        path = install.code_config()
        data = json.loads(path.read_text())
        del data["mcpServers"]["learning"]
        path.write_text(json.dumps(data))
        return subprocess.CompletedProcess(command, 0, "", "")


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
        path = package / "skills/tutor" / name
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


@pytest.fixture
def vault(tmp_path: Path) -> tuple[Path, Path, Workspace]:
    """Two study roots and one course with a record under the first."""
    msc, learn = tmp_path / "vault/msc", tmp_path / "vault/learn"
    (msc / "Algebra").mkdir(parents=True)
    learn.mkdir()
    course = initialize(msc / "Algebra")
    course.record.write_text('{"schema": 6}')
    return msc, learn, course


def codex_installed(text: str = OLD_CODEX) -> None:
    install.codex_config().parent.mkdir(exist_ok=True)
    install.codex_config().write_text(text)


def snapshot(home: Path) -> dict[str, int]:
    return {str(path): path.stat().st_mtime_ns for path in home.rglob("*")}


def test_install_offers_the_server_only_in_study_folders(
    installation: tuple[Path, Path, FakeClaude], vault: tuple[Path, Path, Workspace]
) -> None:
    package, home, claude = installation
    msc, learn, course = vault
    repo = package.parent
    entry = install.server(repo)
    assert entry == {
        "command": str(repo / ".venv/bin/python"),
        "args": ["-m", "learning.mcp"],
        "env": {"PYTHONPATH": str(repo)},
    }
    codex_installed()
    install.code_config().write_text(
        json.dumps({"projects": {}, "mcpServers": {"learning": {"command": "old"}}})
    )
    (learn / ".mcp.json").write_text(json.dumps({"mcpServers": {"other": {}}}))
    result = install.install([msc, learn / "."])
    assert result["study_roots"] == "updated"
    assert json.loads(install.settings_path().read_text()) == {
        "schema": 1,
        "study_roots": [str(msc), str(learn)],
    }
    assert result["claude-code"] == {
        "user_scope": "removed",
        str(msc): "updated",
        str(learn): "updated",
    }
    assert claude.calls == [["mcp", "remove", "learning", "-s", "user"]]
    assert json.loads(install.code_config().read_text()) == {
        "projects": {},
        "mcpServers": {},
    }
    assert json.loads((msc / ".mcp.json").read_text()) == {
        "mcpServers": {"learning": entry}
    }
    assert json.loads((learn / ".mcp.json").read_text())["mcpServers"] == {
        "other": {},
        "learning": entry,
    }
    directories = [msc, learn, course.directory]
    assert result["codex"] == {
        **{str(directory): "updated" for directory in directories},
        "trust": "updated",
    }
    user = install.codex_config().read_text()
    parsed = tomllib.loads(user)
    assert "developer_instructions" not in user
    assert parsed["model"] == "gpt"
    assert parsed["mcp_servers"] == {"other": {"command": "other"}}
    assert parsed["projects"] == {
        str(directory): {"trust_level": "trusted"} for directory in directories
    }
    for directory in directories:
        project = tomllib.loads(install.course_codex_config(directory).read_text())
        assert project == {"mcp_servers": {"learning": entry}}
    assert not (course.directory / ".mcp.json").exists()
    desktop = json.loads(install.desktop_config().read_text())
    assert desktop == {"mcpServers": {"learning": entry}}
    for link in install.skill_links().values():
        assert link.resolve() == package / "skills/tutor"
    with zipfile.ZipFile(result["skill_archive"]) as archive:
        assert {name: archive.read(name).decode() for name in archive.namelist()} == {
            f"tutor/{name}": text for name, text in SKILL.items()
        }
    command = home / ".local/bin/study"
    assert command.read_text() == install.command_content(repo)
    assert os.access(command, os.X_OK)
    backups = Path(result["backups"])
    assert (backups / "codex-config.toml").read_text() == OLD_CODEX
    before = snapshot(home), snapshot(msc.parent)
    again = install.install()
    assert again["study_roots"] == "unchanged"
    assert again["claude-code"] == {
        "user_scope": "none",
        str(msc): "unchanged",
        str(learn): "unchanged",
    }
    assert set(again["codex"].values()) == {"unchanged"}
    assert again["claude-desktop"] == again["skill_links"] == "unchanged"
    archive = str(Path(result["skill_archive"]))
    assert {k: v for k, v in snapshot(home).items() if k != archive} == {
        k: v for k, v in before[0].items() if k != archive
    }
    assert snapshot(msc.parent) == before[1]


def test_dropped_roots_lose_the_server_and_their_trust(
    installation: tuple[Path, Path, FakeClaude], vault: tuple[Path, Path, Workspace]
) -> None:
    msc, learn, course = vault
    codex_installed("")
    (learn / ".mcp.json").write_text(json.dumps({"mcpServers": {"other": {}}}))
    install.install([msc, learn])
    result = install.install([learn])
    assert result["claude-code"][str(msc)] == "removed"
    assert not (msc / ".mcp.json").exists()
    assert json.loads((learn / ".mcp.json").read_text())["mcpServers"] != {}
    trusted = tomllib.loads(install.codex_config().read_text())["projects"]
    assert set(trusted) == {str(learn), str(course.directory)}
    assert json.loads(install.settings_path().read_text())["study_roots"] == [
        str(learn)
    ]


def test_trust_the_user_already_gave_is_left_alone(
    installation: tuple[Path, Path, FakeClaude], vault: tuple[Path, Path, Workspace]
) -> None:
    msc, _, course = vault
    original = f'[projects."{msc}"]\ntrust_level = "trusted"\nnote = "mine"\n'
    codex_installed(original)
    install.install([msc])
    text = install.codex_config().read_text()
    assert text.startswith(original)
    block = text.partition(install.TRUST_START)[2]
    assert f'"{msc}"' not in block and f'"{course.directory}"' in block
    assert install.configured_trust() == [course.directory]


def test_codex_and_claude_code_absent(
    installation: tuple[Path, Path, FakeClaude],
    vault: tuple[Path, Path, Workspace],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, home, claude = installation
    msc, _, course = vault
    install.code_config().write_text(json.dumps({"mcpServers": {"learning": {}}}))
    monkeypatch.setattr(install.shutil, "which", lambda name: None)
    result = install.install([msc])
    assert result["codex"]["status"].startswith("skipped")
    assert result["claude-code"]["user_scope"].startswith("remains")
    assert not (home / ".codex").exists()
    assert not install.course_codex_config(course.directory).exists()
    assert claude.calls == []
    install.code_config().unlink()
    assert install.install([])["claude-code"] == {
        "user_scope": "none",
        str(msc): "removed",
        "study_roots": "none: pass --study-root DIR to offer the server in Claude Code",
    }


def test_new_courses_configure_codex_and_report_claude_code_reach(
    installation: tuple[Path, Path, FakeClaude], vault: tuple[Path, Path, Workspace]
) -> None:
    msc, _, course = vault
    outside = msc.parent.parent / "elsewhere"
    outside.mkdir()
    lone = initialize(outside)
    assert install.configure_course(lone) == "skipped: Codex is not installed"
    codex_installed("")
    install.install([msc])
    fresh = initialize(msc / "Fresh") if (msc / "Fresh").mkdir() is None else None
    assert fresh is not None
    assert install.configure_course(fresh) == "configured"
    assert install.configure_course(fresh) == "unchanged"
    assert str(fresh.directory) in install.trusted(install.codex_config().read_text())
    assert install.claude_code_reach(fresh) == (
        f"reachable through {msc / '.mcp.json'}"
    )
    assert install.claude_code_reach(lone).startswith("not reachable")
    # Every registered course, inside a study root or not, was configured by install.
    assert install.configure_course(lone) == "unchanged"
    assert set(install.configured_trust()) == {
        msc,
        course.directory,
        fresh.directory,
        lone.directory,
    }
    install.course_codex_config(lone.directory).write_text("not = [toml")
    assert install.configure_course(lone).startswith("failed: ")


@pytest.mark.parametrize(
    ("setup", "message"),
    [
        (lambda p, r: install.interpreter(p.parent).unlink(), "virtual environment"),
        (lambda p, r: (p / "mcp.py").unlink(), "installation source"),
        (
            lambda p, r: (
                install.desktop_config().parent.mkdir(parents=True),
                install.desktop_config().write_text("{"),
            ),
            "cannot read",
        ),
        (lambda p, r: (r / ".mcp.json").write_text("not json"), "cannot read"),
        (lambda p, r: (r / ".mcp.json").write_text("[]"), "JSON object"),
        (
            lambda p, r: codex_installed('[mcp_servers.learning]\ncommand = "x"\n'),
            "for every folder",
        ),
        (
            lambda p, r: codex_installed("# Learning communication\nx = 1\n"),
            "incomplete old learning communication block",
        ),
        (
            lambda p, r: codex_installed(
                f'[projects."{r}"]\ntrust_level = "untrusted"\n'
            ),
            "is not trusted",
        ),
        (
            lambda p, r: (
                codex_installed(""),
                install.course_codex_config(r).parent.mkdir(),
                install.course_codex_config(r).write_text(
                    '[mcp_servers.learning]\ncommand = "x"\n'
                ),
            ),
            "outside the installer's markers",
        ),
        (lambda p, r: (Path.home() / ".agents").write_text("a file"), "not writable"),
    ],
)
def test_preflight_failures_change_nothing(
    installation: tuple[Path, Path, FakeClaude],
    vault: tuple[Path, Path, Workspace],
    setup: Any,
    message: str,
) -> None:
    package, home, claude = installation
    msc = vault[0]
    setup(package, msc)
    files = [*home.rglob("*"), *msc.parent.rglob("*")]
    before = {path: path.read_bytes() for path in files if path.is_file()}
    with pytest.raises(ValueError, match=message):
        install.install([msc])
    files = [*home.rglob("*"), *msc.parent.rglob("*")]
    assert before == {path: path.read_bytes() for path in files if path.is_file()}
    assert not install.settings_path().exists()
    assert not (support_directory() / "backups").exists()
    assert claude.calls == []


def test_command_line_takes_repeatable_study_roots(
    installation: tuple[Path, Path, FakeClaude],
    vault: tuple[Path, Path, Workspace],
    capsys: pytest.CaptureFixture[str],
) -> None:
    msc, learn, _ = vault
    assert install.main(["--study-root", str(msc), "--study-root", str(learn)]) == 0
    assert json.loads(capsys.readouterr().out)["study_roots"] == "updated"
    assert install.study_roots() == [msc, learn]
    assert install.main(["--study-root", str(msc / "missing")]) == 1
    assert "not a directory" in json.loads(capsys.readouterr().err)["error"]
    install.settings_path().write_text('{"schema": 1, "study_roots": ["relative"]}')
    with pytest.raises(ValueError, match="absolute paths"):
        install.study_roots()


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
