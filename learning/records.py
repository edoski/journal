"""The course record: load it, save a patch (returning a receipt), forget items.

Writes run under the record lock on the latest content; two sessions editing the
same field resolve as last writer wins. A save validates the patch before taking
the lock, applies it, lets the progress engine schedule reviews, validates the
whole record and publishes it only when something changed.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from learning import clock, preferences, progress, schema, storage
from learning.workspace import Workspace


def _readable(workspace: Workspace, stored: dict[str, Any] | None) -> dict[str, Any]:
    """The validated stored course; a broken file is an I/O failure, not a bad request."""
    if not stored:
        return schema.empty()
    try:
        return schema.validate_record(stored)
    except ValueError as error:
        raise storage.Unreadable(
            f"{workspace.record} cannot be read as a course: {error}. Nothing was "
            "changed; restore the file or repair that part by hand"
        ) from error


def load(workspace: Workspace) -> dict[str, Any]:
    """The validated course; a missing ``course.json`` is an empty course."""
    return _readable(workspace, storage.load(workspace.record))


def global_preferences() -> dict[str, str]:
    """The per-user preferences; an unreadable file is an I/O failure."""
    return _global(preferences.read_global)


def effective_preferences(record: dict[str, Any]) -> dict[str, str]:
    """Global preferences overridden by the course's own, per dimension."""
    return _global(lambda: preferences.effective(record["preferences"]))


def _global(read: Callable[[], dict[str, str]]) -> dict[str, str]:
    try:
        return read()
    except storage.Unreadable:
        raise
    except ValueError as error:
        raise storage.Unreadable(str(error)) from error


def _levels(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    old = progress.standings(before)
    changed = {}
    for key, standing in progress.standings(after).items():
        previous = old.get(key, {}).get("level", "new")
        if previous != standing["level"]:
            changed[key] = {"from": previous, "to": standing["level"]}
    return changed


def save(workspace: Workspace, patch: Any) -> dict[str, Any]:
    """Apply one patch and return the receipt (see the v6 spec, section 3)."""
    changes = schema.check_patch(patch)
    global_changes = changes.pop("global_preferences", None)
    today = clock.today()
    now = clock.now().isoformat(timespec="microseconds")
    outcome = schema.PatchResult()
    scheduled = progress.Scheduled()
    final: dict[str, Any] = {}
    levels: dict[str, Any] = {}

    def transform(stored: dict[str, Any]) -> dict[str, Any]:
        nonlocal outcome, scheduled, final, levels
        before = _readable(workspace, stored)
        patched, outcome = schema.apply_patch(before, changes, today=today, now=now)
        planned, scheduled = progress.schedule(patched, outcome, today)
        final = schema.validate_record(planned)
        if final == before:
            return stored
        levels = _levels(before, final)
        return final

    previous = global_preferences() if global_changes is not None else None
    if changes:
        record, changed = storage.update(workspace.record, transform)
    else:
        record, changed = storage.load(workspace.record) or {}, False
        final = _readable(workspace, record)
    if global_changes is not None:
        saved = _global(lambda: preferences.save_global(global_changes))
        changed = saved != previous or changed
    return {
        "revision": record.get("revision", 0),
        "changed": changed,
        "observations": outcome.observations,
        "duplicates": outcome.duplicates,
        "reviews": scheduled.reviews,
        "levels": levels,
        "focus": final.get("focus"),
        "path_current": final.get("path", {}).get("current"),
        "due_count": len(progress.due(final, today)),
        "notes": scheduled.notes,
    }


def forget(
    workspace: Workspace, handles: list[str], *, course: bool = False
) -> dict[str, Any]:
    """Remove exact items, or with ``course`` the whole course record."""
    if course:
        if handles:
            raise ValueError(
                "forget --course removes the whole course record; give it no handles"
            )
        with storage.lock(storage.lock_path(workspace.record)):
            existed = workspace.record.is_file()
            workspace.record.unlink(missing_ok=True)
        return {"removed": ["course"] if existed else [], "revision": 0}
    if not handles:
        raise ValueError("forget needs handles, --lesson UUID or --course")

    def transform(stored: dict[str, Any]) -> dict[str, Any]:
        return schema.remove(_readable(workspace, stored), handles)

    record, _ = storage.update(workspace.record, transform)
    return {"removed": list(dict.fromkeys(handles)), "revision": record["revision"]}
