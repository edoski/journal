"""Read-only checks for the local learning runtime and host integrations."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import sys


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


def _codex_instructions(package: Path) -> dict[str, str]:
    target = Path.home() / ".codex/config.toml"
    canonical = package / "clients/codex/instructions.md"
    name = "codex_instructions"
    start, end = "# Learning communication", "# End learning communication"
    blocks: list[str] = []
    block: list[str] | None = None
    try:
        expected = "developer_instructions = " + json.dumps(
            canonical.read_text(encoding="utf-8").strip()
        )
        # Only the marked integration is interpreted or retained; never return config.
        with target.open(encoding="utf-8") as config:
            for line in config:
                marker = line.rstrip("\r\n")
                if marker == start:
                    if block is not None:
                        return _check(
                            name,
                            "fail",
                            "Learning instruction markers are malformed.",
                            target,
                        )
                    block = []
                elif marker == end:
                    if block is None:
                        return _check(
                            name,
                            "fail",
                            "Learning instruction markers are malformed.",
                            target,
                        )
                    blocks.append("".join(block).strip())
                    block = None
                elif block is not None:
                    block.append(line)
    except (OSError, UnicodeError):
        return _check(
            name,
            "fail",
            "Canonical instructions or the marked Codex integration are unavailable.",
            target,
        )
    if block is not None or len(blocks) != 1:
        return _check(
            name,
            "fail",
            "Exactly one complete learning instruction block is required.",
            target,
        )
    matches = blocks[0] == expected
    return _check(
        name,
        "pass" if matches else "fail",
        "Copied learning instructions match the canonical package."
        if matches
        else "Copied learning instructions have drifted; refresh the learning installation.",
        target,
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


def check(
    root: Path, vault: Path, package: Path | None = None, host: str = "all"
) -> dict[str, object]:
    """Report local readiness without creating files, launching hosts or reading secrets.

    ``ready`` means no failed check; warnings remain actionable in ``issues``.
    It does not establish remote access, authentication or conflict-free cloud sync.
    """
    if host not in {"all", "pi", "codex", "claude"}:
        raise ValueError("host must be all, pi, codex or claude")
    package = package or Path(__file__).resolve().parent
    root, vault, package = (
        path.expanduser().absolute() for path in (root, vault, package)
    )
    skill = package / "skills/learn"
    checks = [
        _directory("learning_root", root, allow_missing=True),
        _directory("vault", vault, allow_missing=False),
        _file("canonical_skill", skill / "SKILL.md"),
        _file("learning_command", skill / "scripts/learn", executable=True),
        _file("python_runtime", Path(sys.executable), executable=True),
        _check(
            "python_version",
            "pass" if sys.version_info >= (3, 10) else "fail",
            "Python 3.10 or newer is required.",
        ),
    ]
    if host in {"all", "pi"}:
        checks.append(_file("pi_extension", package / "pi.ts"))
        for command in ("pi", "node"):
            executable = shutil.which(command)
            checks.append(
                _check(
                    f"{command}_runtime",
                    "pass" if executable else "fail",
                    f"{command} is available on PATH."
                    if executable
                    else f"Install {command} or make it available on PATH.",
                    Path(executable) if executable else None,
                )
            )
    if host in {"all", "codex"}:
        checks.append(_link("codex_skill", Path.home() / ".agents/skills/learn", skill))
        checks.append(_codex_instructions(package))
    if host in {"all", "claude"}:
        checks.append(
            _link("claude_skill", Path.home() / ".claude/skills/learn", skill)
        )
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
                "detail": "Local files do not establish provider authentication, remote skill upload, host permissions or equivalent tutoring behaviour.",
            },
            {
                "name": "privacy_scope",
                "detail": "Portable records, generated artifacts and provider or native session histories have separate lifecycles; no-save study does not erase host history.",
            },
        ],
    }
