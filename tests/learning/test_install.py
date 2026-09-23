from pathlib import Path
import sys

import pytest

from learning import install


@pytest.fixture
def installation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    package = tmp_path / "repo/learning"
    for name in (
        "__main__.py",
        "pi.ts",
        "skills/learn/SKILL.md",
        "skills/learn/scripts/learn",
        "clients/codex/instructions.md",
        "clients/claude/teach/SKILL.md",
    ):
        source = package / name
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text("Learning instructions.\n")
    (package / "skills/learn/scripts/learn").chmod(0o755)
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setattr(install, "__file__", str(package / "install.py"))
    monkeypatch.setattr(install.shutil, "which", lambda _: sys.executable)
    return package, home


@pytest.mark.parametrize("missing", ["pi", "node"])
def test_missing_runtime_cannot_leave_partial_installation(
    installation: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch, missing: str
) -> None:
    _, home = installation
    monkeypatch.setattr(
        install.shutil,
        "which",
        lambda name: None if name == missing else sys.executable,
    )
    with pytest.raises(ValueError, match=f"{missing} must already be installed"):
        install.install()
    assert list(home.iterdir()) == []


def test_invalid_config_is_detected_before_any_other_installation_write(
    installation: tuple[Path, Path],
) -> None:
    _, home = installation
    config = home / ".codex/config.toml"
    config.parent.mkdir()
    original = '# Learning communication\ndeveloper_instructions = "incomplete"\n'
    config.write_text(original)
    with pytest.raises(ValueError, match="incomplete"):
        install.install()
    assert config.read_text() == original
    assert list(home.iterdir()) == [config.parent]
    assert list(config.parent.iterdir()) == [config]


def test_missing_source_prevents_all_installation_changes(
    installation: tuple[Path, Path],
) -> None:
    package, home = installation
    (package / "clients/claude/teach/SKILL.md").unlink()
    with pytest.raises(ValueError, match="installation source"):
        install.install()
    assert list(home.iterdir()) == []


def test_valid_preflight_is_read_only_and_install_preserves_existing_config(
    installation: tuple[Path, Path],
) -> None:
    package, home = installation
    support = home / "Library/Application Support/Learning"
    install.preflight(package, support)
    assert list(home.iterdir()) == []
    config = home / ".codex/config.toml"
    config.parent.mkdir()
    original = 'model = "configured-model"\n'
    config.write_text(original)
    install.install()
    assert config.read_text() == install.codex_block(package) + original
    backups = list((support / "backups").glob("*/codex-config.toml"))
    assert len(backups) == 1
    assert backups[0].read_text() == original
    for host in (".agents", ".claude"):
        assert (home / host / "skills/learn").resolve() == package / "skills/learn"
    assert (home / ".local/bin/study").is_file()
    assert (support / "learn-claude.zip").is_file()


def test_conflicting_destination_fails_preflight_without_mutation(
    installation: tuple[Path, Path],
) -> None:
    _, home = installation
    destination = home / ".agents"
    destination.write_text("An existing file, not a configuration directory.")
    with pytest.raises(ValueError, match="destination is not writable"):
        install.install()
    assert list(home.iterdir()) == [destination]


def test_study_symlink_target_is_never_modified(
    installation: tuple[Path, Path],
) -> None:
    _, home = installation
    target = home / "personal-script"
    target.write_text("Keep this unrelated command.")
    target.chmod(0o600)
    command = home / ".local/bin/study"
    command.parent.mkdir(parents=True)
    command.symlink_to(target)
    install.install()
    assert not command.is_symlink()
    assert target.read_text() == "Keep this unrelated command."
    assert target.stat().st_mode & 0o777 == 0o600


@pytest.mark.parametrize("kind", ["directory", "unwritable"])
def test_invalid_archive_destination_stops_before_other_installation_changes(
    installation: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    _, home = installation
    support = home / "Library/Application Support/Learning"
    support.mkdir(parents=True)
    archive = support / "learn-claude.zip"
    if kind == "directory":
        archive.mkdir()
    else:
        archive.write_text("Existing archive.")
        actual_access = install.os.access
        monkeypatch.setattr(
            install.os,
            "access",
            lambda path, mode: (
                False if Path(path) == archive else actual_access(path, mode)
            ),
        )
    before = {str(path): path.stat().st_mtime_ns for path in home.rglob("*")}
    with pytest.raises(ValueError, match="not a readable, writable file"):
        install.install()
    assert before == {str(path): path.stat().st_mtime_ns for path in home.rglob("*")}
    assert not (home / ".codex").exists()
    assert not (home / ".agents").exists()
    assert not (home / ".local/bin/study").exists()


def test_installed_command_preserves_cwd_for_init_and_workspace_resume(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import json
    import subprocess

    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("STUDY_WORKSPACE", raising=False)
    fake_pi = tmp_path / "pi"
    fake_pi.write_text(
        f"#!{sys.executable}\n"
        "import json, os, sys\n"
        "print(json.dumps({'cwd': os.getcwd(), 'workspace': os.environ['STUDY_WORKSPACE'], 'args': sys.argv[1:]}))\n"
    )
    fake_pi.chmod(0o755)
    monkeypatch.setattr(install.shutil, "which", lambda _: str(fake_pi))
    repo = Path(__file__).resolve().parents[2]
    install.install_command(repo, home / "support")
    command = home / ".local/bin/study"
    course = tmp_path / "course with spaces"
    course.mkdir()
    result = json.loads(
        subprocess.check_output([str(command), "init"], cwd=course, text=True)
    )
    assert result["workspace"] == str(course)
    nested = course / "module"
    nested.mkdir()
    result = json.loads(
        subprocess.check_output([str(command), "--continue"], cwd=nested, text=True)
    )
    assert result["cwd"] == result["workspace"] == str(course)
    args = result["args"]
    assert args[args.index("--session-dir") + 1] == str(course / ".study/conversations")
    assert "--continue" in args
    assert not (repo / ".study").exists()
