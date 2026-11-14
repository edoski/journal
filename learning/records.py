"""The course record: load it, save a patch (returning a receipt), forget items.

Writes run under the record lock on the latest content; two sessions editing the
same field resolve as last writer wins. A save validates the patch before taking
the lock, applies it, settles its arcs (placing new topics and guarding re-cuts),
lets the progress engine schedule reviews, validates the whole record and
publishes it only when something changed; ``check`` runs the same steps and
writes nothing. Pinned knowledge loads in every session, so a save may not
grow it past ``PINNED_BYTES``; the tutor consolidates in the same save instead
of ``resume`` dropping entries later.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from learning import arcs, clock, packing, preferences, progress, schema, storage
from learning.workspace import Workspace

# Half of resume's knowledge budget: every pinned entry loads, with room left for
# the knowledge of the topics in play.
PINNED_BYTES = 1536


def _readable(workspace: Workspace, stored: dict[str, Any] | None) -> dict[str, Any]:
    """The validated stored course; a broken file is an I/O failure, not a bad request.

    A record of another schema is refused before any rule runs, naming the
    command that brings record and engine together.
    """
    if not stored:
        return schema.empty()
    version = stored.get("schema")
    if type(version) is int and version == schema.SCHEMA - 1:
        raise storage.Unreadable(
            f"{workspace.record} has schema {version}; run python -m learning "
            "migrate --all (it keeps a backup) and retry. Nothing was changed"
        )
    if type(version) is int and version > schema.SCHEMA:
        raise storage.Unreadable(
            f"{workspace.record} has schema {version}, and this learning engine "
            f"reads schema {schema.SCHEMA}: update the engine's checkout and restart "
            "the app and every MCP host, or have the newer engine run python -m "
            f"learning migrate --all --to {schema.SCHEMA}. Nothing was changed"
        )
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


def _pinned(record: dict[str, Any]) -> dict[str, Any]:
    return {
        key: item for key, item in record["knowledge"].items() if item.get("pinned")
    }


def _check_pinned(before: dict[str, Any], after: dict[str, Any]) -> None:
    """Refuse a save that grows pinned knowledge past its budget; shrinking passes."""
    pinned = _pinned(after)
    used = packing.size(pinned)
    if used <= PINNED_BYTES or used <= packing.size(_pinned(before)):
        return
    sizes = sorted(
        ((packing.size(item), key) for key, item in pinned.items()), reverse=True
    )
    listed = ", ".join(f"{key} ({size} bytes)" for size, key in sizes)
    raise ValueError(
        f"knowledge: pinned entries would take {used} of {PINNED_BYTES} bytes, and "
        "they load in every session. In this same save, merge overlapping pinned "
        "entries, shorten them, or unpin ones that belong to topics (give them "
        f"topics instead), then retry. Pinned: {listed}"
    )


def _placed(record: dict[str, Any], created: set[str]) -> dict[str, Any] | None:
    """Where each new topic outside a stored ``path.order`` went in the study order."""
    stored = set(record.get("path", {}).get("order", ()))
    if not stored:
        return None
    order = progress.path_order(record)
    placed = {}
    for index, key in enumerate(order):
        if key in created and key in record["topics"] and key not in stored:
            neighbours = {
                "after": order[index - 1] if index else None,
                "before": order[index + 1] if index + 1 < len(order) else None,
            }
            placed[key] = {name: v for name, v in neighbours.items() if v is not None}
    return placed or None


def _reviewed(record: dict[str, Any], keys: list[str]) -> list[str]:
    """The topics whose due review the new answers counted as: the ones the
    engine had due when each was saved (``due_topics``). An answer on a topic
    the plan holds for a later day is practice, not its review."""
    observations = record.get("observations", {})
    topics = (
        topic
        for key in keys
        for topic in observations.get(key, {}).get("due_topics", ())
    )
    return list(dict.fromkeys(topics))


def save(workspace: Workspace, patch: Any, *, check: bool = False) -> dict[str, Any]:
    """Apply one patch and return the receipt (see the v6 spec, section 3).

    With ``check`` the patch runs through every step of a save, and nothing
    is written: the result says it would pass, or the save's refusal raises.
    """
    changes = schema.check_patch(patch)
    global_changes = changes.pop("global_preferences", None)
    if check and global_changes is not None:
        raise ValueError(
            "save --check writes nothing, and global_preferences are written "
            "outside the course; check the course's part without them"
        )
    today = clock.today()
    now = clock.now().isoformat(timespec="microseconds")
    outcome = schema.PatchResult()
    scheduled = progress.Scheduled()
    final: dict[str, Any] = {}
    levels: dict[str, Any] = {}
    known: set[str] = set()
    arcs_placed: dict[str, str] = {}

    def transform(stored: dict[str, Any]) -> dict[str, Any]:
        nonlocal outcome, scheduled, final, levels, known, arcs_placed
        before = _readable(workspace, stored)
        known = set(before["topics"])
        patched, outcome = schema.apply_patch(before, changes, today=today, now=now)
        arcs_placed = arcs.settle(before, patched, changes, outcome, today)
        planned, scheduled = progress.schedule(patched, outcome, today)
        final = schema.validate_record(planned)
        _check_pinned(before, final)
        if final == before:
            return stored
        levels = _levels(before, final)
        return final

    if check:
        stored = storage.load(workspace.record) or {}
        transform({k: v for k, v in stored.items() if k not in storage.METADATA})
        created = set(changes.get("topics") or ()) - known
        return {
            "ok": True,
            "arcs_placed": arcs_placed,
            "placed": _placed(final, created) or {},
        }
    previous = global_preferences() if global_changes is not None else None
    if changes:
        record, changed = storage.update(workspace.record, transform)
    else:
        record, changed = storage.load(workspace.record) or {}, False
        final = _readable(workspace, record)
    if global_changes is not None:
        saved = _global(lambda: preferences.save_global(global_changes))
        changed = saved != previous or changed
    receipt = {
        "revision": record.get("revision", 0),
        "changed": changed,
        "observations": outcome.observations,
        "duplicates": outcome.duplicates,
        "saved": outcome.saved,
        "reviews": scheduled.reviews,
        "reviewed": _reviewed(final, outcome.observations),
        "levels": levels,
        "focus": final.get("focus"),
        "path_current": final.get("path", {}).get("current"),
        "due_count": len(progress.due(final, today)),
        "notes": scheduled.notes,
    }
    if placed := _placed(final, set(changes.get("topics") or ()) - known):
        receipt["placed"] = placed
    if arcs_placed:
        receipt["arcs_placed"] = arcs_placed
    if "knowledge" in changes:
        receipt["pinned"] = {
            "bytes": packing.size(_pinned(final)),
            "budget": PINNED_BYTES,
        }
    return receipt


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

    dropped: list[str] = []

    def transform(stored: dict[str, Any]) -> dict[str, Any]:
        before = _readable(workspace, stored)
        after = schema.remove(before, handles)
        dropped.extend(arc for arc in before["arcs"] if arc not in after["arcs"])
        return after

    record, _ = storage.update(workspace.record, transform)
    removed = list(dict.fromkeys([*handles, *dropped]))
    return {"removed": removed, "revision": record["revision"]}
