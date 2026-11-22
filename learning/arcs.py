"""Arcs read against the learner's evidence, and the save step that settles them.

``studied``, ``untaught``, ``held``, ``current`` and ``standing`` are the one
definition of each, for every host, derived on every read and never stored.
``settle`` runs in each save after the patch is applied: it places new topics
(P1), logs what changed and the new units it placed, and refuses a change
that would re-cut what the learner is in without his words (the guards G0 to
G5).

Only the app sees its open lessons, so the readers take them: ``here``, the
topic of the lesson in progress, and ``lessons``, every open lesson's topics.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Collection
from datetime import date
import re
from typing import Any, TypedDict

from learning import arc_rules, preferences, progress, schema


def studied(record: dict[str, Any], lessons: Collection[str] = ()) -> set[str]:
    """Topics with evidence: taught, named by an attempt that stands (in its
    topics or as a wrongly chosen method), ``path.current``, or a topic of a
    lesson still open."""
    topics = record["topics"]
    found = {key for key, topic in topics.items() if "introduced" in topic}
    found.update(lessons)
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
    an untaught topic, else the last arc with a live topic, so it is never
    an arc drawn nowhere. None without arcs."""
    arcs = arc_rules.order(record)
    if not arcs:
        return None
    topics = record["topics"]
    here = here if here is not None else record.get("path", {}).get("current")
    topic = topics.get(here or "", {})
    if "arc" in topic and "excluded" not in topic:
        return str(topic["arc"])
    waiting = {topics[key].get("arc") for key in untaught(record)}
    live = arc_rules.live(record)
    return next((arc for arc in arcs if arc in waiting), (live or arcs)[-1])


def held(
    record: dict[str, Any], here: str | None = None, lessons: Collection[str] = ()
) -> set[str]:
    """Arcs the learner is in or has studied: only his words re-cut them."""
    topics = record["topics"]
    found = {
        topics[key]["arc"] for key in studied(record, lessons) if "arc" in topics[key]
    }
    if (arc := current(record, here)) is not None:
        found.add(arc)
    return found


# --- standing ---------------------------------------------------------------


class Standing(TypedDict):
    """Where the learner stands in one arc. ``state`` is ``new``,
    ``learning``, ``ready``, ``checked`` or ``taught`` (``_state``);
    ``hidden`` when every topic is excluded; ``entry`` the earlier topics
    its live topics need, lapsed ones first, then in path order."""

    state: str
    current: bool
    hidden: bool
    entry: list[str]


def _checked(
    record: dict[str, Any], replayed: dict[str, progress.Replay]
) -> dict[str, set[str]]:
    """Per arc, the topics whose latest check item that stands is ``solid``
    on a day that was not the topic's learning day."""
    observations = record["observations"]
    place = progress.positions(observations)
    latest: dict[tuple[str, str], tuple[tuple[str, int, int], dict[str, Any]]] = {}
    for key, item in progress.effective(observations).items():
        if "checkpoint" not in item or not schema.counts(item):
            continue
        rank = (item["date"], place[key], schema.number(key))
        for topic in item["topics"]:
            found = latest.get((item["checkpoint"], topic))
            if found is None or found[0] < rank:
                latest[item["checkpoint"], topic] = (rank, item)
    checked: dict[str, set[str]] = defaultdict(set)
    for (arc, topic), (_, item) in latest.items():
        day = replayed[topic].days.get(item["date"])
        if progress.grade(item) == "solid" and day != progress.LEARNING:
            checked[arc].add(topic)
    return checked


def _state(
    record: dict[str, Any],
    keys: list[str],
    levels: dict[str, dict[str, Any]],
    checked: set[str],
) -> str:
    """``new`` while every topic is; in a course that takes no questions,
    ``taught`` once every topic is; else ``ready`` when every topic rests on
    an unaided answer, ``checked`` when it is also ready and every topic's
    check stands, and ``learning`` otherwise. A check never counts ahead of
    the topics' own standing (the engine owner's ruling, 14 Nov 2026), so a
    solid check on a practice day leaves an arc of assisted topics
    learning, and the states only climb."""
    found = [levels[key]["level"] for key in keys]
    if all(level == "new" for level in found):
        return "new"
    if record["preferences"].get(preferences.QUESTIONS) == "none":
        taught = all("introduced" in record["topics"][key] for key in keys)
        return "taught" if taught else "learning"
    if all(level in progress.SECURE for level in found):
        return "checked" if set(keys) <= checked else "ready"
    return "learning"


def live_topics(record: dict[str, Any], arc: str, order: list[str]) -> list[str]:
    """The arc's topics that are not excluded, in path order (``order``)."""
    topics = record["topics"]
    return [key for key in order if topics[key].get("arc") == arc]


def standing(
    record: dict[str, Any],
    levels: dict[str, dict[str, Any]],
    here: str | None = None,
) -> dict[str, Standing]:
    """Every arc's standing, in study order; empty without arcs. ``levels``
    are the topics' standings (``progress.standings``)."""
    if not record["arcs"]:
        return {}
    order = progress.path_order(record)
    rank = {key: index for index, key in enumerate(order)}
    checked = _checked(record, progress.replays(record))
    now = current(record, here)
    result: dict[str, Standing] = {}
    for arc in arc_rules.order(record):
        keys = live_topics(record, arc, order)
        inside = set(keys)
        entry = {
            need
            for key in keys
            for need in progress.needs(record, key)
            if need not in inside
        }
        result[arc] = {
            "state": _state(record, keys, levels, checked[arc]),
            "current": arc == now,
            "hidden": not keys,
            "entry": sorted(
                entry, key=lambda need: ("lapsed" not in levels[need], rank[need])
            ),
        }
    return result


def map_block(
    record: dict[str, Any],
    levels: dict[str, dict[str, Any]],
    here: str | None = None,
) -> list[dict[str, Any]]:
    """The arcs as a map draws them, in study order: title and standing. The
    question and purpose are for agents, so they stay out."""
    return [
        {"arc": arc, "title": arc_rules.title(record, arc), **found}
        for arc, found in standing(record, levels, here).items()
    ]


def pairs(record: dict[str, Any], arc: str, keys: list[str]) -> list[list[str]]:
    """Competing methods an arc's check asks to choose between: each pair
    with a topic of the arc and a partner in it or in an earlier arc."""
    topics, partners = record["topics"], progress.contrasts(record)
    index = {name: at for at, name in enumerate(arc_rules.order(record))}
    seen: set[frozenset[str]] = set()
    found: list[list[str]] = []
    for key in keys:
        for other in partners[key]:
            where = index.get(topics[other].get("arc", ""))
            pair = frozenset((key, other))
            if where is None or where > index[arc] or pair in seen:
                continue
            seen.add(pair)
            found.append([key, other])
    return found


def notes(record: dict[str, Any]) -> list[dict[str, Any]]:
    """The arc notes since the arcs were formed or last re-planned at his
    request: refused edges and conflicts with the material."""
    log = record.get("arc_log", [])
    since = max(
        (
            at
            for at, event in enumerate(log)
            if event["kind"] == "formed"
            or ("asked" in event and event["kind"] != "note")
        ),
        default=-1,
    )
    return [
        {"day": event["day"], "reason": event["reason"]}
        for event in log[since + 1 :]
        if event["kind"] == "note"
    ]


def _pieces(keys: list[str], links: dict[str, list[str]]) -> list[list[str]]:
    """The separate pieces of ``keys`` joined by needs either way, each in
    the order ``keys`` gives."""
    inside = set(keys)
    joined: dict[str, set[str]] = {key: set() for key in keys}
    for key in keys:
        for need in links[key]:
            if need in inside:
                joined[key].add(need)
                joined[need].add(key)
    found: list[list[str]] = []
    seen: set[str] = set()
    for key in keys:
        if key in seen:
            continue
        piece, pending = {key}, [key]
        while pending:
            for other in joined[pending.pop()] - piece:
                piece.add(other)
                pending.append(other)
        seen |= piece
        found.append([other for other in keys if other in piece])
    return found


def _out_of_place(record: dict[str, Any], order: list[str]) -> list[str]:
    """Topics an order puts after a topic of a later arc."""
    topics = record["topics"]
    index = {arc: at for at, arc in enumerate(arc_rules.order(record))}
    furthest, found = -1, []
    for key in order:
        at = index[topics[key]["arc"]]
        if at < furthest:
            found.append(key)
        furthest = max(furthest, at)
    return found


def report(record: dict[str, Any], held_arcs: Collection[str]) -> dict[str, Any]:
    """The rubric's computable checks (Part A), for evaluators and the arc
    pass. Structure reads every topic and every stored need, excluded ones
    included, as the needs rule does; ``entry`` is the structural entry, every
    stored need from another arc in path order, not the standing's."""
    topics = record["topics"]
    arcs = arc_rules.order(record)
    index = {arc: at for at, arc in enumerate(arcs)}
    every = progress.path_order(record, everything=True)
    links = {key: list(topics[key].get("needs", ())) for key in topics}
    edges = [(need, key) for key in every for need in links[key]]
    split = {
        frozenset((key, other))
        for key, topic in topics.items()
        for other in topic.get("contrasts", ())
        if topics[other].get("arc") != topic.get("arc")
    }
    examined = arc_rules.examined(record)
    left = set(record.get("exam", {}).get("leaves_out", ()))
    live = set(progress.path_order(record))
    per_arc, scope = [], []
    for arc in arcs:
        keys = [key for key in every if topics[key].get("arc") == arc]
        inside = set(keys)
        entry = sorted(
            {need for key in keys for need in links[key] if need not in inside},
            key=every.index,
        )
        per_arc.append(
            {
                "arc": arc,
                "topics": len(keys),
                "pieces": _pieces(keys, links),
                "roots": [k for k in keys if not inside.intersection(links[k])],
                "entry": entry,
                "entry_arcs": sorted(
                    {topics[need]["arc"] for need in entry}, key=index.__getitem__
                ),
            }
        )
        if examined is not None:
            named = [key for key in keys if key in examined]
            outside = [key for key in keys if key in live and key not in examined]
            if named and outside:
                scope.append(
                    {
                        "arc": arc,
                        "examined": named,
                        "not_examined": outside,
                        "leaves_out": set(outside) <= left,
                        "held": arc in held_arcs,
                    }
                )
    arc_of = {key: index[topics[key]["arc"]] for key in every}
    return {
        "partition": {
            "unplaced": [key for key in every if "arc" not in topics[key]],
            "empty": [arc for arc in arcs if not arc_rules.members(record, arc)],
        },
        "backward": [
            {"topic": key, "needs": need}
            for need, key in edges
            if arc_of[need] > arc_of[key]
        ],
        "path": {
            "stored": _out_of_place(
                record,
                [k for k in record.get("path", {}).get("order", []) if k in topics],
            ),
            "derived": _out_of_place(record, every),
        },
        "arcs": per_arc,
        "long_skips": [
            {"topic": key, "needs": need, "arcs": arc_of[key] - arc_of[need]}
            for need, key in edges
            if arc_of[key] - arc_of[need] >= 2
        ],
        "split_contrasts": [
            sorted(pair, key=every.index)
            for pair in sorted(split, key=lambda pair: sorted(map(every.index, pair)))
        ],
        "sizes": {
            "arcs": len(arcs),
            "live": len(arc_rules.live(record)),
            "one_topic": [
                arc for arc in arcs if len(arc_rules.members(record, arc)) == 1
            ],
        },
        "scope": scope,
    }


# --- the save step ----------------------------------------------------------


_UNIT = re.compile(
    r"\s*(chapter|ch\.|chap\.|section|sect?\.|§|part|unit|module|lecture|week"
    r"|sheet|worksheet|lab)(?![a-z])\s*(\d+|[a-z]\b)",
    re.IGNORECASE,
)
_UNIT_WORDS = {
    "ch.": "chapter",
    "chap.": "chapter",
    "sec.": "section",
    "sect.": "section",
    "§": "section",
}

Section = tuple[str, str, str]


def _section(topic: dict[str, Any]) -> Section | None:
    """The source and leading unit its first ref with one names: "Section 4.3"
    and "§4.1" are section 4, "Module 02" is module 2. Pages, slides, lines
    and exercises name no section."""
    for ref in topic.get("refs", ()):
        if match := _UNIT.match(ref.get("locator", "")):
            word, number = match[1].lower(), match[2].lower()
            ident = str(int(number)) if number.isdigit() else number
            return ref.get("source", ""), _UNIT_WORDS.get(word, word), ident
    return None


def _section_arcs(topics: dict[str, Any], keys: Collection[str]) -> dict[Section, str]:
    """Each section's arc: the one most of its topics in ``keys`` (those with
    an arc before placement) sit in, and none on a tie."""
    votes: dict[Section, Counter[str]] = defaultdict(Counter)
    for key in keys:
        if section := _section(topics[key]):
            votes[section][topics[key]["arc"]] += 1
    homes: dict[Section, str] = {}
    for section, counts in votes.items():
        (arc, most), *rest = counts.most_common(2)
        if not rest or rest[0][1] < most:
            homes[section] = arc
    return homes


def _place(before: dict[str, Any], record: dict[str, Any]) -> dict[str, str]:
    """P1: give every topic with no arc its section's arc, else the arc of its
    latest prerequisite, as far as its prerequisites and dependents allow, in
    prerequisite order, so a placed topic bounds the ones after it. A topic
    with no prerequisite, or the one the lesson moves to, takes the arc
    nearest the learner instead (round 16, AIKR: a Prolog topic needing only
    Prolog landed in the current arc, "Uncertainty and probability")."""
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
    homes = _section_arcs(topics, set(topics) - unplaced)
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
        home = homes.get(section) if (section := _section(topics[key])) else None
        index = arcs.index(home) if home in arcs else -1
        builds = key != record.get("path", {}).get("current") and any(
            "arc" in topics[need] for need in topics[key].get("needs", ())
        )
        if not low <= index <= high:
            index = low if builds else min(max(target, low), high)
        arc = arcs[index]
        topics[key] = {**topics[key], "arc": arc}
        placed[key] = arc
    return placed


# The doctrine's bar for a new arc (arcs.md, "Placing a new topic"): new
# material whose own unit heading covers at least two new topics.
NEW_UNIT_TOPICS = 2


def _unit(topic: dict[str, Any]) -> Section | None:
    """The unit a topic's material comes from: its section, else the source of
    its first ref, a file whose locators name no section (one lecture's
    slides) being a unit of its own; none without a ref."""
    if section := _section(topic):
        return section
    refs = topic.get("refs", ())
    return (refs[0]["source"], "", "") if refs else None


def _new_units(
    record: dict[str, Any], placed: Collection[str], day: str
) -> list[dict[str, Any]]:
    """A ``unit`` event for each unit no arc holds that at least
    ``NEW_UNIT_TOPICS`` of the topics the save placed come from, so the app
    re-cuts the arcs he has not begun around them. A topic with an arc the
    engine did not place, excluded ones included, holds its unit, and its
    sources as whole-source units."""
    topics = record["topics"]
    holders = [t for key, t in topics.items() if "arc" in t and key not in placed]
    held = {_unit(topic) for topic in holders}
    cited = {ref["source"] for topic in holders for ref in topic.get("refs", ())}
    found: dict[Section, list[str]] = defaultdict(list)
    for key in placed:
        unit = _unit(topics[key])
        if unit is not None and unit not in held and (unit[1] or unit[0] not in cited):
            found[unit].append(key)
    events: list[dict[str, Any]] = []
    for (source, word, number), keys in found.items():
        if len(keys) < NEW_UNIT_TOPICS:
            continue
        name = f"{word} {number} of {source}" if word else f"the source {source}"
        events.append(
            {
                "day": day,
                "kind": "unit",
                "topics": sorted(keys),
                "reason": f"{name}: new topics no arc holds",
            }
        )
    return events


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


def _logged(
    before: dict[str, Any],
    after: dict[str, Any],
    found: list[dict[str, Any]],
    change: dict[str, Any],
    log: list[dict[str, Any]],
    day: str,
) -> list[dict[str, Any]]:
    """The events a save's ``arc_change`` logs after ``log``: its ``edges``
    event first, then each arc change, which refers to the edges it rests on
    (``edges_entry``); a reason with neither is a note."""
    rest = {name: value for name, value in change.items() if name != "edges"}
    events: list[dict[str, Any]] = []
    if "edges" in change:
        if "edges_entry" in change:
            raise ValueError(
                "arc_change: a save that lists edges logs them in its own entry, "
                "which its arc changes refer to; drop edges_entry"
            )
        arc_rules.check_edges(before, after, change["edges"])
        events.append({"day": day, "kind": "edges", **change})
        rest["edges_entry"] = len(log)
    elif "edges_entry" in change:
        arc_rules.check_edges_entry(
            log, change["edges_entry"], "arc_change.edges_entry"
        )
    events += [{"day": day, **event, **rest} for event in found]
    if not events:
        events.append({"day": day, "kind": "note", **rest})
    return events


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
    """Place new topics, guard, check and log the save's arc changes and the
    new units it placed, and mark the exam as moved when topics move into or
    out of its scope. Changes ``record`` in place; returns the arc each new
    topic was placed in."""
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
        log += _logged(before, record, found, change, log, day)
    if before["arcs"]:
        log += _new_units(record, placed, day)
    if log:
        record["arc_log"] = log
    old = set(before["topics"])
    if _scope(before, old) != _scope(record, old):
        outcome.exam_moved = True
    return placed
