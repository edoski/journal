"""Install the learning MCP server, the `tutor` skill and the `study` command.

Hosts:

- Claude Desktop: ``mcpServers.learning`` merged into
  ``~/Library/Application Support/Claude/claude_desktop_config.json``; the skill
  is uploaded by hand from ``tutor-claude.zip``.
- Claude Code: ``claude mcp add --scope user``. The CLI owns ``~/.claude.json``,
  which running Claude Code sessions rewrite at any moment, so this installer
  never edits that file itself; without the CLI, Claude Code is skipped.
- Codex: a marked ``[mcp_servers.learning]`` table in ``~/.codex/config.toml``,
  replacing the old developer-instructions block.

Every changed file is backed up first. ``preflight`` validates everything
without writing, so a failure leaves no partial installation.
"""

from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
from typing import Any
import zipfile

from learning import storage
from learning.workspace import support_directory

SERVER = "learning"
CODEX_START = "# Begin learning MCP server\n"
CODEX_END = "# End learning MCP server\n"
_OLD_CODEX = re.compile(
    r"# Learning communication\n.*?# End learning communication\n", re.DOTALL
)
_SOURCES = ("__main__.py", "mcp.py", "skills/tutor/SKILL.md")


# --- locations ----------------------------------------------------------------


def package_directory() -> Path:
    return Path(__file__).resolve().parent


def interpreter(repo: Path) -> Path:
    """The repository's virtual-environment Python that runs the server."""
    return repo / ".venv/bin/python"


def server(repo: Path) -> dict[str, Any]:
    """The stdio MCP server entry every host runs."""
    return {
        "command": str(interpreter(repo)),
        "args": ["-m", "learning.mcp"],
        "env": {"PYTHONPATH": str(repo)},
    }


def desktop_config() -> Path:
    return Path.home() / "Library/Application Support/Claude/claude_desktop_config.json"


def code_config() -> Path:
    return Path.home() / ".claude.json"


def codex_config() -> Path:
    return Path.home() / ".codex/config.toml"


def skill_links() -> dict[str, Path]:
    return {
        "claude-code": Path.home() / ".claude/skills/tutor",
        "codex": Path.home() / ".agents/skills/tutor",
    }


def command_path() -> Path:
    return Path.home() / ".local/bin/study"


def archive_path(support: Path) -> Path:
    return support / "tutor-claude.zip"


# --- pure content ---------------------------------------------------------------


def _json_object(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ValueError(f"cannot read {path}: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def desktop_content(original: dict[str, Any], repo: Path) -> dict[str, Any]:
    """Claude Desktop config with the server merged in; other keys are kept."""
    servers = original.get("mcpServers", {})
    if not isinstance(servers, dict):
        raise ValueError(f"{desktop_config()}: mcpServers must be an object")
    return {**original, "mcpServers": {**servers, SERVER: server(repo)}}


def codex_block(repo: Path) -> str:
    entry = server(repo)
    return (
        CODEX_START
        + f"[mcp_servers.{SERVER}]\n"
        + f"command = {json.dumps(entry['command'])}\n"
        + f"args = {json.dumps(entry['args'])}\n\n"
        + f"[mcp_servers.{SERVER}.env]\n"
        + f"PYTHONPATH = {json.dumps(entry['env']['PYTHONPATH'])}\n"
        + CODEX_END
    )


def codex_entry(text: str) -> Any:
    """The parsed ``mcp_servers.learning`` table, or None."""
    import tomllib

    try:
        parsed = tomllib.loads(text)
    except tomllib.TOMLDecodeError as error:
        raise ValueError(f"{codex_config()} is not valid TOML: {error}") from error
    servers = parsed.get("mcp_servers", {})
    return servers.get(SERVER) if isinstance(servers, dict) else None


def codex_content(original: str, repo: Path) -> str:
    """Codex config with the marked server table and without the old block."""
    text = _OLD_CODEX.sub("", original)
    if "# Learning communication" in text or "# End learning communication" in text:
        raise ValueError(
            f"incomplete old learning communication block in {codex_config()}"
        )
    block = codex_block(repo)
    if CODEX_START in text or CODEX_END in text:
        if text.count(CODEX_START) != 1 or text.count(CODEX_END) != 1:
            raise ValueError(
                f"incomplete learning MCP server block in {codex_config()}"
            )
        before, _, tail = text.partition(CODEX_START)
        _, _, after = tail.partition(CODEX_END)
        updated = before + block + after
    else:
        if codex_entry(text) is not None:
            raise ValueError(
                f"{codex_config()} already defines [mcp_servers.{SERVER}] outside the "
                "installer's markers; remove it, then install again"
            )
        separator = (
            ""
            if not text or text.endswith("\n\n")
            else ("\n" if text.endswith("\n") else "\n\n")
        )
        # Tables go last: anything after a table header would belong to it.
        updated = text + separator + block
    if codex_entry(updated) != server(repo):
        raise ValueError(
            f"{codex_config()}: the learning server table would not parse as "
            "expected; check for keys placed after the installer's block"
        )
    return updated


def command_content(repo: Path) -> str:
    return (
        "#!/bin/sh\nexport PYTHONPATH="
        + shlex.quote(str(repo))
        + "\nexec "
        + shlex.quote(str(interpreter(repo)))
        + ' -m learning.study "$@"\n'
    )


def skill_files(package: Path) -> dict[str, bytes]:
    """The skill folder as archive members under ``tutor/``."""
    skill = package / "skills/tutor"
    return {
        f"tutor/{path.relative_to(skill).as_posix()}": path.read_bytes()
        for path in sorted(skill.rglob("*"))
        if path.is_file()
        and not any(
            part.startswith(".") or part == "__pycache__"
            for part in path.relative_to(skill).parts
        )
    }


# --- preflight ------------------------------------------------------------------


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
    """Validate runtime, sources and destinations without writing anything."""
    repo = package.parent
    if sys.version_info < (3, 11):
        raise ValueError("learning installation requires Python 3.11 or newer")
    python = interpreter(repo)
    if not python.is_file() or not os.access(python, os.X_OK):
        raise ValueError(f"the repository virtual environment is missing: {python}")
    for name in _SOURCES:
        path = package / name
        if not path.is_file() or not os.access(path, os.R_OK):
            raise ValueError(
                f"missing or unreadable learning installation source: {path}"
            )
    _file_destination(desktop_config())
    _file_destination(codex_config())
    if not command_path().is_symlink():  # A linked command is replaced, never followed.
        _file_destination(command_path())
    desktop_content(_json_object(desktop_config()), repo)
    config = codex_config()
    codex_content(config.read_text(encoding="utf-8") if config.exists() else "", repo)
    for path in (
        support,
        support / "backups",
        *(link.parent for link in skill_links().values()),
    ):
        _writable_destination(path)
    archive = archive_path(support)
    if archive.is_symlink():
        raise ValueError(
            f"installation archive output must not be a symlink: {archive}"
        )
    _file_destination(archive)


# --- writing ----------------------------------------------------------------------


class Backup:
    """One timestamped backup directory, created on first use."""

    def __init__(self, support: Path) -> None:
        self.directory = support / "backups" / datetime.now().strftime("%Y%m%d-%H%M%S")

    def keep(self, path: Path, name: str) -> None:
        if not path.exists() and not path.is_symlink():
            return
        self.directory.mkdir(parents=True, exist_ok=True)
        if path.is_symlink() or path.is_dir():
            shutil.move(str(path), str(self.directory / name))
        else:
            shutil.copy2(path, self.directory / name)


def _publish(path: Path, content: str, backup: Backup, name: str) -> str:
    current = path.read_text(encoding="utf-8") if path.exists() else None
    if current == content:
        return "unchanged"
    backup.keep(path, name)
    storage.publish_text(path, content)
    return "updated"


def install_desktop(repo: Path, backup: Backup) -> str:
    path = desktop_config()
    content = json.dumps(desktop_content(_json_object(path), repo), indent=2) + "\n"
    if _json_object(path) == json.loads(content):
        return "unchanged"
    return _publish(path, content, backup, "claude_desktop_config.json")


def _code_entry() -> Any:
    try:
        servers = _json_object(code_config()).get("mcpServers", {})
    except ValueError:
        return None
    return servers.get(SERVER) if isinstance(servers, dict) else None


def code_registered(repo: Path) -> bool:
    entry = _code_entry()
    return isinstance(entry, dict) and all(
        entry.get(key) == value for key, value in server(repo).items()
    )


def install_code(repo: Path) -> str:
    claude = shutil.which("claude")
    if claude is None:
        return "skipped: the claude CLI is not on PATH"
    if code_registered(repo):
        return "unchanged"
    if _code_entry() is not None:
        subprocess.run(
            [claude, "mcp", "remove", "--scope", "user", SERVER],
            check=True,
            capture_output=True,
        )
    entry = server(repo)
    subprocess.run(
        [
            claude,
            "mcp",
            "add",
            # The name precedes the options: `-e` is variadic and would swallow it.
            SERVER,
            "--scope",
            "user",
            "-e",
            f"PYTHONPATH={entry['env']['PYTHONPATH']}",
            "--",
            entry["command"],
            *entry["args"],
        ],
        check=True,
        capture_output=True,
    )
    return "updated"


def install_codex(repo: Path, backup: Backup) -> str:
    path = codex_config()
    original = path.read_text(encoding="utf-8") if path.exists() else ""
    return _publish(path, codex_content(original, repo), backup, "codex-config.toml")


def install_links(package: Path, backup: Backup) -> str:
    skill = package / "skills/tutor"
    changed = []
    for host, target in skill_links().items():
        if target.is_symlink() and target.resolve() == skill:
            continue
        backup.keep(target, f"{host}-tutor")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.symlink_to(skill, target_is_directory=True)
        changed.append(host)
    return f"updated: {', '.join(changed)}" if changed else "unchanged"


def install_command(repo: Path, backup: Backup) -> str:
    """The `study` command for init, link and unlink."""
    command = command_path()
    content = command_content(repo)
    if (
        not command.is_symlink()
        and command.is_file()
        and command.read_text() == content
    ):
        return "unchanged"
    backup.keep(command, "study")
    if command.is_symlink():
        command.unlink()
    command.parent.mkdir(parents=True, exist_ok=True)
    command.write_text(content, encoding="utf-8")
    command.chmod(0o755)
    return "updated"


def install_archive(package: Path, support: Path) -> str:
    """``tutor-claude.zip``: the real skill folder, for upload to Claude Desktop."""
    archive = archive_path(support)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
        for name, data in skill_files(package).items():
            output.writestr(name, data)
    return str(archive)


def install() -> dict[str, str]:
    package = package_directory()
    repo = package.parent
    support = support_directory()
    preflight(package, support)
    support.mkdir(parents=True, exist_ok=True)
    backup = Backup(support)
    return {
        "claude-desktop": install_desktop(repo, backup),
        "claude-code": install_code(repo),
        "codex": install_codex(repo, backup),
        "skill_links": install_links(package, backup),
        "study_command": install_command(repo, backup),
        "skill_archive": install_archive(package, support),
        "backups": str(backup.directory) if backup.directory.exists() else "none",
    }


if __name__ == "__main__":
    print(json.dumps(install(), indent=2))
