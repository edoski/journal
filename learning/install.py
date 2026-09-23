"""Maintain local client links and launch artifacts from this repository."""

from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys
import zipfile

_CODEX_START = "# Learning communication\n"
_CODEX_END = "# End learning communication\n"


def codex_block(package: Path) -> str:
    """Return the exact generated, independently checkable instruction block."""
    instruction = (package / "clients/codex/instructions.md").read_text().strip()
    if not instruction:
        raise ValueError("canonical Codex learning instructions are empty")
    return (
        _CODEX_START
        + "developer_instructions = "
        + json.dumps(instruction)
        + "\n"
        + _CODEX_END
    )


def _codex_content(package: Path, original: str) -> str:
    block = codex_block(package)
    if _CODEX_START in original:
        if original.count(_CODEX_START) != 1 or original.count(_CODEX_END) != 1:
            raise ValueError(
                "incomplete or duplicate learning communication block in Codex config"
            )
        before, _, tail = original.partition(_CODEX_START)
        _, separator, after = tail.partition(_CODEX_END)
        if not separator:
            raise ValueError("incomplete learning communication block in Codex config")
        if re.search(r"(?m)^developer_instructions\s*=", before + after):
            raise ValueError(
                "merge existing Codex developer instructions before installing"
            )
        return before + block + after
    if _CODEX_END in original:
        raise ValueError("incomplete learning communication block in Codex config")
    if re.search(r"(?m)^developer_instructions\s*=", original):
        raise ValueError(
            "merge existing Codex developer instructions before installing"
        )
    return block + original


def install_codex_instructions(package: Path, support: Path) -> None:
    target = Path.home() / ".codex/config.toml"
    original = target.read_text(encoding="utf-8") if target.exists() else ""
    updated = _codex_content(package, original)
    if updated != original:
        backup = support / "backups" / datetime.now().strftime("%Y%m%d-%H%M%S")
        backup.mkdir(parents=True, exist_ok=True)
        if target.exists():
            shutil.copy2(target, backup / "codex-config.toml")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(updated, encoding="utf-8")


def install_command(repo: Path, support: Path) -> None:
    """Install the terminal entrypoint without launching a new terminal window."""
    pi = shutil.which("pi")
    if pi is None:
        raise ValueError("Pi must already be installed to build the study command")
    command = Path.home() / ".local/bin/study"
    content = (
        "#!/bin/sh\nexport PATH="
        + shlex.quote(str(Path(pi).parent))
        + ':"$PATH"\nexport PYTHONPATH='
        + shlex.quote(str(repo))
        + "\nexec "
        + shlex.quote(sys.executable)
        + ' -m learning.study "$@"\n'
    )
    old_launchers = [Path.home() / "Applications/Study.app", support / "Study.command"]
    replaced = [path for path in old_launchers if path.exists()]
    if command.is_symlink() or (command.exists() and command.read_text() != content):
        replaced.append(command)
    if replaced:
        backup = support / "backups" / datetime.now().strftime("%Y%m%d-%H%M%S-cli")
        backup.mkdir(parents=True, exist_ok=True)
        for path in replaced:
            shutil.move(str(path), str(backup / path.name))
    command.parent.mkdir(parents=True, exist_ok=True)
    command.write_text(content, encoding="utf-8")
    command.chmod(0o755)


def _writable_destination(path: Path) -> None:
    current = path
    while not current.exists():
        if current.is_symlink():
            raise ValueError(
                f"installation destination contains a broken symlink: {current}"
            )
        current = current.parent
    if not current.is_dir() or not os.access(current, os.W_OK | os.X_OK):
        raise ValueError(f"installation destination is not writable: {current}")


def _file_destination(path: Path) -> None:
    _writable_destination(path.parent)
    if path.is_symlink() and not path.exists():
        raise ValueError(f"installation output is a broken symlink: {path}")
    if path.exists() and (not path.is_file() or not os.access(path, os.R_OK | os.W_OK)):
        raise ValueError(
            f"installation output is not a readable, writable file: {path}"
        )


def preflight(package: Path, support: Path) -> None:
    """Validate runtime, source artifacts and destinations without writing anything."""
    if sys.version_info < (3, 10):
        raise ValueError("learning installation requires Python 3.10 or newer")
    if not Path(sys.executable).is_file() or not os.access(sys.executable, os.X_OK):
        raise ValueError("the active Python interpreter is not executable")
    for executable in ("pi", "node"):
        if shutil.which(executable) is None:
            raise ValueError(
                f"{executable} must already be installed before learning installation"
            )
    for name in (
        "__main__.py",
        "pi.ts",
        "skills/learn/SKILL.md",
        "skills/learn/scripts/learn",
        "clients/codex/instructions.md",
        "clients/claude/teach/SKILL.md",
    ):
        path = package / name
        if not path.is_file() or not os.access(path, os.R_OK):
            raise ValueError(
                f"missing or unreadable learning installation source: {path}"
            )
    launcher = package / "skills/learn/scripts/learn"
    if not os.access(launcher, os.X_OK):
        raise ValueError(f"canonical learning command is not executable: {launcher}")
    config = Path.home() / ".codex/config.toml"
    _file_destination(config)
    original = config.read_text(encoding="utf-8") if config.exists() else ""
    _codex_content(package, original)
    for path in (
        support,
        support / "backups",
        config.parent,
        Path.home() / ".agents/skills",
        Path.home() / ".claude/skills",
        Path.home() / ".local/bin",
    ):
        _writable_destination(path)
    command = Path.home() / ".local/bin/study"
    if not command.is_symlink():
        _file_destination(command)
    archive = support / "learn-claude.zip"
    if archive.is_symlink():
        raise ValueError(
            f"installation archive output must not be a symlink: {archive}"
        )
    _file_destination(archive)


def install() -> None:
    package = Path(__file__).resolve().parent
    repo = package.parent
    support = Path.home() / "Library/Application Support/Learning"
    preflight(package, support)
    support.mkdir(parents=True, exist_ok=True)
    install_codex_instructions(package, support)
    skill = package / "skills/learn"
    for host in (".agents", ".claude"):
        target = Path.home() / host / "skills/learn"
        if target.is_symlink() and target.resolve() == skill:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() or target.is_symlink():
            backup = support / "backups" / datetime.now().strftime("%Y%m%d-%H%M%S")
            backup.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(backup / f"{host[1:]}-learn"))
        target.symlink_to(skill, target_is_directory=True)

    install_command(repo, support)

    # Claude stores uploaded skills remotely; only the stable local locator is uploaded.
    router = package / "clients/claude/teach/SKILL.md"
    with zipfile.ZipFile(
        support / "learn-claude.zip", "w", zipfile.ZIP_DEFLATED
    ) as archive:
        archive.write(router, "teach/SKILL.md")


if __name__ == "__main__":
    install()
