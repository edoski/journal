"""Read projections of the course: resume (the session opener), show and search.

Every projection carries whole stored items, never clipped ones; budgets decide
which items fit. Keys with no content are omitted, so absent means "none".
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection, Iterable, Iterator
from dataclasses import dataclass
from datetime import date
import re
from typing import Any
import unicodedata

from learning import clock, packing, progress, records, schema
from learning import workspace as workspaces
from learning.workspace import Workspace

EVIDENCE_BYTES = 6144
KNOWLEDGE_BYTES = 3072
DUE_LIMIT = progress.DUE_LIMIT
WEAK_LIMIT = 6
TASK_OBSERVATIONS = 5
TOPIC_OBSERVATIONS = 3
OMITTED_LIMIT = 12
RECENT_OBSERVATIONS = 3
# Shown once under ``topics``; due and weak entries for those topics omit them.
TOPIC_DETAIL = frozenset({"title", "prompt", "points", "gap", "last", "choice_errors"})
SHOW_LIMIT = 30
SEARCH_LIMIT = 12
EXCERPT_CHARS = 160
EXCERPT_LEAD = 40
STEM_KEEP = 4
STEM_ENDINGS = frozenset("saeiou")
SEARCH_KINDS = ("topic", "knowledge", "task", "source", "observation")
ITEM_KINDS = {"knowledge": "knowledge", "tasks": "task", "sources": "source"}
_WORD = re.compile(r"[^\W_]+")


# --- shared projections -------------------------------------------------------


def compact(value: dict[str, Any], *, keep: Iterable[str] = ()) -> dict[str, Any]:
    """Drop keys whose value is None or an empty list/object, except ``keep``."""
    kept = set(keep)
    return {
        key: item
        for key, item in value.items()
        if key in kept or (item is not None and item != [] and item != {})
    }


def last_activity(record: dict[str, Any], today: date) -> dict[str, Any] | None:
    """The local day of the last save and how long ago it was."""
    if "updated_at" not in record:
        return None
    day = clock.local_day(record["updated_at"])
    return {"date": day.isoformat(), "days_ago": (today - day).days}


def new_week(record: dict[str, Any], today: date) -> bool:
    """Whether the last save fell in an earlier ISO week than ``today``."""
    if "updated_at" not in record:
        return False
    day = clock.local_day(record["updated_at"])
    return day.isocalendar()[:2] < today.isocalendar()[:2]


def selected_task(
    record: dict[str, Any], task: str | None = None
) -> tuple[str | None, dict[str, Any]]:
    """The requested task, else the focused one, else the only one."""
    tasks = record["tasks"]
    if task is not None:
        if task not in tasks:
            listed = ", ".join(sorted(tasks)) or "none"
            raise ValueError(
                f'--task: unknown task "{task}"{schema.did_you_mean(task, tasks)}; '
                f"open tasks: {listed}"
            )
        return task, tasks[task]
    key = record.get("focus")
    if key is None and len(tasks) == 1:
        key = next(iter(tasks))
    return key, tasks.get(key, {}) if key else {}


def exam(record: dict[str, Any], today: date) -> dict[str, Any] | None:
    """The exam with its countdown."""
    if "exam" not in record:
        return None
    result = dict(record["exam"])
    if "date" in result:
        result["days_left"] = (date.fromisoformat(result["date"]) - today).days
    return result


def _cited(items: Iterable[dict[str, Any]]) -> set[str]:
    return {ref["source"] for item in items for ref in item.get("refs", ())}


def _sources(record: dict[str, Any], items: Iterable[dict[str, Any]]) -> dict[str, Any]:
    cited = _cited(items)
    return {key: record["sources"][key] for key in sorted(cited)}


def _newest(observations: dict[str, Any]) -> list[str]:
    return sorted(
        observations,
        key=lambda key: (observations[key]["date"], schema.number(key)),
        reverse=True,
    )


def _partners(observations: dict[str, Any]) -> dict[str, set[str]]:
    links: dict[str, set[str]] = defaultdict(set)
    for key, item in observations.items():
        for target in item.get("corrects", ()):
            links[key].add(target)
            links[target].add(key)
    return links


def _component(links: dict[str, set[str]], key: str) -> set[str]:
    found = {key}
    pending = [key]
    while pending:
        for linked in links.get(pending.pop(), ()):
            if linked not in found:
                found.add(linked)
                pending.append(linked)
    return found


# --- resume -----------------------------------------------------------------


def _active_topics(
    record: dict[str, Any], task: dict[str, Any], order: list[str]
) -> list[str]:
    topics = record["topics"]
    core = list(task.get("topics", ()))
    if not core and "current" in record.get("path", {}):
        core = [record["path"]["current"]]
    wanted = set(core)
    for key in core:
        wanted.update(topics[key].get("needs", ()))
    return [key for key in order if key in wanted]


def _evidence_keys(
    observations: dict[str, Any], newest: list[str], task: str | None, active: list[str]
) -> list[str]:
    """Selected observations in priority order: the task's, each active topic's, recent."""
    selected: dict[str, None] = {}
    if task is not None:
        work = [key for key in newest if observations[key].get("task") == task]
        selected.update(dict.fromkeys(work[:TASK_OBSERVATIONS]))
    remaining = dict.fromkeys(active, TOPIC_OBSERVATIONS)
    for key in newest:
        if not any(remaining.values()):
            break
        hits = [topic for topic in observations[key]["topics"] if remaining.get(topic)]
        if hits:
            selected.setdefault(key)
            for topic in hits:
                remaining[topic] -= 1
    selected.update(dict.fromkeys(newest[:RECENT_OBSERVATIONS]))
    return list(selected)


def _evidence(
    record: dict[str, Any], task: str | None, active: list[str]
) -> tuple[dict[str, Any], list[str]]:
    """Whole observations with their correction partners, within the byte budget.

    Also returns every eligible observation left out, most relevant first: the
    selected ones that did not fit, then the task's and active topics' older ones.
    """
    observations = record["observations"]
    newest = _newest(observations)
    links = _partners(observations)

    def group(key: str) -> list[tuple[str, Any]]:
        members = _component(links, key) if key in links else {key}
        return [
            (member, {k: v for k, v in observations[member].items() if k != "recorded"})
            for member in members
        ]

    selected = _evidence_keys(observations, newest, task, active)
    packed = packing.pack(map(group, selected), EVIDENCE_BYTES)
    wanted = set(active)
    eligible = [
        *packed.omitted,
        *(
            key
            for key in newest
            if task is not None and observations[key].get("task") == task
        ),
        *(key for key in newest if wanted.intersection(observations[key]["topics"])),
    ]
    omitted = [key for key in dict.fromkeys(eligible) if key not in packed.items]
    return {key: packed.items[key] for key in _newest(packed.items)}, omitted


def _knowledge(
    record: dict[str, Any], active: list[str]
) -> tuple[dict[str, Any], list[str], list[str]]:
    entries = record["knowledge"]
    wanted = set(active)
    pinned = [key for key in sorted(entries) if entries[key].get("pinned")]
    linked = sorted(
        (
            key
            for key in entries
            if key not in pinned and wanted.intersection(entries[key].get("topics", ()))
        ),
        key=lambda key: ("uncertain" not in entries[key], key),
    )
    general = [
        key
        for key in sorted(entries)
        if key not in pinned and "topics" not in entries[key]
    ]
    eligible = pinned + linked + general
    packed = packing.pack(([(key, entries[key])] for key in eligible), KNOWLEDGE_BYTES)
    chosen = set(eligible)
    index = [key for key in sorted(entries) if key not in chosen]
    return packed.items, packed.omitted, index


def _brief(item: dict[str, Any], shown: Collection[str]) -> dict[str, Any]:
    """A due or weak entry; topics detailed under ``topics`` keep only list fields."""
    if item["topic"] not in shown:
        return item
    return {name: value for name, value in item.items() if name not in TOPIC_DETAIL}


def _weak(
    record: dict[str, Any],
    levels: dict[str, dict[str, Any]],
    order: list[str],
    shown: Collection[str],
) -> list[dict[str, Any]]:
    weak = []
    for key in order:
        topic, standing = record["topics"][key], levels[key]
        flags = ("lapsed", "stale", "choice_errors")
        if not ("gap" in topic or any(flag in standing for flag in flags)):
            continue
        item = {"topic": key, "level": standing["level"]}
        if "gap" in topic:
            item["gap"] = topic["gap"]
        for flag in (*flags, "last"):
            if flag in standing:
                item[flag] = standing[flag]
        weak.append(_brief(item, shown))
        if len(weak) == WEAK_LIMIT:
            break
    return weak


def _other_tasks(record: dict[str, Any], selected: str | None) -> list[dict[str, Any]]:
    tasks = record["tasks"]
    keys = sorted(
        (key for key in tasks if key != selected),
        key=lambda key: (tasks[key].get("updated", ""), key),
        reverse=True,
    )
    return [
        compact(
            {
                "key": key,
                "title": tasks[key].get("title"),
                "updated": tasks[key].get("updated"),
            }
        )
        for key in keys
    ]


def _course(record: dict[str, Any], today: date) -> dict[str, Any]:
    return compact(
        {
            "title": record.get("title"),
            "goal": record.get("goal"),
            "exam": exam(record, today),
            "journal": record.get("journal"),
        }
    )


def resume(workspace: Workspace, task: str | None = None) -> dict[str, Any]:
    """The session opener: where the learner is and what to do next."""
    record = records.load(workspace)
    today = clock.today()
    levels = progress.standings(record)
    order = progress.path_order(record)
    key, chosen = selected_task(record, task)
    active = _active_topics(record, chosen, order)
    evidence, left_out = _evidence(record, key, active)
    knowledge, knowledge_omitted, knowledge_index = _knowledge(record, active)
    due = progress.due(record, today, levels=levels, order=order)
    topics = {
        topic: {**record["topics"][topic], "standing": levels[topic]}
        for topic in active
    }
    path = record.get("path", {})
    cited: list[dict[str, Any]] = [
        record.get("exam", {}),
        chosen,
        *topics.values(),
        *evidence.values(),
        *knowledge.values(),
    ]
    result = {
        "today": today.isoformat(),
        "revision": record.get("revision", 0),
        "new_course": True if "revision" not in record else None,
        "course": _course(record, today),
        "last_activity": last_activity(record, today),
        "new_week": True if new_week(record, today) else None,
        "due": [_brief(item, topics) for item in due[:DUE_LIMIT]],
        "due_more": max(0, len(due) - DUE_LIMIT) or None,
        "path": compact(
            {
                "current": path.get("current"),
                "basis": path.get("basis"),
                "topics": [[topic, levels[topic]["level"]] for topic in order],
            }
        )
        if order
        else None,
        "weak": _weak(record, levels, order, topics),
        "task": {"key": key, **chosen} if key else None,
        "tasks": _other_tasks(record, key),
        "topics": topics,
        "evidence": evidence,
        "evidence_omitted": left_out[:OMITTED_LIMIT],
        "evidence_omitted_more": max(0, len(left_out) - OMITTED_LIMIT) or None,
        "knowledge": knowledge,
        "knowledge_omitted": knowledge_omitted,
        "knowledge_index": knowledge_index,
        "sources": _sources(record, cited),
        "preferences": records.effective_preferences(record),
    }
    return compact(result, keep=("task",))


# --- show -------------------------------------------------------------------


def _topic_item(
    record: dict[str, Any], key: str, standing: dict[str, Any], ids: list[str]
) -> dict[str, Any]:
    return compact(
        {
            "kind": "topic",
            **record["topics"][key],
            "standing": standing,
            "observations": ids,
            "tasks": [
                name
                for name, task in record["tasks"].items()
                if key in task.get("topics", ())
            ],
            "knowledge": [
                name
                for name, entry in record["knowledge"].items()
                if key in entry.get("topics", ())
            ],
        }
    )


def show(
    workspace: Workspace, handles: list[str], limit: int = SHOW_LIMIT, all: bool = False
) -> dict[str, Any]:
    """Whole items by handle; ``all`` is the whole record with standings."""
    record = records.load(workspace)
    if all:
        if handles:
            raise ValueError("show --all returns the whole record; give no handles")
        return {
            **record,
            "standings": progress.standings(record),
            "effective_preferences": records.effective_preferences(record),
        }
    if not handles:
        raise ValueError(
            "show needs handles (topics, observations such as o12, knowledge, "
            "tasks or sources), or --all"
        )
    if type(limit) is not int or limit < 1:
        raise ValueError("--limit must be a positive number of observations")
    located = {handle: schema.locate(record, handle) for handle in handles}
    observations = record["observations"]
    levels = progress.standings(record) if "topics" in located.values() else {}
    newest = _newest(observations) if levels else []
    corrected_by: dict[str, list[str]] = defaultdict(list)
    for key, item in observations.items():
        for target in item.get("corrects", ()):
            corrected_by[target].append(key)
    items: dict[str, Any] = {}
    shown: dict[str, None] = {}
    related: set[str] = set()
    for handle, where in located.items():
        if where == "topics":
            ids = [key for key in newest if handle in observations[key]["topics"]]
            items[handle] = _topic_item(record, handle, levels[handle], ids)
            shown.update(dict.fromkeys(ids[:limit]))
            related.update(ids)
        elif where == "observations":
            items[handle] = compact(
                {**observations[handle], "corrected_by": corrected_by.get(handle)}
            )
        else:
            items[handle] = {"kind": ITEM_KINDS[where], **record[where][handle]}
    evidence = {
        key: observations[key]
        for key in _newest({key: observations[key] for key in shown})
        if key not in items
    }
    result = {
        "items": items,
        "evidence": evidence,
        "evidence_more": len(related - shown.keys() - items.keys()) or None,
        "sources": _sources(record, [*items.values(), *evidence.values()]),
    }
    return compact(result)


# --- search -----------------------------------------------------------------


def fold(text: str) -> str:
    """Casefolded text without accents."""
    if text.isascii():
        return text.lower()
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def stem(token: str) -> str:
    """Strip trailing vowels and ``s`` while more than four characters remain."""
    while len(token) > STEM_KEEP and token[-1] in STEM_ENDINGS:
        token = token[:-1]
    return token


def words(text: str) -> list[str]:
    """Folded words: casefolded, without accents, split on non-alphanumerics."""
    return _WORD.findall(fold(text))


def terms(text: str) -> list[str]:
    """Search terms: folded words, lightly stemmed."""
    return [stem(word) for word in words(text)]


def _spans(text: str) -> list[tuple[int, str]]:
    """Each folded word of ``text`` with its start index in the original text."""
    if text.isascii():
        return [
            (match.start(), match.group()) for match in _WORD.finditer(text.lower())
        ]
    folded: list[str] = []
    origin: list[int] = []
    for index, char in enumerate(text):
        piece = fold(char)
        folded.append(piece)
        origin.extend([index] * len(piece))
    return [
        (origin[match.start()], match.group())
        for match in _WORD.finditer("".join(folded))
    ]


def _has_term(found: list[str], term: str) -> bool:
    return any(word.startswith(term) and stem(word) == term for word in found)


def _locate(text: str, query: str) -> int:
    """Where the query phrase, else its first term, starts in ``text``."""
    spans = _spans(text)
    found = [word for _, word in spans]
    phrase = words(query)
    width = len(phrase)
    for index in range(len(found) - width + 1):
        if width and found[index : index + width] == phrase:
            return spans[index][0]
    wanted = set(terms(query))
    return next((start for start, word in spans if stem(word) in wanted), 0)


def excerpt(text: str, query: str) -> str:
    """At most 160 characters of ``text`` around the first match of ``query``."""
    position = _locate(text, query)
    start = max(0, min(position - EXCERPT_LEAD, len(text) - EXCERPT_CHARS + 1))
    room = EXCERPT_CHARS - (1 if start else 0)
    body = text[start : start + room]
    if start + room < len(text):
        body = body[:-1] + "…"
    return ("…" if start else "") + " ".join(body.split())


@dataclass(frozen=True)
class _Document:
    kind: str
    handle: str
    title: str | None
    texts: tuple[str, ...]


def _values(item: dict[str, Any], names: Iterable[str]) -> list[str]:
    values: list[str] = []
    for name in names:
        value = item.get(name)
        if isinstance(value, str):
            values.append(value)
        elif isinstance(value, list):
            values.extend(value)
    return values


def _documents(record: dict[str, Any]) -> Iterator[_Document]:
    for key in sorted(record["topics"]):
        topic = record["topics"][key]
        texts = _values(topic, ("title", "aliases", "gap", "note"))
        texts += _values(topic.get("review", {}), ("prompt",))
        yield _Document("topic", key, topic.get("title"), (*texts, key))
    for key in sorted(record["knowledge"]):
        entry = record["knowledge"][key]
        texts = _values(entry, ("text", "aliases", "uncertain"))
        yield _Document("knowledge", key, None, (*texts, key))
    for key in sorted(record["tasks"]):
        task = record["tasks"][key]
        texts = _values(task, ("title", "goal", "step", "help", "note"))
        yield _Document("task", key, task.get("title"), (*texts, key))
    for key in sorted(record["sources"]):
        source = record["sources"][key]
        texts = _values(source, ("title", "path"))
        yield _Document("source", key, source.get("title"), (*texts, key))
    observations = record["observations"]
    for key in _newest(observations):
        texts = _values(observations[key], ("text", "response", "help", "uncertain"))
        yield _Document("observation", key, None, tuple(texts))


def _hits(
    record: dict[str, Any], query: str
) -> Iterator[tuple[tuple[int, int, int], dict[str, Any]]]:
    """Documents holding every query term; whole-word phrase matches rank first."""
    phrase = f" {' '.join(words(query))} "
    wanted = list(dict.fromkeys(terms(query)))
    if not wanted:
        return
    for index, document in enumerate(_documents(record)):
        fields = [(text, words(text)) for text in document.texts]
        matched = next(
            (text for text, found in fields if phrase in f" {' '.join(found)} "),
            None,
        )
        is_phrase = matched is not None
        if matched is None:
            present = [
                {term for term in wanted if _has_term(found, term)}
                for _, found in fields
            ]
            if set().union(*present) != set(wanted):
                continue
            matched = next(
                text for (text, _), held in zip(fields, present) if wanted[0] in held
            )
        hit = compact(
            {
                "kind": document.kind,
                "handle": document.handle,
                "title": document.title,
                "excerpt": excerpt(matched, query),
            }
        )
        rank = (0 if is_phrase else 1, SEARCH_KINDS.index(document.kind), index)
        yield rank, hit


def every_course(workspace: Workspace | None) -> list[Workspace]:
    """Registered workspaces with a course, plus the selected one, by directory.

    A selected workspace outside the registry, such as a private session over
    registered material, stands in for the workspaces that study that material.
    """
    chosen = {str(item.directory): item for item in workspaces.registered()}
    if workspace is not None and str(workspace.directory) not in chosen:
        chosen = {
            key: item
            for key, item in chosen.items()
            if item.sources != workspace.sources
        }
        chosen[str(workspace.directory)] = workspace
    return [chosen[key] for key in sorted(chosen) if chosen[key].record.is_file()]


def _searched(
    workspace: Workspace | None, everywhere: bool
) -> Iterator[tuple[Workspace, dict[str, Any] | None, str | None]]:
    if not everywhere:
        assert workspace is not None
        yield workspace, records.load(workspace), None
        return
    for candidate in every_course(workspace):
        try:
            yield candidate, records.load(candidate), None
        except (ValueError, OSError) as error:
            yield candidate, None, str(error)


def search(
    workspace: Workspace | None,
    query: str,
    limit: int = SEARCH_LIMIT,
    everywhere: bool = False,
) -> dict[str, Any]:
    """Lexical discovery in this course or, with ``everywhere``, every course."""
    if not isinstance(query, str) or not query.strip():
        raise ValueError("search needs a nonempty query")
    if type(limit) is not int or limit < 1:
        raise ValueError("--limit must be a positive number of hits")
    ranked: list[tuple[tuple[int, int, int, int], dict[str, Any]]] = []
    errors = []
    for position, (candidate, record, error) in enumerate(
        _searched(workspace, everywhere)
    ):
        if record is None:
            errors.append({"workspace": str(candidate.directory), "error": error})
            continue
        for (phrase, kind, index), hit in _hits(record, query):
            if everywhere:
                hit = compact(
                    {
                        **hit,
                        "workspace": str(candidate.directory),
                        "course": record.get("title"),
                    }
                )
            ranked.append(((phrase, kind, position, index), hit))
    ranked.sort(key=lambda pair: pair[0])
    result: dict[str, Any] = {
        "hits": [hit for _, hit in ranked[:limit]],
        "total": len(ranked),
    }
    if errors:
        result["errors"] = errors
    return result
