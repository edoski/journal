"""The course record (schema 7): field sets, handles, validation and the patch rule.

``validate_record`` checks a whole stored record and returns its canonical form.
``check_patch`` validates the shape of one ``save`` patch before any lock is
taken, and ``apply_patch`` applies it purely to a validated record. ``remove``
is the exact-removal rule behind ``forget``. Every message names the field path,
the fix and, for unknown fields or handles, the closest known ones.
"""

from __future__ import annotations

from collections.abc import Callable, Collection, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
import difflib
from graphlib import CycleError, TopologicalSorter
import re
from typing import Any, TypedDict
import unicodedata

from learning import arc_rules, clock, preferences

SCHEMA = 7
HANDLE = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")
OBSERVATION_ID = re.compile(r"o[1-9][0-9]*")
RESERVED = re.compile(r"o[0-9]+")
DAY = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
KINDS = ("attempt", "exam", "self_report")
RESULTS = ("correct", "partial", "incorrect")
SURE = ("guess", "neutral", "confident")
REVIEWERS = ("engine", "tutor")
UNAIDED = "none"
DUPLICATE_WINDOW = timedelta(minutes=30)
MAX_REVIEW_DAYS = 3650
HANDLE_RULE = (
    "handles are 1-64 lowercase letters, digits, '_' or '-' starting with a "
    "letter or digit"
)

# Arcs, topics, knowledge, tasks and sources share one handle namespace.
NAMESPACE = {
    "sources": "source",
    "arcs": "arc",
    "topics": "topic",
    "knowledge": "knowledge entry",
    "tasks": "task",
}
RECORD_FIELDS = (
    "schema",
    "title",
    "goal",
    "exam",
    "journal",
    "sources",
    "arcs",
    "topics",
    "observations",
    "knowledge",
    "tasks",
    "focus",
    "path",
    "arc_log",
    "preferences",
    "next_observation",
    "revision",
    "updated_at",
)
PATCH_FIELDS = (
    "title",
    "goal",
    "exam",
    "journal",
    "sources",
    "arcs",
    "topics",
    "observations",
    "knowledge",
    "tasks",
    "focus",
    "path",
    "arc_change",
    "preferences",
    "global_preferences",
)
HELPER_FIELDS = frozenset(
    {
        "schema",
        "revision",
        "updated_at",
        "next_observation",
        "recorded",
        "due_topics",
        "judged",
        "updated",
        "created",
        "by",
        "standing",
        "level",
    }
)

# Value rules, one per field slot.
_TEXT = "text"
_TEXTS = "texts"
_HANDLE = "handle"
_HANDLES = "handles"
_IDS = "ids"
_REFS = "refs"
_DAY = "day"
_FLAG = "flag"
_KIND = "kind"
_RESULT = "result"
_HELP = "help"
_SURE = "sure"
_INTRODUCED = "introduced"
_REVIEW = "review"
_BY = "by"
_STAMP = "stamp"
_POINTS = "points"
_ARC_EVENT = "arc_event"
MAX_POINTS = 5
POINT_CHARS = 200

FIELDS: dict[str, dict[str, str]] = {
    "exam": {
        "date": _DAY,
        "format": _TEXT,
        "coverage": _TEXT,
        "criteria": _TEXTS,
        "constraints": _TEXTS,
        "unknowns": _TEXTS,
        "refs": _REFS,
        "arcs": _HANDLES,
        "leaves_out": _HANDLES,
    },
    "source": {"path": _TEXT, "title": _TEXT},
    "arc": {"title": _TEXT, "question": _TEXT, "purpose": _TEXT, "refs": _REFS},
    "topic": {
        "title": _TEXT,
        "arc": _HANDLE,
        "needs": _HANDLES,
        "contrasts": _HANDLES,
        "refs": _REFS,
        "aliases": _TEXTS,
        "introduced": _INTRODUCED,
        "gap": _TEXT,
        "note": _TEXT,
        "review": _REVIEW,
        "excluded": _TEXT,
    },
    "review": {"due": _DAY, "prompt": _TEXT, "points": _POINTS},
    "observation": {
        "kind": _KIND,
        "topics": _HANDLES,
        "text": _TEXT,
        "response": _TEXT,
        "help": _HELP,
        "result": _RESULT,
        "sure": _SURE,
        "chose": _HANDLE,
        "transfer": _FLAG,
        "shown": _FLAG,
        "gave_up": _FLAG,
        "predicted": _FLAG,
        "date": _DAY,
        "task": _HANDLE,
        "refs": _REFS,
        "corrects": _IDS,
        "disputed": _TEXT,
        "ruling": _TEXT,
        "uncertain": _TEXT,
        "checkpoint": _HANDLE,
    },
    "knowledge": {
        "text": _TEXT,
        "topics": _HANDLES,
        "refs": _REFS,
        "uncertain": _TEXT,
        "pinned": _FLAG,
        "aliases": _TEXTS,
    },
    "task": {
        "title": _TEXT,
        "topics": _HANDLES,
        "refs": _REFS,
        "goal": _TEXT,
        "step": _TEXT,
        "help": _TEXT,
        "note": _TEXT,
    },
    "path": {"current": _HANDLE, "order": _HANDLES, "basis": _TEXT, "arcs": _HANDLES},
    "ref": {"source": _HANDLE, "locator": _TEXT},
    "arc_event": {
        "day": _DAY,
        "kind": _ARC_EVENT,
        "arc": _HANDLE,
        "topic": _HANDLE,
        "from": _TEXT,
        "to": _TEXT,
        "reason": _TEXT,
        "asked": _TEXT,
    },
    "arc_change": {"reason": _TEXT, "asked": _TEXT},
}
HELPERS: dict[str, dict[str, str]] = {
    "exam": {"final_review": _DAY},
    "topic": {"judged": _DAY},
    "review": {"by": _BY},
    "observation": {"recorded": _STAMP, "due_topics": _HANDLES},
    "knowledge": {"updated": _DAY},
    "task": {"created": _DAY, "updated": _DAY},
}
REQUIRED: dict[str, tuple[str, ...]] = {
    "source": ("path",),
    "observation": ("kind", "topics", "text", "date", "recorded"),
    "knowledge": ("text",),
    "ref": ("source",),
    "arc_event": ("day", "kind", "reason"),
    "arc_change": ("reason",),
}
_REVIEW_PATCH = {
    "due": _DAY,
    "in_days": "in_days",
    "prompt": _TEXT,
    "points": _POINTS,
}
_MAP_KINDS = {
    "sources": "source",
    "arcs": "arc",
    "topics": "topic",
    "knowledge": "knowledge",
    "tasks": "task",
}


# --- stored shapes ----------------------------------------------------------


class Reference(TypedDict, total=False):
    source: str
    locator: str


class Source(TypedDict, total=False):
    path: str
    title: str


class Review(TypedDict, total=False):
    due: str
    prompt: str
    points: list[str]
    by: str


class Arc(TypedDict, total=False):
    title: str
    question: str
    purpose: str
    refs: list[Reference]


# "from" is a keyword, so the shape is declared functionally.
ArcEvent = TypedDict(
    "ArcEvent",
    {
        "day": str,
        "kind": str,
        "arc": str,
        "topic": str,
        "from": str,
        "to": str,
        "reason": str,
        "asked": str,
    },
    total=False,
)


class Topic(TypedDict, total=False):
    title: str
    arc: str
    needs: list[str]
    contrasts: list[str]
    refs: list[Reference]
    aliases: list[str]
    introduced: str
    gap: str
    note: str
    judged: str
    review: Review
    excluded: str


class Observation(TypedDict, total=False):
    kind: str
    topics: list[str]
    text: str
    response: str
    help: str
    result: str
    sure: str
    chose: str
    transfer: bool
    shown: bool
    gave_up: bool
    predicted: bool
    date: str
    task: str
    refs: list[Reference]
    corrects: list[str]
    disputed: str
    ruling: str
    uncertain: str
    checkpoint: str
    recorded: str
    due_topics: list[str]


class Knowledge(TypedDict, total=False):
    text: str
    topics: list[str]
    refs: list[Reference]
    uncertain: str
    pinned: bool
    aliases: list[str]
    updated: str


class Task(TypedDict, total=False):
    title: str
    topics: list[str]
    refs: list[Reference]
    goal: str
    step: str
    help: str
    note: str
    created: str
    updated: str


class Exam(TypedDict, total=False):
    date: str
    final_review: str
    format: str
    coverage: str
    criteria: list[str]
    constraints: list[str]
    unknowns: list[str]
    refs: list[Reference]
    arcs: list[str]
    leaves_out: list[str]


class CoursePath(TypedDict, total=False):
    current: str
    order: list[str]
    basis: str
    arcs: list[str]


SHAPES: dict[str, type] = {
    "exam": Exam,
    "source": Source,
    "arc": Arc,
    "arc_event": ArcEvent,
    "topic": Topic,
    "review": Review,
    "observation": Observation,
    "knowledge": Knowledge,
    "task": Task,
    "path": CoursePath,
    "ref": Reference,
}


@dataclass
class PatchResult:
    """What one patch did, for scheduling and the save receipt."""

    observations: list[str] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)
    # The id each observation of the patch has, in the patch's order: the new
    # one, or the stored one it repeated. A host pairs an entry with what it
    # answers by its place in the patch.
    saved: list[str] = field(default_factory=list)
    tutor_reviews: list[str] = field(default_factory=list)
    introduced: list[str] = field(default_factory=list)
    judged: list[str] = field(default_factory=list)
    global_preferences: dict[str, str | None] | None = None
    exam_moved: bool = False
    pruned: dict[str, str] = field(default_factory=dict)


# --- messages ---------------------------------------------------------------


def did_you_mean(word: str, choices: Iterable[str]) -> str:
    """`` (did you mean "x"?)`` for close matches, else nothing."""
    matches = difflib.get_close_matches(word, list(choices), n=3, cutoff=0.6)
    if not matches:
        return ""
    quoted = " or ".join(f'"{match}"' for match in matches)
    return f" (did you mean {quoted}?)"


def _at(path: str, name: str) -> str:
    return f"{path}.{name}" if path else name


def _unknown_field(name: str, fields: Collection[str], path: str) -> str:
    if name in HELPER_FIELDS:
        return f"{_at(path, name)} is helper-owned; omit it"
    where = f"{path}: unknown" if path else "Unknown"
    return (
        f'{where} field "{name}"{did_you_mean(name, fields)}; '
        f"fields: {', '.join(fields)}"
    )


def _misfiled(kind: str, path: str, name: str, value: Any) -> str:
    """Points a knowledge entry that calls itself a preference to ``preferences``."""
    named = f"{path} {name} {value if isinstance(value, str) else ''}".casefold()
    if kind != "knowledge" or "prefer" not in named:
        return ""
    return (
        "; if this is how the learner wants to be taught, it is not knowledge: "
        'save it as {"preferences": {"explanation_depth": "Short first"}}'
    )


def slug(value: str) -> str:
    """The closest valid handle for free text, e.g. ``Rank and Nullity``."""
    folded = unicodedata.normalize("NFKD", value.casefold())
    plain = "".join(char for char in folded if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9_]+", "-", plain).strip("-_")[:64].rstrip("-_")


def _handle_error(value: Any, path: str) -> ValueError:
    hint = ""
    if isinstance(value, str) and (suggestion := slug(value)):
        hint = f', e.g. "{suggestion}"'
    return ValueError(f"{path}: {value!r} is not a handle; {HANDLE_RULE}{hint}")


def _missing_topic(name: str, path: str, topics: Collection[str]) -> ValueError:
    close = did_you_mean(name, topics)
    existing = f", or use an existing topic{close}" if close else ""
    return ValueError(
        f'{path}: unknown topic "{name}"; create it in the same patch with '
        f'"topics": {{"{name}": {{"title": "..."}}}}{existing}'
    )


def _missing_source(name: str, path: str, sources: Collection[str]) -> ValueError:
    return ValueError(
        f'{path}: unknown source "{name}"{did_you_mean(name, sources)}; register '
        f'it first (sources --add PATH) or in the same patch with "sources": '
        f'{{"{name}": {{"path": "..."}}}}'
    )


def _missing_task(name: str, path: str, tasks: Collection[str]) -> ValueError:
    return ValueError(
        f'{path}: unknown task "{name}"{did_you_mean(name, tasks)}; create it in '
        f'the same patch with "tasks": {{"{name}": {{"title": "..."}}}}'
    )


# --- value rules ------------------------------------------------------------


def _text(value: Any, path: str, patch: bool) -> str:
    if isinstance(value, str) and value.strip():
        return value
    clear = "; use null to clear it" if patch else ""
    raise ValueError(f"{path} must be a nonempty string{clear}")


def _list(value: Any, path: str, what: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{path} must be a list of {what}")
    return value


def _texts(value: Any, path: str, patch: bool) -> list[str] | None:
    items = _list(value, path, "nonempty strings")
    texts = [_text(item, f"{path}[{index}]", False) for index, item in enumerate(items)]
    return list(dict.fromkeys(texts)) or None


def _points(value: Any, path: str, patch: bool) -> list[str] | None:
    points = _texts(value, path, patch)
    if points is not None and len(points) > MAX_POINTS:
        raise ValueError(
            f"{path} takes 1-{MAX_POINTS} key points, not {len(points)}; keep the "
            "ones an answer must contain"
        )
    for index, point in enumerate(points or ()):
        if len(point) > POINT_CHARS:
            raise ValueError(
                f"{path}[{index}] is {len(point)} characters; keep each key point "
                f"under {POINT_CHARS}"
            )
    return points


def _handle(value: Any, path: str, patch: bool) -> str:
    if isinstance(value, str) and HANDLE.fullmatch(value):
        return value
    raise _handle_error(value, path)


def _handles(value: Any, path: str, patch: bool) -> list[str] | None:
    items = _list(value, path, "handles")
    handles = [
        _handle(item, f"{path}[{index}]", False) for index, item in enumerate(items)
    ]
    return list(dict.fromkeys(handles)) or None


def _ids(value: Any, path: str, patch: bool) -> list[str] | None:
    items = _list(value, path, 'observation ids such as "o3"')
    for index, item in enumerate(items):
        if not isinstance(item, str) or not OBSERVATION_ID.fullmatch(item):
            raise ValueError(
                f'{path}[{index}]: {item!r} is not an observation id such as "o3"'
            )
    return list(dict.fromkeys(items)) or None


def _refs(value: Any, path: str, patch: bool) -> list[dict[str, Any]] | None:
    items = _list(value, path, 'objects like {"source": "slides", "locator": "p. 4"}')
    refs: list[dict[str, Any]] = []
    for index, item in enumerate(items):
        ref = entry("ref", item, f"{path}[{index}]")
        if ref not in refs:
            refs.append(ref)
    return refs or None


def _day(value: Any, path: str, patch: bool) -> str:
    if isinstance(value, str) and DAY.fullmatch(value):
        try:
            date.fromisoformat(value)
        except ValueError:
            pass
        else:
            return value
    raise ValueError(f"{path} must be a date in YYYY-MM-DD form, not {value!r}")


def _flag(value: Any, path: str, patch: bool) -> bool | None:
    if type(value) is not bool:
        raise ValueError(f"{path} must be true or false")
    return True if value else None


def _choice(choices: tuple[str, ...]) -> Callable[[Any, str, bool], str]:
    def check(value: Any, path: str, patch: bool) -> str:
        if isinstance(value, str) and value in choices:
            return value
        hint = did_you_mean(value, choices) if isinstance(value, str) else ""
        raise ValueError(
            f"{path} must be one of {', '.join(choices)}, not {value!r}{hint}"
        )

    return check


def _help(value: Any, path: str, patch: bool) -> str:
    text = _text(value, path, patch)
    return UNAIDED if text.strip().casefold() == UNAIDED else text


def _introduced(value: Any, path: str, patch: bool) -> str | bool:
    if patch and value is True:
        return True
    try:
        return _day(value, path, patch)
    except ValueError:
        if not patch:
            raise
        raise ValueError(
            f"{path} must be true (taught today) or the YYYY-MM-DD day the topic "
            "was first taught; use null to clear it"
        ) from None


def _stamp(value: Any, path: str, patch: bool) -> str:
    if isinstance(value, str):
        try:
            if datetime.fromisoformat(value).tzinfo is not None:
                return value
        except ValueError:
            pass
    raise ValueError(f"{path} must be an ISO timestamp with a UTC offset")


def _in_days(value: Any, path: str, patch: bool) -> int:
    if type(value) is int and 0 <= value <= MAX_REVIEW_DAYS:
        return value
    raise ValueError(
        f"{path} must be a whole number of days from 0 to {MAX_REVIEW_DAYS}"
    )


def _review(value: Any, path: str, patch: bool) -> dict[str, Any] | None:
    if patch:
        return _review_patch(value, path)
    review = entry("review", value, path)
    if "due" not in review:
        review.pop("by", None)
    elif "by" not in review:
        raise ValueError(f"{path}.by is required with a due date")
    return review or None


_RULES: dict[str, Callable[[Any, str, bool], Any]] = {
    _TEXT: _text,
    _TEXTS: _texts,
    _HANDLE: _handle,
    _HANDLES: _handles,
    _IDS: _ids,
    _REFS: _refs,
    _DAY: _day,
    _FLAG: _flag,
    _KIND: _choice(KINDS),
    _RESULT: _choice(RESULTS),
    _HELP: _help,
    _SURE: _choice(SURE),
    _INTRODUCED: _introduced,
    _REVIEW: _review,
    _BY: _choice(REVIEWERS),
    _STAMP: _stamp,
    _POINTS: _points,
    _ARC_EVENT: _choice(arc_rules.ARC_EVENTS),
    "in_days": _in_days,
}


def entry(
    kind: str,
    value: Any,
    path: str,
    *,
    patch: bool = False,
    fields: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Validate one object of ``kind``; in a patch, ``None`` values mean clear.

    Stored objects come back in the canonical field order of ``FIELDS`` followed
    by helper fields, so the record reads the same however it was written.
    """
    if not isinstance(value, dict):
        null = " or null" if patch else ""
        raise ValueError(f"{path} must be an object{null}")
    allowed = fields or FIELDS[kind]
    helpers = {} if patch else HELPERS.get(kind, {})
    for name in value:
        if name not in allowed and name not in helpers:
            hint = (
                ""
                if name in HELPER_FIELDS
                else _misfiled(kind, path, name, value[name])
            )
            raise ValueError(_unknown_field(name, allowed, path) + hint)
    order = value if patch else [*allowed, *helpers]
    result: dict[str, Any] = {}
    for name in order:
        if name not in value:
            continue
        item = value[name]
        if item is None:
            if not patch:
                raise ValueError(f"{path}.{name} must not be null; omit it instead")
            result[name] = None
            continue
        rule = allowed.get(name) or helpers[name]
        normalized = _RULES[rule](item, f"{path}.{name}", patch)
        if normalized is not None or patch:
            result[name] = normalized
    if not patch:
        for name in REQUIRED.get(kind, ()):
            if name not in result:
                raise ValueError(f'{path} needs "{name}"')
    else:
        _learner_reads(kind, result, path)
    return result


# --- what the learner reads -------------------------------------------------

# The recorded texts the learner reads in their study app, days later
# (records.md, "What the learner reads"), and of those the ones written to the
# learner: a topic's title names an idea and an attempt's text is the question
# as asked, so a person in a word problem may be "he". A re-mark's ruling shows
# on the answer it re-marks, so it speaks to the learner too.
LEARNER_READS: dict[str, tuple[str, ...]] = {
    "arc": ("title",),
    "topic": ("title", "gap", "note"),
    "task": ("title", "goal", "step"),
    "observation": ("text", "ruling"),
}
WRITTEN_TO_LEARNER: dict[str, tuple[str, ...]] = {
    "topic": ("gap", "note"),
    "task": ("title", "goal", "step"),
    "observation": ("ruling",),
}
_SHOWN_ID = re.compile(r"\bo[0-9]+\b")
_SHOWN_DAY = re.compile(r"\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b")
_THIRD_PERSON = re.compile(
    r"\b(?:he|him|his|himself|she|her|hers|herself|learners?|the\s+students?)\b",
    re.IGNORECASE,
)
# A dash used as punctuation: any em dash, or an en dash with space on both
# sides. A name or a range keeps its unspaced en dash (Cauchy–Schwarz, 1–5).
_PROSE_DASH = re.compile(r"\u2014|\s\u2013\s")


def _learner_reads(kind: str, item: dict[str, Any], path: str) -> None:
    """Refuse ids, dates, third-person words and prose dashes the learner reads."""
    for name in LEARNER_READS.get(kind, ()):
        text = item.get(name)
        if not isinstance(text, str):
            continue
        where = f"{path}.{name}"
        reads = "the learner reads it in their study app"
        if found := _SHOWN_ID.search(text):
            raise ValueError(
                f'{where} names the observation "{found[0]}", but {reads}, where '
                "ids mean nothing: say what happened instead and save again"
            )
        if found := _SHOWN_DAY.search(text):
            raise ValueError(
                f'{where} holds the date "{found[0]}", but {reads}, which dates '
                'every entry itself: leave the date out, or say "the same day" '
                'or "after the hint", and save again'
            )
        if name in WRITTEN_TO_LEARNER.get(kind, ()) and (
            found := _THIRD_PERSON.search(text)
        ):
            raise ValueError(
                f'{where} speaks of the learner as "{found[0]}", but {reads}: '
                'write it to them, as "you", and save again'
            )
        if name in WRITTEN_TO_LEARNER.get(kind, ()) and _PROSE_DASH.search(text):
            raise ValueError(
                f"{where} uses a dash as punctuation, but {reads}, in plain "
                "sentences: end the sentence there or use a comma, and save again"
            )


def _review_patch(value: Any, path: str) -> dict[str, Any]:
    review = entry("review", value, path, patch=True, fields=_REVIEW_PATCH)
    if "due" in review and "in_days" in review:
        raise ValueError(f"{path}: give either due or in_days, not both")
    if review.get("in_days", 0) is None:
        raise ValueError(
            f"{path}.in_days cannot be null; clear the date with due: null"
        )
    return review


# --- observations -----------------------------------------------------------


def number(observation_id: str) -> int:
    """The sequence number of an observation id such as ``o12``."""
    return int(observation_id[1:])


def unaided(observation: dict[str, Any]) -> bool:
    """No help was given: help ``none``, or an exam."""
    return observation.get("kind") == "exam" or observation.get("help") == UNAIDED


def _observation_rules(observation: dict[str, Any], path: str) -> None:
    kind = observation["kind"]
    if kind == "attempt":
        missing = [name for name in ("help", "result") if name not in observation]
        if missing:
            raise ValueError(
                f"{path}: an attempt needs {' and '.join(missing)}: help is what "
                'help the learner got ("none" when unaided) and result is correct, '
                "partial or incorrect"
            )
    elif kind == "exam":
        if "result" not in observation:
            raise ValueError(
                f"{path}: an exam needs result (correct, partial or incorrect)"
            )
        if "help" in observation:
            raise ValueError(
                f"{path}.help: exams count as unaided; omit help, or record a "
                "helped attempt with kind attempt"
            )
        if "predicted" in observation:
            raise ValueError(
                f"{path}.predicted marks a prediction made in a session before "
                "its step was taught; an exam is never one"
            )
    else:
        given = [
            name
            for name in (
                "result",
                "help",
                "sure",
                "transfer",
                "chose",
                "shown",
                "gave_up",
                "predicted",
            )
            if name in observation
        ]
        if given:
            raise ValueError(
                f"{path}: a self_report is the learner's own statement and takes "
                f"no {', '.join(given)}; record what they did as an attempt"
            )
    if observation.get("transfer") and observation.get("result") != "correct":
        raise ValueError(f'{path}.transfer is allowed only with result "correct"')
    if observation.get("shown") and unaided(observation):
        raise ValueError(
            f"{path}.shown marks help that showed the method or the answer before "
            'the attempt, so it needs that help named, not help "none"'
        )
    if observation.get("gave_up") and observation.get("result") != "incorrect":
        raise ValueError(f'{path}.gave_up is allowed only with result "incorrect"')
    if "disputed" in observation or "ruling" in observation:
        if kind != "attempt":
            raise ValueError(
                f"{path}.disputed marks an attempt re-marked after the learner "
                "disputed its mark; it rides only an attempt"
            )
        if "disputed" not in observation or "ruling" not in observation:
            raise ValueError(
                f"{path}: a re-marked attempt needs both disputed (what the "
                "learner said was wrong with the mark) and ruling (why the mark "
                "now stands as it does, in one or two lines)"
            )
    if "checkpoint" in observation and kind != "attempt":
        raise ValueError(
            f"{path}.checkpoint tags an item of an arc's check, which is an "
            "attempt; leave it out"
        )
    if "chose" in observation:
        if observation.get("result") == "correct":
            raise ValueError(
                f"{path}.chose names a wrongly chosen method; a correct result "
                "takes none"
            )
        if observation["chose"] in observation["topics"]:
            raise ValueError(
                f"{path}.chose must name the method wrongly chosen, not one of the "
                "observation's own topics; record the attempt on the topic that "
                "should have been chosen"
            )


def observation(value: Any, path: str) -> dict[str, Any]:
    """One stored observation, with the same rules as a new one."""
    result = entry("observation", value, path)
    _observation_rules(result, path)
    return result


def _new_observation(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(
            f"{path} must be an observation object; existing observations are "
            'never edited: record a new one with "corrects": ["o3"]'
        )
    checked = entry("observation", value, path, patch=True)
    result = {name: item for name, item in checked.items() if item is not None}
    result.setdefault("kind", "attempt")
    for name in ("topics", "text"):
        if name not in result:
            raise ValueError(f'{path} needs "{name}"')
    if "disputed" in result and not result.get("corrects"):
        raise ValueError(
            f"{path}.disputed needs corrects naming the attempt whose mark was "
            'disputed, e.g. "corrects": ["o12"]'
        )
    _observation_rules(result, path)
    return result


# --- whole-record validation ------------------------------------------------


def _key(value: str, path: str) -> str:
    _handle(value, path, False)
    if RESERVED.fullmatch(value):
        raise ValueError(
            f"{path}: {value!r} is reserved for observation ids; choose another handle"
        )
    return value


def _map(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{path} must map handles to objects")
    return value


def _refs_in(item: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = item.get("refs", [])
    return refs


def _check_refs(item: dict[str, Any], path: str, sources: dict[str, Any]) -> None:
    for index, ref in enumerate(_refs_in(item)):
        if ref["source"] not in sources:
            raise _missing_source(
                ref["source"], f"{path}.refs[{index}].source", sources
            )


def _check_topic_list(values: list[str], path: str, topics: dict[str, Any]) -> None:
    for index, name in enumerate(values):
        if name not in topics:
            raise _missing_topic(name, f"{path}[{index}]", topics)


def _check_namespace(record: dict[str, Any]) -> None:
    owner: dict[str, str] = {}
    for name, label in NAMESPACE.items():
        for key in record[name]:
            if key in owner:
                raise ValueError(
                    f'{name}.{key}: "{key}" already names a {owner[key]}; topics, '
                    "knowledge, tasks and sources share one namespace, so choose "
                    f'another handle, e.g. "{key}-{label.split()[0]}"'
                )
            owner[key] = label


def _check_links(record: dict[str, Any]) -> None:
    topics, sources, tasks = record["topics"], record["sources"], record["tasks"]
    _check_refs(record.get("exam", {}), "exam", sources)
    for key, arc in record["arcs"].items():
        _check_refs(arc, f"arcs.{key}", sources)
    for key, topic in topics.items():
        path = f"topics.{key}"
        for name in ("needs", "contrasts"):
            linked = topic.get(name, [])
            if key in linked:
                raise ValueError(f"{path}.{name} must not include the topic itself")
            _check_topic_list(linked, f"{path}.{name}", topics)
        _check_refs(topic, path, sources)
    for name in ("knowledge", "tasks"):
        for key, item in record[name].items():
            _check_topic_list(item.get("topics", []), f"{name}.{key}.topics", topics)
            _check_refs(item, f"{name}.{key}", sources)
    observations = record["observations"]
    for key, item in observations.items():
        path = f"observations.{key}"
        _check_topic_list(item["topics"], f"{path}.topics", topics)
        if "chose" in item and item["chose"] not in topics:
            raise _missing_topic(item["chose"], f"{path}.chose", topics)
        _check_refs(item, path, sources)
        for target in item.get("corrects", []):
            if target not in observations or number(target) >= number(key):
                raise ValueError(
                    f"{path}.corrects: {target!r} is not an earlier observation"
                )
    course_path = record.get("path", {})
    if "current" in course_path and course_path["current"] not in topics:
        raise _missing_topic(course_path["current"], "path.current", topics)
    _check_topic_list(course_path.get("order", []), "path.order", topics)
    if "focus" in record and record["focus"] not in tasks:
        raise _missing_task(record["focus"], "focus", tasks)


def _check_acyclic(topics: dict[str, Any]) -> None:
    graph = {key: topic.get("needs", []) for key, topic in topics.items()}
    try:
        TopologicalSorter(graph).prepare()
    except CycleError as error:
        cycle = " -> ".join(error.args[1])
        raise ValueError(
            f"topics: needs form a cycle {cycle}; remove one of these needs"
        ) from None


def _preferences(value: Any) -> dict[str, str]:
    checked = preferences.validate(value, "preferences")
    result: dict[str, str] = {}
    for dimension, instruction in checked.items():
        if instruction is None:
            raise ValueError(f"preferences.{dimension} must not be null")
        result[dimension] = instruction
    return dict(sorted(result.items()))


def empty() -> dict[str, Any]:
    """A course with nothing in it yet."""
    return validate_record({"schema": SCHEMA})


def _arc_log(value: Any) -> list[dict[str, Any]]:
    return [
        entry("arc_event", item, f"arc_log[{index}]")
        for index, item in enumerate(_list(value, "arc_log", "arc events"))
    ]


def validate_record(record: Any, *, placing: bool = False) -> dict[str, Any]:
    """Check a whole stored course record and return its canonical form.

    ``placing`` is a save's record before the engine places its new topics
    in arcs (``arcs.settle``), which then runs the arc rules that read
    placement (``arc_rules.check_placed``); every other rule holds.
    """
    if not isinstance(record, dict):
        raise ValueError("the course record must be a JSON object")
    if record.get("schema") != SCHEMA or type(record.get("schema")) is not int:
        raise ValueError(
            f"the course record must have schema {SCHEMA}, not {record.get('schema')!r}"
        )
    for name in record:
        if name not in RECORD_FIELDS:
            raise ValueError(_unknown_field(name, RECORD_FIELDS, "course"))
    result: dict[str, Any] = {"schema": SCHEMA}
    for name in ("title", "goal"):
        if name in record:
            result[name] = _text(record[name], name, False)
    if "exam" in record and (exam := entry("exam", record["exam"], "exam")):
        result["exam"] = exam
    if "journal" in record:
        result["journal"] = _text(record["journal"], "journal", False)
    for name, kind in (("sources", "source"), ("arcs", "arc"), ("topics", "topic")):
        result[name] = {
            _key(key, name): entry(kind, value, f"{name}.{key}")
            for key, value in _map(record.get(name, {}), name).items()
        }
    observations: dict[str, Any] = {}
    for key, value in _map(record.get("observations", {}), "observations").items():
        if not OBSERVATION_ID.fullmatch(key):
            raise ValueError(f"observations: {key!r} is not an observation id")
        observations[key] = observation(value, f"observations.{key}")
    result["observations"] = observations
    for name, kind in (("knowledge", "knowledge"), ("tasks", "task")):
        result[name] = {
            _key(key, name): entry(kind, value, f"{name}.{key}")
            for key, value in _map(record.get(name, {}), name).items()
        }
    if "focus" in record:
        result["focus"] = _handle(record["focus"], "focus", False)
    if "path" in record and (course_path := entry("path", record["path"], "path")):
        result["path"] = course_path
    if log := _arc_log(record.get("arc_log", [])):
        result["arc_log"] = log
    result["preferences"] = _preferences(record.get("preferences", {}))
    last = max(map(number, observations), default=0)
    sequence = record.get("next_observation", last + 1)
    if type(sequence) is not int or sequence <= last:
        raise ValueError(
            "next_observation must be an integer above the last observation number"
        )
    result["next_observation"] = sequence
    if "revision" in record:
        if type(record["revision"]) is not int or record["revision"] < 0:
            raise ValueError("revision must be a nonnegative integer")
        result["revision"] = record["revision"]
    if "updated_at" in record:
        result["updated_at"] = _stamp(record["updated_at"], "updated_at", False)
    _check_namespace(result)
    _check_links(result)
    _check_acyclic(result["topics"])
    arc_rules.check(result, placing=placing)
    return result


# --- handle lookup ----------------------------------------------------------

LOOKUP = ("topics", "observations", "knowledge", "tasks", "sources", "arcs")


def _span(record: dict[str, Any]) -> str:
    last = record["next_observation"] - 1
    return f"observation ids run o1-o{last}" if last else "there are no observations"


def locate(record: dict[str, Any], handle: str) -> str:
    """The map that holds ``handle``, or a validation error with close handles."""
    for name in LOOKUP:
        if handle in record[name]:
            return name
    if isinstance(handle, str) and RESERVED.fullmatch(handle):
        raise ValueError(f'unknown observation "{handle}"; {_span(record)}')
    known = [key for name in NAMESPACE for key in record[name]]
    raise ValueError(
        f'unknown handle "{handle}"{did_you_mean(str(handle), known)}; handles name '
        "topics, knowledge entries, tasks, sources, arcs and observations (o12)"
    )


# --- shared removal ---------------------------------------------------------


def _without(
    item: dict[str, Any], name: str, removed: Collection[str]
) -> dict[str, Any]:
    values = item.get(name)
    if not values or not set(values) & set(removed):
        return item
    kept = [value for value in values if value not in removed]
    result = {key: value for key, value in item.items() if key != name}
    if kept:
        result[name] = kept
    return result


def _strip_topics(record: dict[str, Any], removed: Collection[str]) -> None:
    """Remove topic handles from needs, contrasts, the path and knowledge/task topics."""
    for name, field_name in (
        ("topics", "needs"),
        ("topics", "contrasts"),
        ("knowledge", "topics"),
        ("tasks", "topics"),
    ):
        record[name] = {
            key: _without(item, field_name, removed)
            for key, item in record[name].items()
        }
    if "leaves_out" in record.get("exam", {}):
        exam = _without(record["exam"], "leaves_out", removed)
        record["exam"] = exam
    if "path" in record:
        path = _without(record["path"], "order", removed)
        if path.get("current") in removed:
            path = {key: value for key, value in path.items() if key != "current"}
        if path:
            record["path"] = path
        else:
            record.pop("path")


def _citations(record: dict[str, Any], sources: Collection[str]) -> list[str]:
    cited = set(sources)
    paths = []
    if any(ref["source"] in cited for ref in _refs_in(record.get("exam", {}))):
        paths.append("exam")
    for name in ("arcs", "topics", "observations", "knowledge", "tasks"):
        for key, item in record[name].items():
            if any(ref["source"] in cited for ref in _refs_in(item)):
                paths.append(key if name == "observations" else f"{name}.{key}")
    return paths


def _mentions(item: dict[str, Any]) -> set[str]:
    """Topics an observation references: its own and a wrongly chosen method."""
    return {*item["topics"], *([item["chose"]] if "chose" in item else [])}


def _referencing(observations: dict[str, Any], topics: Collection[str]) -> list[str]:
    wanted = set(topics)
    return [key for key, item in observations.items() if wanted & _mentions(item)]


def _shallow(record: dict[str, Any]) -> dict[str, Any]:
    result = dict(record)
    for name in (*NAMESPACE, "observations", "preferences"):
        result[name] = dict(record[name])
    return result


def _held_arcs(record: dict[str, Any], arcs: Collection[str], what: str) -> None:
    """Refuse to remove an arc that still holds topics."""
    for arc in sorted(arcs):
        if held := arc_rules.members(record, arc):
            raise ValueError(
                f"{what.format(arc=arc)}: topics {', '.join(held[:12])} are in it; "
                "move them to another arc first, or keep the arc"
            )


def _log_removed(record: dict[str, Any], dropped: dict[str, str], day: str) -> None:
    if dropped:
        record["arc_log"] = [
            *record.get("arc_log", ()),
            *arc_rules.removals(dropped, day),
        ]


def remove(record: dict[str, Any], handles: list[str]) -> dict[str, Any]:
    """Remove exact items (the ``forget`` rule) and return the validated record."""
    if not handles:
        raise ValueError("forget needs at least one handle")
    located = {handle: locate(record, handle) for handle in dict.fromkeys(handles)}
    by_map: dict[str, set[str]] = {name: set() for name in LOOKUP}
    for handle, name in located.items():
        by_map[name].add(handle)
    topics, observations = by_map["topics"], by_map["observations"]
    blocking = [
        key
        for key in _referencing(record["observations"], topics)
        if key not in observations
    ]
    if blocking:
        listed = " ".join(blocking[:12]) + (" ..." if len(blocking) > 12 else "")
        raise ValueError(
            f"forget {' '.join(sorted(topics))}: observations {listed} reference it; "
            "forget them in the same call, or keep the topic"
        )
    result = _shallow(record)
    for name, removed in by_map.items():
        for key in removed:
            del result[name][key]
    _strip_topics(result, topics)
    _held_arcs(result, by_map["arcs"], "forget {arc}")
    arc_rules.drop(result, by_map["arcs"])
    dropped = dict.fromkeys(sorted(by_map["arcs"]), "forgotten")
    if topics:
        dropped.update(arc_rules.prune(result))
    _log_removed(result, dropped, clock.today().isoformat())
    if observations:
        result["observations"] = {
            key: _without(item, "corrects", observations)
            for key, item in result["observations"].items()
        }
    if result.get("focus") in by_map["tasks"]:
        del result["focus"]
    citing = _citations(result, by_map["sources"])
    if citing:
        raise ValueError(
            f"forget {' '.join(sorted(by_map['sources']))}: cited by "
            f"{', '.join(citing[:12])}; change those refs first, or keep the source"
        )
    return validate_record(result)


# --- the patch rule ---------------------------------------------------------


def _scalar(name: str, value: Any) -> Any:
    if value is None:
        return None
    if name == "focus":
        return _handle(value, "focus", True)
    return _text(value, name, True)


def _entries(name: str, kind: str, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(
            f"{name} must map handles to objects (a null entry removes it), e.g. "
            f'{{"{name}": {{"handle": {{...}}}}}}'
        )
    result: dict[str, Any] = {}
    for key, change in value.items():
        _key(key, name)
        path = f"{name}.{key}"
        result[key] = None if change is None else entry(kind, change, path, patch=True)
    return result


# Control, format (zero-width, bidirectional, tag) and surrogate characters: text
# the learner cannot see would still reach every later session's context.
_INVISIBLE = frozenset({"Cc", "Cf", "Cs"})


def _visible(value: Any, path: str) -> None:
    """Reject invisible characters anywhere in a patch's text, naming the field."""
    if isinstance(value, dict):
        for key, item in value.items():
            _visible(item, _at(path, str(key)))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _visible(item, f"{path}[{index}]")
    elif isinstance(value, str):
        for char in value:
            if char not in "\n\t" and unicodedata.category(char) in _INVISIBLE:
                name = unicodedata.name(char, "unnamed")
                raise ValueError(
                    f"{path} contains the invisible character U+{ord(char):04X} "
                    f"({name}); remove it and save again"
                )


def check_patch(patch: Any) -> dict[str, Any]:
    """Validate the shape and values of a ``save`` patch; returns it normalized."""
    if not isinstance(patch, dict):
        raise ValueError(
            'save takes one JSON object of changes, e.g. {"topics": {"rank": {}}}'
        )
    _visible(patch, "")
    result: dict[str, Any] = {}
    for name, value in patch.items():
        if name not in PATCH_FIELDS:
            raise ValueError(_unknown_field(name, PATCH_FIELDS, ""))
        if name in ("title", "goal", "journal", "focus"):
            result[name] = _scalar(name, value)
        elif name in ("exam", "path"):
            result[name] = (
                None if value is None else entry(name, value, name, patch=True)
            )
        elif name in NAMESPACE:
            result[name] = _entries(name, _MAP_KINDS[name], value)
        elif name == "arc_change":
            result[name] = entry("arc_change", value, name)
        elif name == "observations":
            if not isinstance(value, list):
                raise ValueError(
                    "observations takes a list of new observations; existing ones "
                    'are never edited: record a new one with "corrects": ["o3"]'
                )
            result[name] = [
                _new_observation(item, f"observations[{index}]")
                for index, item in enumerate(value)
            ]
        else:
            result[name] = preferences.validate(value, name)
            preferences.check_engine(result[name], name)
    return result


def _merged(old: dict[str, Any] | None, change: dict[str, Any]) -> dict[str, Any]:
    result = dict(old or {})
    for name, value in change.items():
        if value is None:
            result.pop(name, None)
        else:
            result[name] = value
    return result


def _patched_review(
    old: dict[str, Any] | None, change: dict[str, Any] | None, today: date
) -> tuple[dict[str, Any] | None, bool]:
    """The merged review and whether the tutor set its date."""
    if change is None:
        return None, False
    review = dict(old or {})
    tutor = False
    if "in_days" in change:
        review["due"] = (today + timedelta(days=change["in_days"])).isoformat()
        tutor = True
    if "due" in change:
        if change["due"] is None:
            review.pop("due", None)
        else:
            review["due"] = change["due"]
            tutor = True
    review = _merged(
        review,
        {name: change[name] for name in ("prompt", "points") if name in change},
    )
    if tutor:
        review["by"] = "tutor"
    elif "due" not in review:
        review.pop("by", None)
    return review or None, tutor


def _patched_topic(
    key: str,
    old: dict[str, Any] | None,
    change: dict[str, Any],
    today: date,
    outcome: PatchResult,
) -> dict[str, Any]:
    plain = {
        name: value
        for name, value in change.items()
        if name not in ("review", "introduced")
    }
    topic = _merged(old, plain)
    previous = old or {}
    if "review" in change:
        review, tutor = _patched_review(previous.get("review"), change["review"], today)
        topic = _merged(topic, {"review": review})
        if tutor:
            outcome.tutor_reviews.append(key)
    if "introduced" in change:
        value = change["introduced"]
        if value is True:
            value = previous.get("introduced", today.isoformat())
        elif value is not None and value > today.isoformat():
            raise ValueError(f"topics.{key}.introduced must not be after today")
        topic = _merged(topic, {"introduced": value})
        if value is not None and value != previous.get("introduced"):
            outcome.introduced.append(key)
    judged = ("gap", "note")
    if any(topic.get(name) != previous.get(name) for name in judged):
        topic["judged"] = today.isoformat()
        outcome.judged.append(key)
    if not any(name in topic for name in judged):
        topic.pop("judged", None)
    return topic


def _unstamped(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if item is None:
        return None
    return {k: v for k, v in item.items() if k not in ("created", "updated")}


def _stamped(
    name: str, old: dict[str, Any] | None, change: dict[str, Any], today: str
) -> dict[str, Any]:
    """Merge a knowledge or task change, stamping the day it last changed."""
    base = _unstamped(old)
    item = _merged(base, change)
    if old is not None and item == base:
        return old
    if name == "tasks":
        item["created"] = (old or {}).get("created", today)
    item["updated"] = today
    return item


def _collision(name: str, key: str, record: dict[str, Any]) -> None:
    for other, label in NAMESPACE.items():
        if key in record[other]:
            raise ValueError(
                f'{name}.{key}: "{key}" already names a {label}; topics, knowledge, '
                "tasks and sources share one namespace, so choose another handle, "
                f'e.g. "{key}-{NAMESPACE[name].split()[0]}"'
            )


def _removals(record: dict[str, Any], changes: dict[str, Any]) -> dict[str, set[str]]:
    """The entries a patch removes, by map; removing an absent handle is an error."""
    removed: dict[str, set[str]] = {}
    for name, label in NAMESPACE.items():
        keys = {key for key, change in changes.get(name, {}).items() if change is None}
        for key in sorted(keys - set(record[name])):
            other = next((NAMESPACE[m] for m in NAMESPACE if key in record[m]), None)
            hint = f'; "{key}" is a {other}' if other else ""
            raise ValueError(
                f'{name}.{key}: there is no {label} "{key}" to remove'
                f"{did_you_mean(key, record[name])}{hint}; it may already have "
                "been removed"
            )
        removed[name] = keys
    return removed


def _merge_maps(
    record: dict[str, Any], changes: dict[str, Any], today: date, outcome: PatchResult
) -> None:
    for name in NAMESPACE:
        for key, change in changes.get(name, {}).items():
            if change is None:
                continue
            old = record[name].get(key)
            if old is None:
                _collision(name, key, record)
            if name == "topics":
                item = _patched_topic(key, old, change, today, outcome)
            elif name in ("sources", "arcs"):
                item = _merged(old, change)
            else:
                item = _stamped(name, old, change, today.isoformat())
            for required in REQUIRED.get(_MAP_KINDS[name], ()):
                if required not in item:
                    raise ValueError(
                        f'{name}.{key} needs "{required}"; remove an entry with '
                        f'"{key}": null'
                    )
            record[name][key] = item


def _check_new(
    item: dict[str, Any],
    path: str,
    record: dict[str, Any],
    tasks: Collection[str],
    today: date,
) -> None:
    if item["date"] > today.isoformat():
        raise ValueError(f"{path}.date must not be after today ({today.isoformat()})")
    _check_topic_list(item["topics"], f"{path}.topics", record["topics"])
    if "chose" in item and item["chose"] not in record["topics"]:
        raise _missing_topic(item["chose"], f"{path}.chose", record["topics"])
    if "task" in item and item["task"] not in tasks:
        raise _missing_task(item["task"], f"{path}.task", tasks)
    if "checkpoint" in item:
        _check_checkpoint(item, f"{path}.checkpoint", record)
    superseded = {
        target
        for stored in record["observations"].values()
        for target in stored.get("corrects", ())
    }
    for target in item.get("corrects", []):
        if target not in record["observations"]:
            raise ValueError(
                f"{path}.corrects: {target!r} is not a recorded observation; "
                f"{_span(record)}"
            )
        if "disputed" in item:
            _check_disputed(record["observations"][target], target, path, superseded)
            continue
        recorded = clock.local_day(record["observations"][target]["recorded"])
        if item["kind"] != "self_report" and recorded < today:
            raise ValueError(
                f"{path}.corrects: {target} was recorded on {recorded.isoformat()}, "
                "and an attempt from an earlier day stands as it was recorded: never "
                "regrade it from a transcript. When the learner says it was wrong, "
                "record their words as a self_report that corrects it; when they "
                "dispute its mark, re-judge it and record the re-marked attempt "
                "with disputed and ruling"
            )
    _check_refs(item, path, record["sources"])


def _check_checkpoint(item: dict[str, Any], path: str, record: dict[str, Any]) -> None:
    """A check item names an arc that holds one of its topics, in a course
    that takes questions."""
    arc, arcs = item["checkpoint"], record["arcs"]
    if record["preferences"].get(preferences.QUESTIONS) == "none":
        raise ValueError(
            f'{path}: this course takes no questions (preferences.questions is "none"),'
            " so it has no arc check; leave checkpoint out"
        )
    if arc not in arcs:
        known = ", ".join(arc_rules.order(record)) or "none"
        raise ValueError(
            f'{path}: no arc "{arc}"{did_you_mean(arc, arcs)}; the arcs are {known}'
        )
    if not any(record["topics"][topic].get("arc") == arc for topic in item["topics"]):
        raise ValueError(
            f'{path}: "{arc}" holds none of {", ".join(item["topics"])}; tag a check '
            "item with the arc it checks"
        )


def _check_disputed(
    target: dict[str, Any], key: str, path: str, superseded: Collection[str]
) -> None:
    """A disputed mark is re-judged on the attempt that stands, from any day:
    the question and the learner's response are in the record."""
    if target["kind"] == "self_report":
        raise ValueError(
            f"{path}.corrects: {key} is a self_report, which has no mark to dispute"
        )
    if key in superseded:
        raise ValueError(
            f"{path}.corrects: {key} was already superseded; re-mark the "
            "observation that corrects it, the mark that stands"
        )


def _default_day(item: dict[str, Any], record: dict[str, Any], today: date) -> str:
    """A correction takes the day of the earliest observation it corrects."""
    stored = record["observations"]
    days = [stored[key]["date"] for key in item.get("corrects", ()) if key in stored]
    return min(days, default=today.isoformat())


def _content(observation: dict[str, Any]) -> dict[str, Any]:
    return {
        name: value
        for name, value in observation.items()
        if name not in ("recorded", "due_topics")
    }


def _append_observations(
    record: dict[str, Any],
    additions: list[dict[str, Any]],
    tasks: Collection[str],
    today: date,
    now: str,
    outcome: PatchResult,
) -> None:
    cutoff = datetime.fromisoformat(now) - DUPLICATE_WINDOW
    sequence = record["next_observation"]
    for index, addition in enumerate(additions):
        path = f"observations[{index}]"
        item = {**addition}
        item.setdefault("date", _default_day(item, record, today))
        _check_new(item, path, record, tasks, today)
        duplicate = next(
            (
                key
                for key, stored in reversed(record["observations"].items())
                if stored["text"] == item["text"]
                and _content(stored) == item
                and datetime.fromisoformat(stored["recorded"]) >= cutoff
            ),
            None,
        )
        if duplicate is not None:
            outcome.duplicates.append(duplicate)
            outcome.saved.append(duplicate)
            continue
        key = f"o{sequence}"
        sequence += 1
        record["observations"][key] = {**item, "recorded": now}
        outcome.observations.append(key)
        outcome.saved.append(key)
    record["next_observation"] = sequence


def _exam_plan(record: dict[str, Any]) -> tuple[Any, ...]:
    """What review dates hang on: the exam day, the course's final-review
    lead and the exam's scope."""
    exam = record.get("exam", {})
    return (
        exam.get("date"),
        record.get("preferences", {}).get(preferences.FINAL_REVIEW_DAYS),
        exam.get("arcs"),
        exam.get("leaves_out"),
    )


def apply_patch(
    record: dict[str, Any], patch: dict[str, Any], *, today: date, now: str
) -> tuple[dict[str, Any], PatchResult]:
    """Apply one ``save`` patch to a validated record; pure.

    Returns the validated new record and what the patch did. ``global_preferences``
    is validated and handed back in the result for the caller to write. New
    topics of a course with arcs come back unplaced, and removed topics' empty
    arcs dropped (``outcome.pruned``) but not yet logged: ``arcs.settle``
    places and logs them in the same save.
    """
    changes = check_patch(patch)
    arc_rules.check_arcless_patch(record, changes)
    outcome = PatchResult(global_preferences=changes.pop("global_preferences", None))
    result = _shallow(record)
    removals = _removals(record, changes)
    removed = removals["topics"]
    if removed:
        blocking = _referencing(record["observations"], removed) + [
            f"observations[{index}]"
            for index, item in enumerate(changes.get("observations", []))
            if removed & _mentions(item)
        ]
        if blocking:
            listed = " ".join(blocking[:12]) + (" ..." if len(blocking) > 12 else "")
            raise ValueError(
                f"topics: cannot remove {', '.join(sorted(removed))} while "
                f"observations {listed} reference it; forget those observations "
                "first (forget HANDLE...), or keep the topic"
            )
    for name, keys in removals.items():
        for key in keys:
            del result[name][key]
    if removed:
        _strip_topics(result, removed)
    for name in ("title", "goal", "journal", "focus"):
        if name in changes:
            if changes[name] is None:
                result.pop(name, None)
            else:
                result[name] = changes[name]
    for name in ("exam", "path"):
        if name in changes:
            merged = (
                None
                if changes[name] is None
                else _merged(result.get(name), changes[name])
            )
            if merged and name == "exam" and "arcs" in changes[name]:
                merged = _merged(
                    merged, {"leaves_out": changes[name].get("leaves_out")}
                )
            if merged:
                result[name] = merged
            else:
                result.pop(name, None)
    _merge_maps(result, changes, today, outcome)
    _held_arcs(result, removals["arcs"], "arcs.{arc}")
    arc_rules.drop(result, removals["arcs"])
    if removed:
        outcome.pruned = arc_rules.prune(result)
    arc_rules.check_exam_patch(record, result, changes.get("exam"))
    if "focus" not in changes and result.get("focus") not in result["tasks"]:
        result.pop("focus", None)
    if "preferences" in changes:
        result["preferences"] = preferences.merge(
            result["preferences"], changes["preferences"]
        )
    tasks = set(record["tasks"]) | set(result["tasks"])
    _append_observations(
        result, changes.get("observations", []), tasks, today, now, outcome
    )
    dropped = sorted(removals["sources"])
    citing = _citations(result, dropped)
    if citing:
        raise ValueError(
            f"sources: cannot remove {', '.join(dropped)} while "
            f"{', '.join(citing[:12])} cite it; change those refs first, or keep "
            "the source"
        )
    outcome.exam_moved = _exam_plan(record) != _exam_plan(result)
    return validate_record(result, placing=True), outcome
