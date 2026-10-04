"""Install the learning MCP server, the `tutor` skill and the `study` command.

The server is offered only in study folders, never in ordinary projects:

- Claude Desktop: ``mcpServers.learning`` merged into
  ``~/Library/Application Support/Claude/claude_desktop_config.json``; the skill
  is uploaded by hand from ``tutor-claude.zip``.
- Claude Code: ``mcpServers.learning`` merged into ``<root>/.mcp.json`` for each
  study root (``--study-root DIR``, remembered in ``install.json``); Claude Code
  finds it from every folder below the root after a one-time approval. Any
  user-scope registration is removed with ``claude mcp remove``.
- Codex: a marked ``[mcp_servers.learning]`` table in ``<dir>/.codex/config.toml``
  for every study root and registered course, and one marked block in
  ``~/.codex/config.toml`` trusting exactly those folders (Codex reads project
  configuration only from trusted project roots). The global server entry and the
  old developer-instructions block are removed.

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
from learning.workspace import Workspace, registered, support_directory

SERVER = "learning"
CODEX_START = "# Begin learning MCP server\n"
CODEX_END = "# End learning MCP server\n"
TRUST_START = "# Begin learning study folders\n"
TRUST_END = "# End learning study folders\n"
_SETTINGS_SCHEMA = 1
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
    """Claude Code's own file; read here, written only by the claude CLI."""
    return Path.home() / ".claude.json"


def project_config(root: Path) -> Path:
    """Claude Code's project server file, found from every folder below root."""
    return root / ".mcp.json"


def course_codex_config(directory: Path) -> Path:
    return directory / ".codex/config.toml"


def settings_path() -> Path:
    return support_directory() / "install.json"


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


def project_content(original: dict[str, Any], repo: Path, path: Path) -> dict[str, Any]:
    """A ``.mcp.json`` with the server merged in; other servers and keys are kept."""
    servers = original.get("mcpServers", {})
    if not isinstance(servers, dict):
        raise ValueError(f"{path}: mcpServers must be an object")
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


def trust_block(directories: list[Path]) -> str:
    if not directories:
        return ""
    tables = "\n".join(
        f'[projects.{json.dumps(str(directory))}]\ntrust_level = "trusted"\n'
        for directory in directories
    )
    return TRUST_START + tables + TRUST_END


def toml(text: str, path: Path) -> dict[str, Any]:
    import tomllib

    try:
        return tomllib.loads(text)
    except tomllib.TOMLDecodeError as error:
        raise ValueError(f"{path} is not valid TOML: {error}") from error


def codex_entry(text: str, path: Path | None = None) -> Any:
    """The parsed ``mcp_servers.learning`` table, or None."""
    servers = toml(text, path or codex_config()).get("mcp_servers", {})
    return servers.get(SERVER) if isinstance(servers, dict) else None


def trusted(text: str, path: Path | None = None) -> set[str]:
    """Project folders the Codex config marks as trusted."""
    projects = toml(text, path or codex_config()).get("projects", {})
    return {
        key
        for key, value in (projects.items() if isinstance(projects, dict) else ())
        if isinstance(value, dict) and value.get("trust_level") == "trusted"
    }


def _without(text: str, start: str, end: str, path: Path) -> str:
    """Text with one marked block removed; trailing blank lines normalized."""
    if start in text or end in text:
        if text.count(start) != 1 or text.count(end) != 1:
            raise ValueError(f"incomplete learning block {start.strip()!r} in {path}")
        before, _, tail = text.partition(start)
        _, _, after = tail.partition(end)
        text = before + after
    return text.rstrip("\n") + "\n" if text.strip() else ""


def _append(text: str, block: str) -> str:
    """Tables go last: anything after a table header would belong to it."""
    if not block:
        return text
    return text + ("\n" if text else "") + block


def codex_global_content(original: str, directories: list[Path]) -> str:
    """The user config without a global server entry, trusting exactly ``directories``.

    Folders the user already trusts outside the marked block are left to them; a
    folder with a different, unmarked trust level is a conflict to resolve first.
    """
    path = codex_config()
    text = _OLD_CODEX.sub("", original)
    if "# Learning communication" in text or "# End learning communication" in text:
        raise ValueError(f"incomplete old learning communication block in {path}")
    text = _without(text, CODEX_START, CODEX_END, path)
    base = _without(text, TRUST_START, TRUST_END, path)
    if codex_entry(base, path) is not None:
        raise ValueError(
            f"{path} defines [mcp_servers.{SERVER}] for every folder; remove it, "
            "then install again (the server belongs only in study folders)"
        )
    projects = toml(base, path).get("projects", {})
    own = []
    for directory in directories:
        existing = projects.get(str(directory)) if isinstance(projects, dict) else None
        if existing is None:
            own.append(directory)
        elif not isinstance(existing, dict) or existing.get("trust_level") != "trusted":
            raise ValueError(
                f'{path}: [projects."{directory}"] is not trusted; set trust_level = '
                '"trusted" there or remove that table, then install again'
            )
    updated = _append(base, trust_block(own))
    missing = {str(directory) for directory in directories} - trusted(updated, path)
    if missing or codex_entry(updated, path) is not None:
        raise ValueError(
            f"{path}: the learning trust block would not parse as expected"
        )
    return updated


def course_codex_content(original: str, repo: Path, path: Path) -> str:
    """A project Codex config with the marked server table; other content kept."""
    base = _without(original, CODEX_START, CODEX_END, path)
    if codex_entry(base, path) is not None:
        raise ValueError(
            f"{path} already defines [mcp_servers.{SERVER}] outside the installer's "
            "markers; remove it, then install again"
        )
    updated = _append(base, codex_block(repo))
    if codex_entry(updated, path) != server(repo):
        raise ValueError(
            f"{path}: the learning server table would not parse as expected; check "
            "for keys placed after the installer's block"
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


def _directory_list(value: Any, path: Path) -> list[Path]:
    if not isinstance(value, list) or not all(
        isinstance(item, str) and Path(item).is_absolute() for item in value
    ):
        raise ValueError(f"{path}: study_roots must be a list of absolute paths")
    return [Path(item) for item in value]


def study_roots() -> list[Path]:
    """The remembered study roots; none until ``--study-root`` is given once."""
    path = settings_path()
    settings = _json_object(path)
    if not settings:
        return []
    if settings.get("schema") != _SETTINGS_SCHEMA or set(settings) != {
        "schema",
        "study_roots",
    }:
        raise ValueError(f'{path} must be {{"schema": 1, "study_roots": [...]}}')
    return _directory_list(settings["study_roots"], path)


def _roots(values: list[str | Path]) -> list[Path]:
    roots = list(dict.fromkeys(Path(value).expanduser().resolve() for value in values))
    for root in roots:
        if not root.is_dir():
            raise ValueError(f"study root is not a directory: {root}")
    return roots


def course_directories(roots: list[Path]) -> list[Path]:
    """Folders Codex is configured for: the study roots and every registered course."""
    courses = [workspace.directory for workspace in registered()]
    return list(dict.fromkeys([*roots, *courses]))


def _course_file(directory: Path) -> Path:
    path = course_codex_config(directory)
    if path.parent.exists() and not path.parent.is_dir():
        raise ValueError(f"{path.parent} exists and is not a directory")
    return path


def preflight(package: Path, support: Path, roots: list[Path]) -> None:
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
    _file_destination(settings_path())
    if not command_path().is_symlink():  # A linked command is replaced, never followed.
        _file_destination(command_path())
    desktop_content(_json_object(desktop_config()), repo)
    for root in roots:
        path = project_config(root)
        _file_destination(path)
        project_content(_json_object(path), repo, path)
    config = codex_config()
    if config.exists():
        _file_destination(config)
        directories = course_directories(roots)
        codex_global_content(config.read_text(encoding="utf-8"), directories)
        for directory in directories:
            path = _course_file(directory)
            _file_destination(path)
            original = path.read_text(encoding="utf-8") if path.exists() else ""
            course_codex_content(original, repo, path)
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


def _backup_name(path: Path) -> str:
    return str(path).strip("/").replace("/", "__")


def _code_entry() -> Any:
    try:
        servers = _json_object(code_config()).get("mcpServers", {})
    except ValueError:
        return None
    return servers.get(SERVER) if isinstance(servers, dict) else None


def user_scope_registered() -> bool:
    """Whether Claude Code still offers the server in every folder."""
    return _code_entry() is not None


def project_registered(root: Path, repo: Path) -> bool:
    try:
        servers = _json_object(project_config(root)).get("mcpServers", {})
    except ValueError:
        return False
    return isinstance(servers, dict) and servers.get(SERVER) == server(repo)


def remove_user_scope() -> str:
    """Drop a user-scope registration through the claude CLI, which owns the file."""
    if not user_scope_registered():
        return "none"
    claude = shutil.which("claude")
    if claude is None:
        return f"remains: the claude CLI is not on PATH; remove {SERVER} from {code_config()}"
    completed = subprocess.run(
        [claude, "mcp", "remove", SERVER, "-s", "user"],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode or user_scope_registered():
        return f"remains: claude mcp remove failed: {completed.stderr.strip()}"
    return "removed"


def install_project(root: Path, repo: Path, backup: Backup) -> str:
    path = project_config(root)
    original = _json_object(path)
    merged = project_content(original, repo, path)
    if original == merged:
        return "unchanged"
    content = json.dumps(merged, indent=2) + "\n"
    return _publish(path, content, backup, _backup_name(path))


def remove_project(root: Path, backup: Backup) -> str:
    """Remove the server from a root that is no longer a study root."""
    path = project_config(root)
    try:
        original = _json_object(path)
    except ValueError:
        return "left: not JSON"
    servers = original.get("mcpServers")
    if not isinstance(servers, dict) or SERVER not in servers:
        return "none"
    backup.keep(path, _backup_name(path))
    rest = {key: value for key, value in servers.items() if key != SERVER}
    remaining = (
        {**original, "mcpServers": rest}
        if rest
        else {key: value for key, value in original.items() if key != "mcpServers"}
    )
    if remaining:
        storage.publish_text(path, json.dumps(remaining, indent=2) + "\n")
    else:
        path.unlink()
    return "removed"


def install_code(
    repo: Path, roots: list[Path], previous: list[Path], backup: Backup
) -> dict[str, str]:
    result = {"user_scope": remove_user_scope()}
    for root in roots:
        result[str(root)] = install_project(root, repo, backup)
    for root in previous:
        if root not in roots and root.is_dir():
            result[str(root)] = remove_project(root, backup)
    if not roots:
        result["study_roots"] = (
            "none: pass --study-root DIR to offer the server in Claude Code"
        )
    return result


def _codex_lock() -> Any:
    return storage.lock(support_directory() / ".codex.lock")


def _course_codex(directory: Path, repo: Path, backup: Backup) -> str:
    path = _course_file(directory)
    original = path.read_text(encoding="utf-8") if path.exists() else ""
    return _publish(
        path, course_codex_content(original, repo, path), backup, _backup_name(path)
    )


def _trust(directories: list[Path], backup: Backup) -> str:
    path = codex_config()
    original = path.read_text(encoding="utf-8")
    updated = codex_global_content(original, directories)
    return _publish(path, updated, backup, "codex-config.toml")


def install_codex(repo: Path, roots: list[Path], backup: Backup) -> dict[str, str]:
    if not codex_config().exists():
        return {
            "status": f"skipped: Codex is not installed ({codex_config()} is missing)"
        }
    directories = course_directories(roots)
    with _codex_lock():
        result = {
            str(directory): _course_codex(directory, repo, backup)
            for directory in directories
        }
        result["trust"] = _trust(directories, backup)
    return result


def configured_trust() -> list[Path]:
    """Folders in the installer's marked trust block."""
    path = codex_config()
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    if TRUST_START not in text:
        return []
    block = text.partition(TRUST_START)[2].partition(TRUST_END)[0]
    return [Path(key) for key in toml(block, path).get("projects", {})]


def configure_course(workspace: Workspace) -> str:
    """Make a new or linked course reachable from Codex started in its folder."""
    if not codex_config().exists():
        return "skipped: Codex is not installed"
    repo = package_directory().parent
    try:
        backup = Backup(support_directory())
        with _codex_lock():
            directories = list(
                dict.fromkeys([*configured_trust(), workspace.directory])
            )
            course = _course_codex(workspace.directory, repo, backup)
            trust = _trust(directories, backup)
    except (OSError, ValueError) as error:
        return f"failed: {error}"
    return "unchanged" if course == trust == "unchanged" else "configured"


def claude_code_reach(workspace: Workspace) -> str:
    """Whether Claude Code started in this course finds a study root's server."""
    try:
        roots = study_roots()
    except ValueError as error:
        return f"unknown: {error}"
    root = next(
        (root for root in roots if workspace.directory.is_relative_to(root)), None
    )
    if root is not None:
        return f"reachable through {project_config(root)}"
    return (
        "not reachable: this course is outside every study root; run "
        "`python -m learning.install --study-root DIR` with a folder above it"
    )


def _save_roots(roots: list[Path]) -> str:
    content = (
        json.dumps(
            {"schema": _SETTINGS_SCHEMA, "study_roots": [str(root) for root in roots]},
            indent=2,
        )
        + "\n"
    )
    path = settings_path()
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return "unchanged"
    storage.publish_text(path, content)
    return "updated"


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


def install(roots: list[str | Path] | None = None) -> dict[str, Any]:
    """Install every host; ``roots`` replaces the remembered study roots."""
    package = package_directory()
    repo = package.parent
    support = support_directory()
    previous = study_roots()
    chosen = previous if roots is None else _roots(roots)
    preflight(package, support, chosen)
    support.mkdir(parents=True, exist_ok=True)
    backup = Backup(support)
    return {
        "study_roots": _save_roots(chosen) if roots is not None else "unchanged",
        "claude-desktop": install_desktop(repo, backup),
        "claude-code": install_code(repo, chosen, previous, backup),
        "codex": install_codex(repo, chosen, backup),
        "skill_links": install_links(package, backup),
        "study_command": install_command(repo, backup),
        "skill_archive": install_archive(package, support),
        "backups": str(backup.directory) if backup.directory.exists() else "none",
    }


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--study-root",
        action="append",
        metavar="DIR",
        help="A folder whose subfolders are study folders (repeatable; replaces "
        "the remembered roots)",
    )
    args = parser.parse_args(argv)
    try:
        result = install(args.study_root)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
