"""Arcs read against the learner's evidence, and the save step that settles them.

``studied``, ``untaught``, ``held`` and ``current`` are the one definition of
each, for every host. ``settle`` runs in each save after the patch is applied:
it places new topics (P1), logs what changed, and refuses a change that would
re-cut what the learner is in without his words (the guards G0 to G5).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from learning import arc_rules, progress, schema


def studied(record: dict[str, Any]) -> set[str]:
    """Topics with evidence: taught, named by an attempt that stands (in its
    topics or as a wrongly chosen method), or ``path.current``."""
    topics = record["topics"]
    found = {key for key, topic in topics.items() if "introduced" in topic}
    for item in progress.effective(record["observations"]).values():
        found.update(item["topics"], [item["chose"]] if "chose" in item else ())
    if (here := record.get("path", {}).get("current")) is not None:
        found.add(here)
    return found & set(topics)


def untaught(record: dict[str, Any]) -> set[str]:
    """Live topics the engine levels ``new``: never taught, never attempted."""
    excluded = progress.excluded(record)
    return {
        key
        for key, standing in progress.standings(record).items()
        if standing["level"] == "new" and key not in excluded
    }


def current(record: dict[str, Any], here: str | None = None) -> str | None:
    """The arc of the topic the learner is on (``here``, else ``path.current``);
    when that topic is missing, excluded or has no arc, the earliest arc with
    an untaught topic, else the last arc. None without arcs."""
    arcs = arc_rules.order(record)
    if not arcs:
        return None
    topics = record["topics"]
    here = here if here is not None else record.get("path", {}).get("current")
    topic = topics.get(here or "", {})
    if "arc" in topic and "excluded" not in topic:
        return str(topic["arc"])
    waiting = {topics[key].get("arc") for key in untaught(record)}
    return next((arc for arc in arcs if arc in waiting), arcs[-1])


def held(record: dict[str, Any]) -> set[str]:
    """Arcs the learner is in or has studied: only his words re-cut them."""
    topics = record["topics"]
    found = {topics[key]["arc"] for key in studied(record) if "arc" in topics[key]}
    if (arc := current(record)) is not None:
        found.add(arc)
    return found


# --- the save step ----------------------------------------------------------


def _place(before: dict[str, Any], record: dict[str, Any]) -> dict[str, str]:
    """P1: give every topic with no arc the arc nearest the learner that its
    prerequisites and dependents allow, in prerequisite order, so a placed
    topic bounds the ones after it."""
    topics = record["topics"]
    if not record["arcs"]:
        return {}
    unplaced = set(topics) - {key for key, t in topics.items() if "arc" in t}
    if not unplaced:
        return {}
    arcs = arc_rules.order(record)
    moved_on = record.get("path", {}).get("current") in unplaced
    nearest = current(before) if moved_on and before["arcs"] else current(record)
    target = arcs.index(nearest) if nearest in arcs else 0
    placed: dict[str, str] = {}
    for key in progress.path_order(record, everything=True):
        if key not in unplaced:
            continue
        low, high = arc_rules.placement_range(record, key)
        if low > high:
            need = next(
                need
                for need in topics[key].get("needs", ())
                if topics[need].get("arc") == arcs[low]
            )
            dependent = next(
                other
                for other, topic in topics.items()
                if key in topic.get("needs", ()) and topic.get("arc") == arcs[high]
            )
            raise ValueError(
                f'topics.{key}: its prerequisite "{need}" sits in '
                f'"{arc_rules.title(record, arcs[low])}" and "{dependent}" in the '
                f'earlier "{arc_rules.title(record, arcs[high])}" needs it; drop the '
                'need that fails the prerequisite test, or place it with "arc"'
            )
        arc = arcs[min(max(target, low), high)]
        topics[key] = {**topics[key], "arc": arc}
        placed[key] = arc
    return placed


def _guard(
    before: dict[str, Any],
    after: dict[str, Any],
    found: list[dict[str, Any]],
    change: dict[str, Any] | None,
) -> None:
    """G0 to G5: every arc change says why, and a change to what the learner
    is in or has studied quotes his request in ``asked``."""
    if found and change is None:
        raise ValueError(
            f"this save {arc_rules.in_words(found[0])}; say why in "
            '"arc_change": {"reason": "…"}'
        )
    if change is None or "asked" in change:
        return
    known, kept = studied(before), held(before)
    for event in found:
        kind = event["kind"]
        if kind == "moved" and event["topic"] in known:
            raise ValueError(
                f"topics.{event['topic']} has evidence, and a studied topic changes "
                f'arc only when he asks for a re-plan: keep it in "{event["from"]}", '
                "or put his request in arc_change.asked"
            )
        if kind == "moved" and (arcs := {event["from"], event["to"]} & kept):
            raise ValueError(
                f'"{min(arcs)}" is an arc he is in or has studied; only he can ask '
                "to re-cut it, so place new topics instead, or put his request in "
                "arc_change.asked"
            )
        if kind == "removed" and event["arc"] in kept:
            raise ValueError(
                f'arcs.{event["arc"]}: "{arc_rules.title(before, event["arc"])}" is '
                "an arc he is in or has studied; only he can ask to remove it: keep "
                "it, or put his request in arc_change.asked"
            )
        if kind == "renamed" and event["arc"] in kept:
            raise ValueError(
                f'arcs.{event["arc"]}: "{event["from"]}" is an arc he is in or has '
                "studied, and it is renamed only when he asks: keep the title, or "
                "put his request in arc_change.asked"
            )
        if kind == "reordered" and (arcs := arc_rules.reordered(before, after) & kept):
            raise ValueError(
                f'path.arcs: this save moves "{min(arcs)}", an arc he is in or has '
                "studied, past another arc; only he can ask for that re-plan: keep "
                "the order, or put his request in arc_change.asked"
            )
        if kind == "formed" and known:
            raise ValueError(
                "this save forms arcs in a course he has already studied; only he "
                "can ask for that re-plan: put his request, or his approval of "
                "these arcs, in arc_change.asked"
            )


def _scope(record: dict[str, Any], topics: set[str]) -> frozenset[str] | None:
    examined = arc_rules.examined(record)
    return None if examined is None else examined & topics


def settle(
    before: dict[str, Any],
    record: dict[str, Any],
    changes: dict[str, Any],
    outcome: schema.PatchResult,
    today: date,
) -> dict[str, str]:
    """Place new topics, guard, check and log the save's arc changes, and mark the
    exam as moved when topics move into or out of its scope. Changes
    ``record`` in place; returns the arc each new topic was placed in."""
    placed = _place(before, record)
    found = [
        event
        for event in arc_rules.events(before, record)
        if not (event["kind"] == "removed" and event["arc"] in outcome.pruned)
    ]
    change = changes.get("arc_change")
    _guard(before, record, found, change)
    arc_rules.names(before, record)
    arc_rules.check_placed(before, record)
    day = today.isoformat()
    log = [*record.get("arc_log", ()), *arc_rules.removals(outcome.pruned, day)]
    if change is not None:
        log += [{"day": day, **event, **change} for event in found] or [
            {"day": day, "kind": "note", **change}
        ]
    if log:
        record["arc_log"] = log
    old = set(before["topics"])
    if _scope(before, old) != _scope(record, old):
        outcome.exam_moved = True
    return placed
