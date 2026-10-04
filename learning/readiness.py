"""Read-only checks for the local learning runtime and host integrations."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
import zipfile

from learning import install, preferences, records
from learning.workspace import Workspace, registered, registry_path, support_directory

HOSTS = ("claude-desktop", "claude-code", "codex")


def _check(
    name: str, status: str, detail: str, path: Path | None = None
) -> dict[str, str]:
    result = {"name": name, "status": status, "detail": detail}
    if path is not None:
        result["path"] = str(path)
    return result


def _directory(name: str, path: Path, *, allow_missing: bool) -> dict[str, str]:
    if path.exists():
        if not path.is_dir():
            return _check(name, "fail", "Path exists but is not a directory.", path)
        usable = os.access(path, os.R_OK | os.W_OK | os.X_OK)
        return _check(
            name,
            "pass" if usable else "fail",
            "Directory is readable, writable and searchable."
            if usable
            else "Directory requires read, write and search permissions.",
            path,
        )
    if path.is_symlink():
        return _check(name, "fail", "Path is a broken symbolic link.", path)
    if not allow_missing:
        return _check(name, "fail", "Directory does not exist.", path)
    parent = path.parent
    while not parent.exists() and parent != parent.parent:
        if parent.is_symlink():
            return _check(name, "fail", "An ancestor is a broken symbolic link.", path)
        parent = parent.parent
    usable = parent.is_dir() and os.access(parent, os.W_OK | os.X_OK)
    return _check(
        name,
        "pass" if usable else "fail",
        "Directory is absent; its existing ancestor permits creation."
        if usable
        else "Directory is absent and its existing ancestor does not permit creation.",
        path,
    )


def _file(name: str, path: Path, *, executable: bool = False) -> dict[str, str]:
    mode = os.R_OK | (os.X_OK if executable else 0)
    usable = path.is_file() and os.access(path, mode)
    return _check(
        name,
        "pass" if usable else "fail",
        "File is available" + (" and executable." if executable else ".")
        if usable
        else "Required file is missing or inaccessible"
        + (" or is not executable." if executable else "."),
        path,
    )


def _link(name: str, target: Path, skill: Path) -> dict[str, str]:
    try:
        canonical = target.is_symlink() and target.resolve() == skill.resolve()
    except (OSError, RuntimeError):
        canonical = False
    return _check(
        name,
        "pass" if canonical else "fail",
        "Skill link points to the canonical package."
        if canonical
        else "Refresh the host skill link with the learning installer.",
        target,
    )


def _desktop(repo: Path) -> dict[str, str]:
    path = install.desktop_config()
    try:
        servers = json.loads(path.read_text(encoding="utf-8")).get("mcpServers", {})
        entry = servers.get(install.SERVER) if isinstance(servers, dict) else None
    except (OSError, ValueError, AttributeError):
        entry = None
    return _server("claude_desktop_mcp", entry == install.server(repo), path)


def _code(repo: Path) -> dict[str, str]:
    return _server(
        "claude_code_mcp", install.code_registered(repo), install.code_config()
    )


def _codex(repo: Path) -> dict[str, str]:
    path = install.codex_config()
    try:
        text = path.read_text(encoding="utf-8")
        matches = install.codex_entry(text) == install.server(repo)
    except (OSError, ValueError):
        return _server("codex_mcp", False, path)
    if "# Learning communication" in text:
        return _check(
            "codex_mcp",
            "fail",
            "The old learning developer-instructions block remains; run the installer.",
            path,
        )
    return _server("codex_mcp", matches, path)


def _server(name: str, matches: bool, path: Path) -> dict[str, str]:
    return _check(
        name,
        "pass" if matches else "fail",
        "The learning MCP server entry matches this repository."
        if matches
        else "The learning MCP server entry is missing or stale; run "
        "`python -m learning.install`.",
        path,
    )


def _archive(package: Path) -> dict[str, str]:
    path = install.archive_path(support_directory())
    try:
        with zipfile.ZipFile(path) as archive:
            packed = {name: archive.read(name) for name in archive.namelist()}
    except (OSError, zipfile.BadZipFile, KeyError):
        packed = None
    current = packed == install.skill_files(package)
    return _check(
        "claude_skill_archive",
        "pass" if current else "warning",
        "tutor-claude.zip matches the skill; upload it in Claude Desktop "
        "(Settings > Capabilities > Skills) after it changes."
        if current
        else "tutor-claude.zip is missing or older than the skill; run the "
        "installer and upload it again in Claude Desktop.",
        path,
    )


def _cloud_conflicts(root: Path) -> list[dict[str, str]]:
    if not root.is_dir():
        return []
    conflicts: list[dict[str, str]] = []
    pattern = re.compile(r"sync-conflict|conflicted[ _-]+copy|conflict[ _-]+copy", re.I)

    def failed(error: OSError) -> None:
        conflicts.append(
            _check(
                "cloud_conflict_scan",
                "warning",
                "Could not inspect all names for cloud conflict copies.",
                Path(error.filename) if error.filename else root,
            )
        )

    for directory, directories, files in os.walk(
        root, onerror=failed, followlinks=False
    ):
        for name in sorted([*directories, *files]):
            if pattern.search(name):
                conflicts.append(
                    _check(
                        "cloud_conflict",
                        "warning",
                        "Possible cloud conflict copy; reconcile before relying on shared state.",
                        Path(directory) / name,
                    )
                )
    return conflicts or [
        _check(
            "cloud_conflicts",
            "pass",
            "No explicitly named cloud conflict copies were found.",
            root,
        )
    ]


def _course(workspace: Workspace) -> dict[str, str]:
    """Whether the course record validates, or is not created yet."""
    path = workspace.record
    if not path.exists() and not path.is_symlink():
        return _check(
            "course_record", "pass", "No course yet; the first save creates it.", path
        )
    try:
        records.load(workspace)
    except (OSError, ValueError) as error:
        return _check(
            "course_record", "fail", f"Course record is invalid: {error}", path
        )
    return _check("course_record", "pass", "Course record is valid.", path)


def _registration(workspace: Workspace) -> dict[str, str]:
    path = registry_path()
    try:
        known = any(item.directory == workspace.directory for item in registered())
    except ValueError as error:
        return _check("registry", "fail", str(error), path)
    return _check(
        "registry",
        "pass" if known else "warning",
        "Workspace is registered for every-course plans and searches."
        if known
        else "Workspace is not registered; run `init` here to include it in "
        "`plan --all` and `search --all`.",
        path,
    )


def _global_preferences() -> dict[str, str]:
    path = preferences.global_path()
    try:
        preferences.read_global()
    except (OSError, ValueError) as error:
        return _check("global_preferences", "fail", str(error), path)
    return _check(
        "global_preferences", "pass", "Global preferences are readable.", path
    )


def check(
    workspace: Workspace, host: str = "all", *, package: Path | None = None
) -> dict[str, object]:
    """Report local readiness without creating files, launching hosts or reading secrets.

    ``ready`` means no failed check; warnings remain actionable in ``issues``.
    It does not establish that a host has loaded the server or the skill.
    """
    if host not in {"all", *HOSTS}:
        raise ValueError(f"host must be all, {', '.join(HOSTS)}")
    package = (package or install.package_directory()).expanduser().absolute()
    repo = package.parent
    root = workspace.root.expanduser().absolute()
    material = workspace.sources.expanduser().absolute()
    skill = package / "skills/tutor"
    links = install.skill_links()
    checks = [
        _directory("learning_root", root, allow_missing=True),
        _directory("sources_directory", material, allow_missing=False),
        _course(workspace),
        _registration(workspace),
        _global_preferences(),
        _file("canonical_skill", skill / "SKILL.md"),
        _file("mcp_server", package / "mcp.py"),
        _file("python_runtime", install.interpreter(repo), executable=True),
        _check(
            "python_version",
            "pass" if sys.version_info >= (3, 11) else "fail",
            "Python 3.11 or newer is required.",
        ),
    ]
    if host in {"all", "claude-desktop"}:
        checks += [_desktop(repo), _archive(package)]
    if host in {"all", "claude-code"}:
        checks += [_code(repo), _link("claude_code_skill", links["claude-code"], skill)]
    if host in {"all", "codex"}:
        checks += [_codex(repo), _link("codex_skill", links["codex"], skill)]
    checks.extend(_cloud_conflicts(root))
    return {
        "ready": all(item["status"] != "fail" for item in checks),
        "host": host,
        "checks": checks,
        "issues": [item for item in checks if item["status"] != "pass"],
        "limitations": [
            {
                "name": "local_permissions",
                "detail": "Permissions are inspected without write probes; future writes can still fail.",
            },
            {
                "name": "cloud_sync",
                "detail": "File locks coordinate this machine only. Filename scans cannot establish cloud sync completion or distributed locking.",
            },
            {
                "name": "host_access",
                "detail": "Local configuration does not establish that a host has restarted, loaded the server, or received the uploaded skill.",
            },
            {
                "name": "privacy_scope",
                "detail": "The course record, study notes and each host's conversation history have separate lifecycles; forgetting a record does not erase host history.",
            },
        ],
    }
