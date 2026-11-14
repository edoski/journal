"""Move course records between schema 6 and 7, on purpose and with a way back.

Only ``python -m learning migrate`` runs this: no load, save, app start or MCP
start does. Each course moves under its record's lock, after its file is
copied byte for byte to ``backups/v<from>-<stamp>/<key>/course.json`` in the
learning support folder, with ``origin.json`` naming where it came from.

Up (6 to 7) changes only ``schema``, since schema 7 only adds optional fields.
Down (7 to 6) strips every arc field and keeps everything else. ``restore``
puts a backup back, after backing up what it replaces; it loses every save
made since that backup, so it is the last resort after ``--to 6``. A schema
number is the record's format, not its content, so the revision moves only
when the downgrade strips content.
"""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
from pathlib import Path
from typing import Any

from learning import clock, preferences, schema, storage
from learning import workspace as workspaces
from learning.workspace import Workspace

# The two schemas this module moves between. A schema bump writes the next
# step; it never re-labels this one.
PREVIOUS, CURRENT = 6, 7
# The fields schema 7 added, all optional: dropping them is a schema 6 record.
_RECORD_ARC_FIELDS = ("arcs", "arc_log")
_NESTED_ARC_FIELDS = {"path": ("arcs",), "exam": ("arcs", "leaves_out")}
_ITEM_ARC_FIELDS = {"topics": "arc", "observations": "checkpoint"}


def backups() -> Path:
    return workspaces.support_directory() / "backups"


def key(workspace: Workspace) -> str:
    """A course's folder name in a backup: its directory's name and the first
    8 hex digits of its path's SHA-1, so two courses in folders of one name
    get two folders."""
    directory = str(workspace.directory.absolute())
    return (
        f"{workspace.directory.name}-{hashlib.sha1(directory.encode()).hexdigest()[:8]}"
    )


def _batch(name: str) -> Path:
    """A backup folder no earlier run used: ``<name>-<stamp>``, with a counter
    when a run in the same second (a rerun after a crash) already took it."""
    base = backups() / f"{name}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    folder, count = base, 1
    while folder.exists():
        count += 1
        folder = base.with_name(f"{base.name}-{count}")
    return folder


def _up(stored: dict[str, Any]) -> dict[str, Any]:
    return {name: CURRENT if name == "schema" else v for name, v in stored.items()}


def _strip(item: Any, names: tuple[str, ...]) -> Any:
    return {k: v for k, v in item.items() if k not in names}


def _down(stored: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name, value in stored.items():
        if name in _RECORD_ARC_FIELDS:
            continue
        if name == "schema":
            value = PREVIOUS
        elif name in _NESTED_ARC_FIELDS:
            value = _strip(value, _NESTED_ARC_FIELDS[name])
            if not value:
                continue
        elif name in _ITEM_ARC_FIELDS:
            field = (_ITEM_ARC_FIELDS[name],)
            value = {k: _strip(item, field) for k, item in value.items()}
        elif (
            name == "preferences"
            and value.get(preferences.QUESTIONS)
            in (preferences.CHOICES[preferences.QUESTIONS])
        ):
            value = _strip(value, (preferences.QUESTIONS,))
        result[name] = value
    content = {
        k: v for k, v in result.items() if k not in ("schema", *storage.METADATA)
    }
    if content != {
        k: v for k, v in stored.items() if k not in ("schema", *storage.METADATA)
    }:
        result["revision"] = stored.get("revision", 0) + 1
        result["updated_at"] = clock.now().isoformat(timespec="seconds")
    return result


def _backup(batch: Path, workspace: Workspace, text: str) -> None:
    folder = batch / key(workspace)
    folder.mkdir(parents=True)
    storage.publish_text(folder / "course.json", text)
    origin = {"record": str(workspace.record.absolute())}
    storage.publish_text(folder / "origin.json", json.dumps(origin) + "\n")


def _move(workspace: Workspace, to: int, batch: Path) -> str:
    """One course to schema ``to``: ``migrated``, ``current`` or ``empty``."""
    path = workspace.record
    with storage.lock(storage.lock_path(path)):
        stored = storage.load(path)
        if stored is None:
            return "empty"
        version = stored.get("schema")
        if version == to:
            return "current"
        if {version, to} != {PREVIOUS, CURRENT}:
            raise ValueError(
                f"{path} has schema {version!r}; this engine moves schema "
                f"{PREVIOUS} to {CURRENT} and back (--to {PREVIOUS})"
            )
        moved = _up(stored) if to == CURRENT else _down(stored)
        schema.validate_record({**moved, "schema": CURRENT})
        _backup(batch, workspace, path.read_text(encoding="utf-8"))
        storage.publish_text(path, storage.encode(moved))
    return "migrated"


def _report(
    courses: list[Workspace], to: int, failed: dict[str, str]
) -> dict[str, Any]:
    batch = _batch(f"v{PREVIOUS if to == CURRENT else CURRENT}")
    moved: dict[str, str] = {}
    for course in courses:
        try:
            moved[str(course.directory)] = _move(course, to, batch)
        except (ValueError, OSError) as error:
            failed[str(course.directory)] = str(error)
    report: dict[str, Any] = {"to": to, "courses": moved}
    if "migrated" in moved.values():
        report["backup"] = str(batch)
    if failed:
        report["failed"] = failed
    return report


def migrate(workspace: Workspace | None, *, to: int | None = None) -> dict[str, Any]:
    """Move one course, or with no workspace every registered course, to
    schema ``to`` (this engine's by default). A course that fails is reported
    and left as it was; the others still move, and a rerun moves only what is
    left."""
    to = CURRENT if to is None else to
    if to not in (PREVIOUS, CURRENT):
        raise ValueError(f"--to takes {CURRENT} or {PREVIOUS}, not {to}")
    if workspace is not None:
        return _report([workspace], to, {})
    failed = {str(path): str(error) for path, error in workspaces.unreadable()}
    return _report(workspaces.registered(), to, failed)


def restore(batch: Path) -> dict[str, Any]:
    """Put every course in a backup folder back where it came from, each after
    a backup of the file it replaces."""
    origins = sorted(batch.glob("*/origin.json"))
    if not origins:
        raise ValueError(
            f"{batch} holds no course backups; give a folder such as "
            f"{backups()}/v{PREVIOUS}-20261120-090000"
        )
    keep = _batch("restore")
    restored: dict[str, str] = {}
    for origin in origins:
        record = Path(json.loads(origin.read_text(encoding="utf-8"))["record"])
        text = (origin.parent / "course.json").read_text(encoding="utf-8")
        with storage.lock(storage.lock_path(record)):
            if record.is_file():
                _backup(
                    keep, Workspace(record.parent.parent), record.read_text("utf-8")
                )
            storage.publish_text(record, text)
        restored[str(record)] = "restored"
    report: dict[str, Any] = {"restored": restored}
    if keep.is_dir():
        report["backup"] = str(keep)
    return report
