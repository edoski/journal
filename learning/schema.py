"""The course record (schema 6): field sets, handles, validation and the patch rule.

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

from learning import preferences

SCHEMA = 6
HANDLE = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")
OBSERVATION_ID = re.compile(r"o[1-9][0-9]*")
RESERVED = re.compile(r"o[0-9]+")
DAY = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
KINDS = ("attempt", "exam", "self_report")
RESULTS = ("correct", "partial", "incorrect")
REVIEWERS = ("engine", "tutor")
UNAIDED = "none"
DUPLICATE_WINDOW = timedelta(hours=24)
MAX_REVIEW_DAYS = 3650
HANDLE_RULE = (
    "handles are 1-64 lowercase letters, digits, '_' or '-' starting with a "
    "letter or digit"
)

# Topics, knowledge, tasks and sources share one handle namespace.
NAMESPACE = {
    "sources": "source",
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
    "topics",
    "observations",
    "knowledge",
    "tasks",
    "focus",
    "path",
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
    "topics",
    "observations",
    "knowledge",
    "tasks",
    "focus",
    "path",
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
_INTRODUCED = "introduced"
_REVIEW = "review"
_BY = "by"
_STAMP = "stamp"

FIELDS: dict[str, dict[str, str]] = {
    "exam": {
        "date": _DAY,
        "format": _TEXT,
        "coverage": _TEXT,
        "criteria": _TEXTS,
        "constraints": _TEXTS,
        "unknowns": _TEXTS,
        "refs": _REFS,
    },
    "source": {"path": _TEXT, "title": _TEXT},
    "topic": {
        "title": _TEXT,
        "needs": _HANDLES,
        "refs": _REFS,
        "aliases": _TEXTS,
        "introduced": _INTRODUCED,
        "gap": _TEXT,
        "note": _TEXT,
        "review": _REVIEW,
    },
    "review": {"due": _DAY, "prompt": _TEXT},
    "observation": {
        "kind": _KIND,
        "topics": _HANDLES,
        "text": _TEXT,
        "response": _TEXT,
        "help": _HELP,
        "result": _RESULT,
        "transfer": _FLAG,
        "date": _DAY,
        "task": _HANDLE,
        "refs": _REFS,
        "corrects": _IDS,
        "uncertain": _TEXT,
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
    "path": {"current": _HANDLE, "order": _HANDLES, "basis": _TEXT},
    "ref": {"source": _HANDLE, "locator": _TEXT},
}
HELPERS: dict[str, dict[str, str]] = {
    "topic": {"judged": _DAY},
    "review": {"by": _BY},
    "observation": {"recorded": _STAMP},
    "knowledge": {"updated": _DAY},
    "task": {"created": _DAY, "updated": _DAY},
}
REQUIRED: dict[str, tuple[str, ...]] = {
    "source": ("path",),
    "observation": ("kind", "topics", "text", "date", "recorded"),
    "knowledge": ("text",),
    "ref": ("source",),
}
_REVIEW_PATCH = {"due": _DAY, "in_days": "in_days", "prompt": _TEXT}
_MAP_KINDS = {
    "sources": "source",
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
    by: str


class Topic(TypedDict, total=False):
    title: str
    needs: list[str]
    refs: list[Reference]
    aliases: list[str]
    introduced: str
    gap: str
    note: str
    judged: str
    review: Review


class Observation(TypedDict, total=False):
    kind: str
    topics: list[str]
    text: str
    response: str
    help: str
    result: str
    transfer: bool
    date: str
    task: str
    refs: list[Reference]
    corrects: list[str]
    uncertain: str
    recorded: str


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
    format: str
    coverage: str
    criteria: list[str]
    constraints: list[str]
    unknowns: list[str]
    refs: list[Reference]


class CoursePath(TypedDict, total=False):
    current: str
    order: list[str]
    basis: str


SHAPES: dict[str, type] = {
    "exam": Exam,
    "source": Source,
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
    tutor_reviews: list[str] = field(default_factory=list)
    introduced: list[str] = field(default_factory=list)
    judged: list[str] = field(default_factory=list)
    global_preferences: dict[str, str | None] | None = None


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
    _INTRODUCED: _introduced,
    _REVIEW: _review,
    _BY: _choice(REVIEWERS),
    _STAMP: _stamp,
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
            raise ValueError(_unknown_field(name, allowed, path))
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
    return result


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
    else:
        given = [name for name in ("result", "help", "transfer") if name in observation]
        if given:
            raise ValueError(
                f"{path}: a self_report is the learner's own statement and takes "
                f"no {', '.join(given)}; record what they did as an attempt"
            )
    if observation.get("transfer") and observation.get("result") != "correct":
        raise ValueError(f'{path}.transfer is allowed only with result "correct"')


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
    for key, topic in topics.items():
        path = f"topics.{key}"
        needs = topic.get("needs", [])
        if key in needs:
            raise ValueError(f"{path}.needs must not include the topic itself")
        _check_topic_list(needs, f"{path}.needs", topics)
        _check_refs(topic, path, sources)
    for name in ("knowledge", "tasks"):
        for key, item in record[name].items():
            _check_topic_list(item.get("topics", []), f"{name}.{key}.topics", topics)
            _check_refs(item, f"{name}.{key}", sources)
    observations = record["observations"]
    for key, item in observations.items():
        path = f"observations.{key}"
        _check_topic_list(item["topics"], f"{path}.topics", topics)
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


def validate_record(record: Any) -> dict[str, Any]:
    """Check a whole stored course record and return its canonical form."""
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
    for name, kind in (("sources", "source"), ("topics", "topic")):
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
    return result


# --- handle lookup ----------------------------------------------------------

LOOKUP = ("topics", "observations", "knowledge", "tasks", "sources")


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
        "topics, knowledge entries, tasks, sources and observations (o12)"
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
    """Remove topic handles from needs, the path, and knowledge/task topics."""
    for name, field_name in (
        ("topics", "needs"),
        ("knowledge", "topics"),
        ("tasks", "topics"),
    ):
        record[name] = {
            key: _without(item, field_name, removed)
            for key, item in record[name].items()
        }
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
    for name in ("topics", "observations", "knowledge", "tasks"):
        for key, item in record[name].items():
            if any(ref["source"] in cited for ref in _refs_in(item)):
                paths.append(key if name == "observations" else f"{name}.{key}")
    return paths


def _referencing(observations: dict[str, Any], topics: Collection[str]) -> list[str]:
    wanted = set(topics)
    return [key for key, item in observations.items() if wanted & set(item["topics"])]


def _shallow(record: dict[str, Any]) -> dict[str, Any]:
    result = dict(record)
    for name in (*NAMESPACE, "observations", "preferences"):
        result[name] = dict(record[name])
    return result


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


def check_patch(patch: Any) -> dict[str, Any]:
    """Validate the shape and values of a ``save`` patch; returns it normalized."""
    if not isinstance(patch, dict):
        raise ValueError(
            'save takes one JSON object of changes, e.g. {"topics": {"rank": {}}}'
        )
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
    if "prompt" in change:
        review = _merged(review, {"prompt": change["prompt"]})
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
            elif name == "sources":
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
    if "task" in item and item["task"] not in tasks:
        raise _missing_task(item["task"], f"{path}.task", tasks)
    for target in item.get("corrects", []):
        if target not in record["observations"]:
            raise ValueError(
                f"{path}.corrects: {target!r} is not a recorded observation; "
                f"{_span(record)}"
            )
    _check_refs(item, path, record["sources"])


def _content(observation: dict[str, Any]) -> dict[str, Any]:
    return {name: value for name, value in observation.items() if name != "recorded"}


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
        item.setdefault("date", today.isoformat())
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
            continue
        key = f"o{sequence}"
        sequence += 1
        record["observations"][key] = {**item, "recorded": now}
        outcome.observations.append(key)
    record["next_observation"] = sequence


def apply_patch(
    record: dict[str, Any], patch: dict[str, Any], *, today: date, now: str
) -> tuple[dict[str, Any], PatchResult]:
    """Apply one ``save`` patch to a validated record; pure.

    Returns the validated new record and what the patch did. ``global_preferences``
    is validated and handed back in the result for the caller to write.
    """
    changes = check_patch(patch)
    outcome = PatchResult(global_preferences=changes.pop("global_preferences", None))
    result = _shallow(record)
    removals = _removals(record, changes)
    removed = removals["topics"]
    if removed:
        blocking = _referencing(record["observations"], removed) + [
            f"observations[{index}]"
            for index, item in enumerate(changes.get("observations", []))
            if removed & set(item["topics"])
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
            if merged:
                result[name] = merged
            else:
                result.pop(name, None)
    _merge_maps(result, changes, today, outcome)
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
    return validate_record(result), outcome
