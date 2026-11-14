"""The rules of a course's arcs that read no evidence: structure, names, scope.

An arc is a named stretch of the path, like a textbook chapter. ``check`` holds
the structural rules every stored record keeps; ``names`` refuses a new or
changed title that is a label or a number, and ``misnamed`` reports a stored
one; ``events`` lists what a save changed; ``placement_range`` bounds where a
new topic may go; ``prune`` drops arcs a removal emptied. Every function reads
plain record dicts and imports nothing from ``learning``, so ``schema`` and
``progress`` can both call it.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable
import difflib
import re
from typing import Any

# One live arc is the course again: nothing left to orient by.
MIN_ARCS = 2
ARC_EVENTS = (
    "formed",
    "added",
    "removed",
    "renamed",
    "reworded",
    "reordered",
    "moved",
    "note",
)
TEXTS = {
    "title": "it is the arc's name on screen",
    "question": "every topic in the arc helps answer it, and agents place topics by it",
    "purpose": "it says what the arc lets the learner do, and its first lesson opens "
    "with it",
}

# Words that only number a stretch of material: a title built on them names a
# slot, not an idea. Ordinals and roman numerals stop at the counts a heading
# spells out in words or numerals (tenth, XII); roman numerals count only in
# capitals, so the Italian article "i" passes.
LABELS = frozenset(
    "part unit week chapter lecture module section lesson "
    "parte unità settimana capitolo lezione modulo".split()
)
ORDINALS = frozenset(
    "first second third fourth fifth sixth seventh eighth ninth tenth "
    "primo secondo terzo quarto quinto sesto settimo ottavo nono decimo "
    "prima seconda terza quarta quinta sesta settima ottava nona decima".split()
)
ROMAN = frozenset("I II III IV V VI VII VIII IX X XI XII".split())
_MATH = re.compile(r"\$\$.*?\$\$|\$.*?\$", re.DOTALL)
_WORD = re.compile(r"[^\W_]+")
_NUMBER = re.compile(r"[0-9]+(?:st|nd|rd|th|º|ª)?")
_ROMAN = "|".join(sorted(ROMAN, key=lambda numeral: (-len(numeral), numeral)))
# Four or more trailing digits (a year, a count) are not numbering:
# "Europe after 1945".
_TRAILING = re.compile(rf"(?<![^\W_])(?:[0-9]{{1,3}}|{_ROMAN})$")
_LEADING = re.compile(rf"^(?:[0-9]+|{_ROMAN})\s*[.:)]")


# --- reading arcs -----------------------------------------------------------


def order(record: dict[str, Any]) -> list[str]:
    """The arcs in study order (``path.arcs``)."""
    arcs: list[str] = record.get("path", {}).get("arcs", [])
    return arcs


def members(record: dict[str, Any], arc: str) -> list[str]:
    """The topics in ``arc``, excluded ones included."""
    return [key for key, topic in record["topics"].items() if topic.get("arc") == arc]


def live(record: dict[str, Any]) -> list[str]:
    """Arcs holding a topic that is not excluded, in study order."""
    held = {
        topic["arc"]
        for topic in record["topics"].values()
        if "arc" in topic and "excluded" not in topic
    }
    return [arc for arc in order(record) if arc in held]


def title(record: dict[str, Any], arc: str) -> str:
    return str(record["arcs"].get(arc, {}).get("title", arc))


def examined(record: dict[str, Any]) -> frozenset[str] | None:
    """The topics the next exam examines when it names arcs, else None (the
    whole course): live topics of ``exam.arcs`` not in ``exam.leaves_out``.
    It reads no evidence, so it stays the same while the learner is taught."""
    exam = record.get("exam", {})
    if "date" not in exam or "arcs" not in exam:
        return None
    named, left = set(exam["arcs"]), set(exam.get("leaves_out", ()))
    return frozenset(
        key
        for key, topic in record["topics"].items()
        if topic.get("arc") in named and "excluded" not in topic and key not in left
    )


# --- structure --------------------------------------------------------------


def _close(word: str, choices: Iterable[str]) -> str:
    matches = difflib.get_close_matches(word, list(choices), n=3, cutoff=0.6)
    quoted = " or ".join(f'"{match}"' for match in matches)
    return f" (did you mean {quoted}?)" if matches else ""


def _listed(handles: Iterable[str]) -> str:
    return ", ".join(f'"{handle}"' for handle in handles) or "none"


def check(record: dict[str, Any], *, placing: bool = False) -> None:
    """Refuse a record that breaks a structural arc rule, naming the fix.

    ``placing`` is a save's state before the engine places its new topics:
    a topic may still lack an arc, and the size and exam rules (H4, H6, H8)
    wait for ``check_placed``.
    """
    _check_topics(record, placing)
    _check_order(record)
    if not record["arcs"]:
        return
    for arc, item in record["arcs"].items():
        for name, why in TEXTS.items():
            if name not in item:
                raise ValueError(f"arcs.{arc}.{name}: required; {why}")
    _check_needs(record)
    if not placing:
        _check_placed(record)


def _check_topics(record: dict[str, Any], placing: bool) -> None:
    """H1: with arcs, every topic names an existing one; without, none does."""
    arcs = record["arcs"]
    for key, topic in record["topics"].items():
        path = f"topics.{key}.arc"
        if "arc" not in topic:
            if arcs and not placing:
                raise ValueError(
                    f"{path}: the course groups its topics into arcs, so every "
                    f'topic needs one; give "{key}" the arc its prerequisites and '
                    "material put it in"
                )
        elif not arcs:
            raise ValueError(f'{path}: the course has no arcs; remove "arc"')
        elif topic["arc"] not in arcs:
            raise ValueError(
                f'{path}: no arc "{topic["arc"]}"{_close(topic["arc"], arcs)}; the '
                f"arcs are {_listed(arcs)}"
            )


def _check_order(record: dict[str, Any]) -> None:
    """H3: ``path.arcs`` lists every arc once, and is absent without arcs."""
    arcs, listed = record["arcs"], order(record)
    if not arcs:
        if listed:
            raise ValueError('path.arcs: the course has no arcs; remove "arcs"')
        for name in ("arcs", "leaves_out"):
            if name in record.get("exam", {}):
                raise ValueError(f"exam.{name}: the course has no arcs; remove it")
        return
    missing = [arc for arc in arcs if arc not in listed]
    unknown = [arc for arc in listed if arc not in arcs]
    if missing or unknown:
        raise ValueError(
            f"path.arcs must list every arc exactly once: missing {_listed(missing)}; "
            f"unknown {_listed(unknown)}. Send the whole list"
        )


def _check_needs(record: dict[str, Any]) -> None:
    """H2: no topic needs a topic of a later arc, excluded topics included."""
    topics, index = record["topics"], {arc: i for i, arc in enumerate(order(record))}
    for key, topic in topics.items():
        here = topic.get("arc")
        for need in topic.get("needs", ()) if here else ():
            later = topics[need].get("arc")
            if later is None or index[later] <= index[here]:
                continue
            raise ValueError(
                f'topics.{key}.needs: "{key}" (in "{title(record, here)}") needs '
                f'"{need}", which sits in the later arc "{title(record, later)}"; '
                "no topic may need a later arc. Fix it by moving a boundary: move "
                f'"{need}" to "{here}" or an earlier arc, or move "{key}" to '
                f'"{later}" or a later arc, whichever has no evidence (with '
                "arc_change.reason). Drop the need only if the material shows an "
                f'exercise on "{key}" can be done without "{need}". If both have '
                "evidence, keep the arcs and the need, and record the conflict in "
                "arc_change.reason; only he can ask for a re-plan"
            )


def _check_placed(record: dict[str, Any]) -> None:
    _check_sizes(record)
    _check_exam(record)


def check_placed(before: dict[str, Any], after: dict[str, Any]) -> None:
    """H4, H6 and H8 on a save's record once its new topics are placed. The
    rules name arcs, so a refusal that the save's new exclusions alone cause
    names them too."""
    if not after["arcs"]:
        return
    try:
        _check_placed(after)
    except ValueError as error:
        old = before["topics"]
        newly = [
            key
            for key, topic in after["topics"].items()
            if "excluded" in topic and "excluded" not in old.get(key, {})
        ]
        kept = {
            **after,
            "topics": {
                key: {k: v for k, v in topic.items() if k != "excluded"}
                if key in newly
                else topic
                for key, topic in after["topics"].items()
            },
        }
        if not newly or _fails(kept):
            raise
        raise ValueError(f"excluding {_listed(newly)}: {error}") from None


def _fails(record: dict[str, Any]) -> bool:
    try:
        _check_placed(record)
    except ValueError:
        return True
    return False


def _check_sizes(record: dict[str, Any]) -> None:
    """H4: no empty arc, and at least two live arcs."""
    for arc in order(record):
        if not members(record, arc):
            raise ValueError(
                f'arcs.{arc}: no topic is in "{title(record, arc)}"; give it topics '
                f'or remove it with "{arc}": null'
            )
    if len(live(record)) < MIN_ARCS:
        raise ValueError(
            "arcs: one live arc equal to the course adds nothing to orient by; "
            "form at least two or none"
        )


def _check_exam(record: dict[str, Any]) -> None:
    """H6 and H8: the exam's arcs are a run of live arcs, and what it leaves
    out lies inside them without emptying one."""
    exam = record.get("exam", {})
    named: list[str] = exam.get("arcs", [])
    running = live(record)
    for arc in named:
        if arc not in record["arcs"]:
            raise ValueError(
                f'exam.arcs: no arc "{arc}"{_close(arc, record["arcs"])}; the arcs '
                f"are {_listed(order(record))}"
            )
        if arc not in running:
            raise ValueError(
                f'exam.arcs: every topic of "{arc}" is excluded, and no exam '
                "examines an excluded topic; leave the arc out"
            )
    if named:
        start = min(running.index(arc) for arc in named)
        run = running[start : start + len(named)]
        if run != named:
            gap = next((arc for arc in run if arc not in named), None)
            where = f'; "{gap}" sits between them' if gap else ", in that order"
            raise ValueError(
                "exam.arcs must be a run of consecutive live arcs in path.arcs, "
                f'e.g. ["{run[0]}", …, "{run[-1]}"]{where}'
            )
    left: list[str] = exam.get("leaves_out", [])
    if left and not named:
        raise ValueError(
            "exam.leaves_out lists topics of the exam's arcs, so it needs exam.arcs"
        )
    topics = record["topics"]
    for key in left:
        topic = topics.get(key, {})
        if topic.get("arc") not in named or "excluded" in topic:
            raise ValueError(
                f'exam.leaves_out: "{key}" is not in the exam\'s arcs {_listed(named)}'
            )
    for arc in named:
        if all(
            "excluded" in topics[key] or key in left for key in members(record, arc)
        ):
            raise ValueError(
                f'exam.leaves_out holds every topic of "{arc}"; drop "{arc}" from '
                "exam.arcs instead"
            )


def check_exam_patch(
    before: dict[str, Any], after: dict[str, Any], change: dict[str, Any] | None
) -> None:
    """H7: in a course with arcs, a changed or removed exam date states the
    new exam's scope."""
    if not after["arcs"] or not change or "date" not in change or "arcs" in change:
        return
    if change["date"] == before.get("exam", {}).get("date"):
        return
    raise ValueError(
        "exam.date changes and exam.arcs does not; say the new exam's scope in "
        "exam.arcs (null for the whole course), and exam.leaves_out if it leaves "
        "topics of those arcs out"
    )


# --- names ------------------------------------------------------------------


def _plain(text: str) -> str:
    return " ".join(_MATH.sub(" ", text).split())


def _same(text: str) -> str:
    return _plain(text).casefold()


def name_fault(text: str) -> bool:
    """Whether a title is a label with a number, or numbered (N1, N2): whole
    words outside math, no stemming."""
    plain = _plain(text)
    words = _WORD.findall(plain)
    folded = [word.casefold() for word in words]
    for word, (after, folded_after) in zip(
        folded, zip(words[1:], folded[1:], strict=True)
    ):
        numbered = bool(_NUMBER.fullmatch(after)) or after in ROMAN
        if word in LABELS and (numbered or folded_after in ORDINALS):
            return True
        if word in ORDINALS and folded_after in LABELS:
            return True
    return bool(_TRAILING.search(plain) or _LEADING.match(plain))


def names(before: dict[str, Any], after: dict[str, Any]) -> None:
    """Refuse a new or changed arc title that is a label, a number or another
    arc's title (N1 to N3). Stored titles are never judged again."""
    old = before["arcs"]
    for arc, item in after["arcs"].items():
        text = item["title"]
        if old.get(arc, {}).get("title") == text:
            continue
        if name_fault(text):
            raise ValueError(
                f'arcs.{arc}.title "{text}": name the arc\'s idea in the '
                'material\'s words, with no "Part 2"-style labels or numbering; '
                '"Derivatives" and "Applications of derivatives", never '
                '"Derivatives II"'
            )
        for other, entry in after["arcs"].items():
            if other != arc and _same(entry["title"]) == _same(text):
                raise ValueError(
                    f'arcs.{arc}.title: "{text}" already names the arc "{other}"; '
                    "tell neighbours apart by their idea"
                )


def misnamed(record: dict[str, Any]) -> list[str]:
    """Stored arcs whose title a save would refuse today, in study order."""
    titles = [_same(title(record, arc)) for arc in order(record)]
    return [
        arc
        for arc, folded in zip(order(record), titles, strict=True)
        if name_fault(title(record, arc)) or titles.count(folded) > 1
    ]


# --- what a save changed ----------------------------------------------------


def events(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    """What a save changed in the arcs. Forming arcs is one event, and a topic
    taking its first arc is a placement, not a move."""
    old, new = before["arcs"], after["arcs"]
    if not old and new:
        return [{"kind": "formed"}]
    found: list[dict[str, Any]] = [
        {"kind": "removed", "arc": arc} for arc in old if arc not in new
    ]
    found += [{"kind": "added", "arc": arc} for arc in new if arc not in old]
    for arc, item in new.items():
        if arc not in old:
            continue
        if item["title"] != old[arc]["title"]:
            found.append(
                {
                    "kind": "renamed",
                    "arc": arc,
                    "from": old[arc]["title"],
                    "to": item["title"],
                }
            )
        if any(item[name] != old[arc][name] for name in ("question", "purpose")):
            found.append({"kind": "reworded", "arc": arc})
    if reordered(before, after):
        found.append({"kind": "reordered"})
    for key, topic in after["topics"].items():
        was = before["topics"].get(key, {}).get("arc")
        if was is not None and topic.get("arc", was) != was:
            found.append(
                {"kind": "moved", "topic": key, "from": was, "to": topic["arc"]}
            )
    return found


def removals(dropped: dict[str, str], day: str) -> list[dict[str, Any]]:
    """The log events of arcs the engine dropped, each with its reason."""
    return [
        {"day": day, "kind": "removed", "arc": arc, "reason": reason}
        for arc, reason in dropped.items()
    ]


def reordered(before: dict[str, Any], after: dict[str, Any]) -> set[str]:
    """Arcs whose order relative to another arc both records hold changed."""
    old = {arc: i for i, arc in enumerate(order(before))}
    new = {arc: i for i, arc in enumerate(order(after))}
    kept = [arc for arc in old if arc in new]
    return {
        arc
        for arc in kept
        for other in kept
        if (old[arc] < old[other]) != (new[arc] < new[other])
    }


def in_words(event: dict[str, Any]) -> str:
    """One event as the clause of a refusal."""
    kind = event["kind"]
    if kind == "formed":
        return "forms arcs"
    if kind == "reordered":
        return "reorders path.arcs"
    if kind == "moved":
        return f'moves "{event["topic"]}" from "{event["from"]}" to "{event["to"]}"'
    verbs = {"added": "adds", "removed": "removes", "renamed": "renames"}
    return f'{verbs.get(kind, "rewords")} the arc "{event["arc"]}"'


# --- placement and cleanup --------------------------------------------------


def placement_range(record: dict[str, Any], key: str) -> tuple[int, int]:
    """The arc indices a topic may take: from the last arc holding one of its
    prerequisites to the first arc holding a topic that needs it, excluded
    topics included, as the needs rule reads them."""
    topics, index = record["topics"], {arc: i for i, arc in enumerate(order(record))}
    below = [
        index[topics[need]["arc"]]
        for need in topics[key].get("needs", ())
        if "arc" in topics[need]
    ]
    above = [
        index[topic["arc"]]
        for topic in topics.values()
        if key in topic.get("needs", ()) and "arc" in topic
    ]
    return max(below, default=0), min(above, default=len(index) - 1)


def drop(record: dict[str, Any], removed: Collection[str]) -> None:
    """Remove arcs and every mention of them; with no arc left, the course has
    none and no topic keeps an ``arc``."""
    if not removed:
        return
    record["arcs"] = {k: v for k, v in record["arcs"].items() if k not in removed}
    path = dict(record.get("path", {}))
    exam = dict(record.get("exam", {}))
    arcs = [arc for arc in path.pop("arcs", []) if arc not in removed]
    named = [arc for arc in exam.pop("arcs", []) if arc not in removed]
    left = exam.pop("leaves_out", [])
    if record["arcs"]:
        path["arcs"] = arcs
        if named:
            exam["arcs"] = named
            if left:
                exam["leaves_out"] = left
    else:
        record["topics"] = {
            key: {name: value for name, value in topic.items() if name != "arc"}
            for key, topic in record["topics"].items()
        }
    for name, value in (("path", path), ("exam", exam)):
        if value:
            record[name] = value
        else:
            record.pop(name, None)


def prune(record: dict[str, Any]) -> dict[str, str]:
    """After topics are removed: drop each arc left with no topic, then every
    arc when fewer than two live ones remain. Returns each dropped arc with
    the reason its log event gives."""
    dropped = {
        arc: "its last topic was removed"
        for arc in order(record)
        if not members(record, arc)
    }
    drop(record, dropped)
    if record["arcs"] and len(live(record)) < MIN_ARCS:
        rest = {arc: "one live arc was left" for arc in order(record)}
        drop(record, rest)
        dropped.update(rest)
    return dropped
