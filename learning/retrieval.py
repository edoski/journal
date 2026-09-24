"""Bounded, whole-item retrieval: catalog, resume, search, knowledge and evidence."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterator
from pathlib import Path
import re
from typing import Any
import unicodedata

from learning.briefing import briefing
from learning.observations import correction_links, expand_corrections
from learning.packing import pack, size
from learning.records import read
from learning.schema import links, route_parts, source_ids, task_parts
from learning.storage import RevisionConflict

AUTOMATIC_KNOWLEDGE_BYTES = 4096
EXACT_KNOWLEDGE_BYTES = 8192
DISCOVERY_BYTES = 4096
AUTOMATIC_EVIDENCE_BYTES = 12288
AUTOMATIC_OBSERVATIONS = 24
INDEX_PAGE = 20
CANDIDATE_PAGE = 8
IDENTITY_FIELDS = (
    "title",
    "aliases",
    "focus",
    "current_task",
    "journal_activity",
    "status",
)


def _number(handle: str) -> int:
    return int(handle[1:])


def _load(root: Path, scope: str, expected: int | None) -> dict[str, Any]:
    record = read(root, scope)
    assert isinstance(record, dict)
    if expected is not None and record["revision"] != expected:
        raise RevisionConflict(
            f"revision conflict for {scope}: expected {expected}, found {record['revision']}"
        )
    return record


def _paging(
    offset: int, limit: int | None, expected: int | None, candidate_offset: int = 0
) -> None:
    if (
        type(offset) is not int
        or offset < 0
        or type(candidate_offset) is not int
        or candidate_offset < 0
        or (limit is not None and (type(limit) is not int or limit < 1))
    ):
        raise ValueError("offset must be nonnegative and limit must be positive")
    if expected is not None and (type(expected) is not int or expected < 0):
        raise ValueError("expected revision must be a nonnegative integer")
    if (offset or candidate_offset) and expected is None:
        raise ValueError("continued pages require an expected revision")


def _evidence_budget(value: int | None) -> None:
    if value is not None and (type(value) is not int or value < 2):
        raise ValueError("evidence_budget must be at least 2 bytes")


# --- knowledge --------------------------------------------------------------


def _knowledge_sources(
    record: dict[str, Any], entries: dict[str, Any], available: dict[str, Any]
) -> dict[str, Any]:
    handles = {key for entry in entries.values() for key in source_ids(entry)}
    return {
        key: {
            field: value
            for field, value in record["sources"][key].items()
            if field in {"path", "version"}
        }
        for key in sorted(handles - available.keys())
    }


def knowledge_context(
    record: dict[str, Any],
    active_topics: list[str],
    available_sources: dict[str, Any] | None = None,
    *,
    budget: int = AUTOMATIC_KNOWLEDGE_BYTES,
) -> dict[str, Any]:
    """Select whole relevant entries, counting newly needed source locations once."""
    active = set(active_topics)
    stored = record.get("knowledge", {})
    related = sorted(
        key
        for key, entry in stored.items()
        if active.intersection(entry.get("topics", []))
    )
    general = sorted(key for key, entry in stored.items() if not entry.get("topics"))
    eligible = sorted(
        related + general,
        key=lambda key: (
            key not in related,
            not any(
                stored[key].get(name)
                for name in ("uncertainty", "conflicts", "attribution")
            ),
            key,
        ),
    )
    available = available_sources or {}

    def render(keys: list[str]) -> dict[str, Any]:
        entries = {key: stored[key] for key in keys}
        return {
            "knowledge": entries,
            "selection": {
                "eligible": len(eligible),
                "included": len(keys),
                "omitted": len(eligible) - len(keys),
            },
            "sources": _knowledge_sources(record, entries, available),
        }

    envelope = size(render([]))
    if type(budget) is not int or budget < envelope:
        raise ValueError("knowledge budget must fit the selection envelope")
    total = sum(size(stored[key]) + size(key) + 2 for key in eligible) + envelope
    reserve = min(1024, budget // 3) if total > budget else 0
    _, omitted, result = pack(eligible, max(budget - reserve, envelope), render)
    if not omitted:
        return result
    descriptors = [{"key": key, "bytes": size(stored[key])} for key in omitted[:8]]

    def with_omissions(items: list[dict[str, Any]]) -> dict[str, Any]:
        selection = {
            **result["selection"],
            "omissions": items,
            "remaining": len(omitted) - len(items),
            "expand": "knowledge SCOPE KEY... reads whole entries",
        }
        return {**result, "selection": selection}

    try:
        return pack(descriptors, budget, with_omissions)[2]
    except ValueError:
        return result


def _knowledge_index(
    record: dict[str, Any], scope: str, offset: int, limit: int | None
) -> dict[str, Any]:
    stored = record.get("knowledge", {})
    ordered = sorted(stored)
    if offset > len(ordered):
        raise ValueError("offset exceeds knowledge entry count")
    total = len(ordered)
    window = ordered[offset : offset + (INDEX_PAGE if limit is None else limit)]
    descriptors = [{"key": key, "bytes": size(stored[key])} for key in window]

    def render(items: list[dict[str, Any]]) -> dict[str, Any]:
        next_offset = offset + len(items)
        return {
            "scope": scope,
            "revision": record["revision"],
            "digest": record["digest"],
            "knowledge_index": items,
            "selection": {
                "mode": "knowledge_index",
                "total": total,
                "returned": len(items),
                "offset": offset,
                "next_offset": None if next_offset == total else next_offset,
                "complete": next_offset == total,
            },
        }

    kept, _, result = pack(descriptors, DISCOVERY_BYTES, render, contiguous=True)
    if window and not kept:
        raise ValueError("knowledge index descriptor exceeds discovery byte budget")
    return result


def knowledge(
    root: Path,
    scope: str,
    keys: list[str],
    *,
    offset: int = 0,
    limit: int | None = None,
    budget: int | None = None,
    expected: int | None = None,
) -> dict[str, Any]:
    """Whole selected entries, or a paged handle index when ``keys`` is empty."""
    _paging(offset, limit, expected)
    if keys:
        if offset or limit is not None:
            raise ValueError("exact knowledge reads cannot use offset or limit")
    elif limit is not None and limit > INDEX_PAGE:
        raise ValueError(f"knowledge index limit must not exceed {INDEX_PAGE}")
    if budget is not None and (not keys or type(budget) is not int or budget < 1):
        raise ValueError(
            "budget must be positive and applies only to exact knowledge reads"
        )
    record = _load(root, scope, expected)
    stored = record.get("knowledge", {})
    if not keys:
        return _knowledge_index(record, scope, offset, limit)
    links(keys, stored, "knowledge")
    entries = {key: stored[key] for key in sorted(set(keys))}
    result = {
        "scope": scope,
        "revision": record["revision"],
        "digest": record["digest"],
        "knowledge": entries,
        "sources": _knowledge_sources(record, entries, {}),
    }
    required = size(result)
    allowance = EXACT_KNOWLEDGE_BYTES if budget is None else budget
    if required > allowance:
        sizes = ", ".join(f"{key}={size(entry)}" for key, entry in entries.items())
        raise ValueError(
            f"knowledge read requires {required} bytes (budget {allowance}); entries: {sizes}; "
            f"fetch fewer entries or set --budget {required}"
        )
    return result


# --- lexical matching -------------------------------------------------------


def _excerpt(text: str, needle: str) -> str:
    # Split only at Unicode boundaries; descriptors are never editable originals.
    folded_position = text.casefold().find(needle)
    position = 0
    folded_length = 0
    for position, character in enumerate(text):
        folded_length += len(character.casefold())
        if folded_length > folded_position:
            break
    start = max(0, position - 40)
    body = text[start:]
    prefix = "…" if start else ""
    encoded = (prefix + body).encode("utf-8")
    if len(encoded) <= 256:
        return prefix + body
    return encoded[:253].decode("utf-8", errors="ignore") + "…"


def _tokens(text: str) -> set[str]:
    normalized = unicodedata.normalize("NFKD", text.casefold())
    return set(
        re.findall(
            r"[^\W_]+",
            "".join(c for c in normalized if not unicodedata.combining(c)),
        )
    )


def _match(texts: list[str], query: str) -> str | None:
    """Match phrases or reordered words, including explicit stored aliases."""
    needle = query.casefold()
    exact = next((text for text in texts if needle in text.casefold()), None)
    if exact is not None:
        return exact
    wanted = _tokens(query)
    if wanted and wanted <= {token for text in texts for token in _tokens(text)}:
        return next((text for text in texts if wanted & _tokens(text)), texts[0])
    return None


def _strings(value: Any) -> Iterator[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def _discovery_collections(record: dict[str, Any], scope: str) -> dict[str, Any]:
    return {
        "knowledge": record.get("knowledge", {}),
        "topic": {
            key: {
                name: value
                for name, value in item.items()
                if name not in {"assessment", "review"}
            }
            for key, item in record.get("topics", {}).items()
        },
        "scope": {
            scope: {
                key: record[key]
                for key in ("title", "aliases", "goal", "coverage", "course_context")
                if key in record
            }
        },
    }


def discover(root: Path, query: str, *, limit: int = 8) -> dict[str, Any]:
    """Find cross-course handles deliberately; never transfer evidence or policy."""
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a nonempty string")
    if type(limit) is not int or not 1 <= limit <= 20:
        raise ValueError("discovery limit must be between 1 and 20")
    catalog = read(root, None)
    assert isinstance(catalog, list)
    matches: list[dict[str, Any]] = []
    errors = []
    for entry in catalog:
        if "error" in entry:
            errors.append(entry["scope"])
            continue
        scope = entry["scope"]
        try:
            record = read(root, scope)
        except (ValueError, OSError):
            errors.append(scope)
            continue
        assert isinstance(record, dict)
        for kind, collection in _discovery_collections(record, scope).items():
            for key, value in sorted(collection.items()):
                if _match([key, *_strings(value)], query) is not None:
                    matches.append(
                        {
                            "scope": scope,
                            "revision": record["revision"],
                            "kind": kind,
                            "key": key,
                        }
                    )
    items, _, _ = pack(
        matches[:limit], DISCOVERY_BYTES - 512, lambda kept: kept, contiguous=True
    )
    return {
        "items": items,
        "total": len(matches),
        "complete": len(items) == len(matches) and not errors,
        "discovery_only": True,
        "unreadable_scopes": errors[:8],
        "additional_unreadable_scopes": max(0, len(errors) - 8),
    }


def _candidates(
    record: dict[str, Any], scope: str, query: str, offset: int
) -> dict[str, Any]:
    collections = {
        **_discovery_collections(record, scope),
        "source": record.get("sources", {}),
        "task": record.get("tasks", {}),
    }
    matches = []
    for kind, entities in sorted(collections.items()):
        for key, value in sorted(entities.items()):
            matched = _match([key, *_strings(value)], query)
            if matched is not None:
                matches.append(
                    {
                        "kind": kind,
                        "key": key,
                        "excerpt": _excerpt(matched, query.casefold()),
                        "discovery_only": True,
                    }
                )
    total = len(matches)
    if offset > total:
        raise ValueError("candidate offset exceeds candidate count")
    window = matches[offset : offset + CANDIDATE_PAGE]

    def render(items: list[dict[str, Any]]) -> dict[str, Any]:
        next_offset = offset + len(items)
        return {
            "candidates": {
                "items": items,
                "offset": offset,
                "total": total,
                "next_offset": None if next_offset == total else next_offset,
                "complete": next_offset == total,
            }
        }

    kept, _, result = pack(window, DISCOVERY_BYTES, render, contiguous=True)
    if window and not kept:
        raise ValueError("candidate descriptor exceeds discovery byte budget")
    page: dict[str, Any] = result["candidates"]
    return page


# --- evidence ---------------------------------------------------------------


def _topic_index(record: dict[str, Any]) -> dict[str, Any]:
    fields = {
        "title",
        "aliases",
        "tags",
        "concepts",
        "domains",
        "parent",
        "prerequisites",
        "refs",
        "source",
    }
    counts = Counter(
        topic
        for observation in record.get("observations", {}).values()
        for topic in observation["topics"]
    )
    return {
        key: {
            **{name: value for name, value in topic.items() if name in fields},
            "observation_count": counts[key],
        }
        for key, topic in record.get("topics", {}).items()
    }


def correction_group(
    record: dict[str, Any], observation_ids: list[str]
) -> dict[str, Any]:
    """Return selected observations together with their complete correction links."""
    stored = record.get("observations", {})
    links(observation_ids, stored, "observations")
    group = expand_corrections(correction_links(stored), observation_ids)
    return {key: stored[key] for key in sorted(group, key=_number)}


def select_evidence(
    record: dict[str, Any],
    observation_ids: list[str],
    *,
    topics: dict[str, Any] | None = None,
    budget: int | None = AUTOMATIC_EVIDENCE_BYTES,
) -> dict[str, Any]:
    """Fit complete correction/support groups, exposing every omitted selection."""
    _evidence_budget(budget)
    stored = record.get("observations", {})
    linked = correction_links(stored)
    visible_topics = {key: dict(value) for key, value in (topics or {}).items()}
    groups: list[tuple[dict[str, Any], set[str]]] = []
    for topic, value in visible_topics.items():
        for field in ("assessment", "review"):
            decision = value.get(field)
            if decision is not None:
                group = expand_corrections(linked, decision.get("observations", []))
                groups.append(({"topic": topic, "field": field}, group))
    for key in observation_ids:
        groups.append(({"observation": key}, expand_corrections(linked, [key])))

    def render(selected: list[tuple[dict[str, Any], set[str]]]) -> dict[str, Any]:
        handles: set[str] = (
            set().union(*(group for _, group in selected)) if selected else set()
        )
        return {key: stored[key] for key in sorted(handles, key=_number)}

    _, omitted, items = pack(
        groups, budget, render, error="evidence_budget must be at least 2 bytes"
    )
    omissions = []
    for descriptor, group in omitted:
        if "topic" in descriptor:
            visible_topics[descriptor["topic"]].pop(descriptor["field"])
        omissions.append(
            {**descriptor, "bytes": size({key: stored[key] for key in group})}
        )
    selection: dict[str, Any] = {
        "complete": not omitted,
        "budget": budget,
        "bytes": size(items),
        "omitted_groups": len(omitted),
        "omissions": omissions[:8],
        "additional_omissions": max(0, len(omissions) - 8),
    }
    if omitted:
        selection["expand"] = (
            "evidence SCOPE --observations HANDLES reads whole groups; a larger --evidence-budget keeps more"
        )
    return {"observations": items, "topics": visible_topics, "selection": selection}


def _select_task(
    record: dict[str, Any], task: str | None
) -> tuple[str | None, dict[str, Any]]:
    tasks = record.get("tasks", {})
    if task is not None:
        links([task], tasks, "task")
        return task, tasks[task]
    selected = record.get("current_task")
    if selected is None and len(tasks) == 1:
        selected = next(iter(tasks))
    return selected, tasks.get(selected, {}) if selected else {}


def _activity(
    record: dict[str, Any], checkpoint: dict[str, Any], active_topics: list[str]
) -> tuple[set[str], set[str], set[str]]:
    """Topics and evidence linked to the selected activity and the route position."""
    parts = task_parts(checkpoint, active_only=True)
    route = record.get("route")
    route_active = route_parts(route, active_only=True) if route else []
    context_topics = {key for part in parts for key in part.get("topics", [])}
    context_observations = set(checkpoint.get("observations", []))
    context_observations.update(
        key for part in parts for key in part.get("observations", [])
    )
    knowledge_topics = set(active_topics) | context_topics
    knowledge_topics.update(
        key for part in route_active for key in part.get("topics", [])
    )
    stored_topics = record.get("topics", {})
    knowledge_topics.update(
        prerequisite
        for key in list(knowledge_topics)
        for prerequisite in stored_topics.get(key, {}).get("prerequisites", [])
    )
    return context_topics, context_observations, knowledge_topics


def _sources(
    record: dict[str, Any],
    checkpoint: dict[str, Any],
    items: dict[str, Any],
    topics: dict[str, Any],
) -> dict[str, Any]:
    selected = set(source_ids(record))
    for field in ("course_context", "coverage"):
        if isinstance(record.get(field), dict):
            selected.update(source_ids(record[field]))
    for part in (checkpoint, *task_parts(checkpoint, active_only=True)):
        selected.update(source_ids(part))
    route = record.get("route")
    if route:
        for part in route_parts(route, active_only=True):
            selected.update(source_ids(part))
    for value in [*items.values(), *topics.values()]:
        selected.update(source_ids(value))
    return {
        key: value
        for key, value in record.get("sources", {}).items()
        if key in selected
    }


def _assemble(
    record: dict[str, Any],
    scope: str,
    *,
    mode: str,
    task_id: str | None,
    checkpoint: dict[str, Any],
    active_topics: list[str],
    topics: list[str] | None,
    observations: list[str] | None,
    seeds: list[str],
    page_limit: int | None,
    offset: int,
    order: str,
    budget: int | None,
    query: str | None = None,
    candidate_offset: int = 0,
    exhausted: bool = False,
    knowledge_budget: int | None = None,
    orientation: bool = False,
) -> dict[str, Any]:
    stored = record.get("observations", {})
    stored_topics = record.get("topics", {})
    total = len(seeds)
    if offset > total:
        raise ValueError("offset exceeds selected observation count")
    page = seeds[offset : None if page_limit is None else offset + page_limit]
    context_topics, context_observations, knowledge_topics = _activity(
        record, checkpoint, active_topics
    )
    expanded = expand_corrections(correction_links(stored), page)
    selected_topics = set(topics or []) | set(active_topics)
    selected_topics.update(checkpoint.get("topics", []))
    if orientation:
        selected_topics |= context_topics
    for key in expanded:
        selected_topics.update(stored[key]["topics"])
    relevant_topics = (
        {}
        if exhausted
        else {
            key: value for key, value in stored_topics.items() if key in selected_topics
        }
    )
    bounded = select_evidence(record, page, topics=relevant_topics, budget=budget)
    items = bounded["observations"]
    next_offset = offset + len(page)
    evidence_selection = {
        **bounded["selection"],
        "total": total,
        "returned": len(items),
        "offset": offset,
        "next_offset": None if next_offset == total else next_offset,
        "complete": next_offset == total and bounded["selection"]["complete"],
        "scope_complete": len(items) == len(stored),
        "omitted_observations": len(set(seeds) - items.keys()),
        "order": order,
        "expanded": [key for key in items if key not in page],
    }
    result: dict[str, Any] = {
        "scope": scope,
        "revision": record["revision"],
        "digest": record["digest"],
        "updated_at": record.get("updated_at"),
        **{field: record[field] for field in IDENTITY_FIELDS if field in record},
        "task": {"id": task_id, **checkpoint} if task_id else None,
        "task_index": {
            key: {field: value[field] for field in ("task", "topics") if field in value}
            for key, value in record.get("tasks", {}).items()
        },
        "topics": bounded["topics"],
        "sources": _sources(
            record, checkpoint if orientation else {}, items, bounded["topics"]
        ),
        "observations": items,
    }
    selection: dict[str, Any] = {
        "mode": mode,
        "task": task_id,
        "active_topics": list(active_topics),
        "topics": topics,
        "observations": observations,
        "query": query,
        "context_topics": sorted(context_topics) if orientation else [],
        "context_observations": sorted(context_observations, key=_number)
        if orientation
        else [],
        "evidence": evidence_selection,
    }
    if orientation:
        chosen = knowledge_context(
            record,
            sorted(knowledge_topics),
            result["sources"],
            budget=AUTOMATIC_KNOWLEDGE_BYTES
            if knowledge_budget is None
            else knowledge_budget,
        )
        result["sources"].update(chosen.pop("sources"))
        result["knowledge"] = chosen["knowledge"]
        selection["knowledge"] = chosen["selection"]
        result["briefing"] = briefing(
            record, checkpoint, sorted(set(active_topics) | context_topics)
        )
    if query is not None:
        result["candidates"] = _candidates(record, scope, query, candidate_offset)
    result["selection"] = selection
    result["policy_topics"] = {key: stored_topics[key] for key in active_topics}
    return result


def resume(
    root: Path,
    scope: str,
    *,
    task: str | None = None,
    knowledge_budget: int | None = None,
    evidence_budget: int | None = None,
) -> dict[str, Any]:
    """Ordinary continuation: task, briefing, linked and recent evidence, knowledge."""
    _evidence_budget(evidence_budget)
    if knowledge_budget is not None and (
        type(knowledge_budget) is not int or knowledge_budget < 1
    ):
        raise ValueError("knowledge_budget must be a positive integer")
    record = _load(root, scope, None)
    task_id, checkpoint = _select_task(record, task)
    active_topics = (
        list(checkpoint.get("topics", [])) if task_id else list(record.get("focus", []))
    )
    stored = record.get("observations", {})
    context_topics, context_observations, _ = _activity(
        record, checkpoint, active_topics
    )
    wanted = set(active_topics) | context_topics
    seeds = {key for key, item in stored.items() if wanted.intersection(item["topics"])}
    seeds.update(context_observations)
    ordered = sorted(seeds, key=_number, reverse=True)
    ordered = [key for key in ordered if key in context_observations] + [
        key for key in ordered if key not in context_observations
    ]
    return _assemble(
        record,
        scope,
        mode="task" if task_id else "focus",
        task_id=task_id,
        checkpoint=checkpoint,
        active_topics=active_topics,
        topics=None,
        observations=None,
        seeds=ordered,
        page_limit=AUTOMATIC_OBSERVATIONS,
        offset=0,
        order="task_links_then_newest",
        budget=AUTOMATIC_EVIDENCE_BYTES if evidence_budget is None else evidence_budget,
        knowledge_budget=knowledge_budget,
        orientation=True,
    )


def search(
    root: Path,
    scope: str,
    query: str,
    *,
    topics: list[str] | None = None,
    offset: int = 0,
    limit: int | None = None,
    candidate_offset: int = 0,
    expected: int | None = None,
    evidence_budget: int | None = None,
) -> dict[str, Any]:
    """Lexical discovery over evidence plus knowledge/topic/source/task candidates."""
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a nonempty string")
    _paging(offset, limit, expected, candidate_offset)
    _evidence_budget(evidence_budget)
    record = _load(root, scope, expected)
    stored = record.get("observations", {})
    if topics is not None:
        links(topics, record.get("topics", {}), "topics")
    seeds = [
        key
        for key in sorted(stored, key=_number)
        if (topics is None or set(topics).intersection(stored[key]["topics"]))
        and _match(list(_strings(stored[key])), query) is not None
    ]
    return _assemble(
        record,
        scope,
        mode="search",
        task_id=None,
        checkpoint={},
        active_topics=list(topics or []),
        topics=topics,
        observations=None,
        seeds=seeds,
        page_limit=limit,
        offset=offset,
        order="oldest_first",
        budget=AUTOMATIC_EVIDENCE_BYTES if evidence_budget is None else evidence_budget,
        query=query,
        candidate_offset=candidate_offset,
        exhausted=expected is not None and offset == len(seeds),
    )


def evidence(
    root: Path,
    scope: str,
    *,
    topics: list[str] | None = None,
    observations: list[str] | None = None,
    offset: int = 0,
    limit: int | None = None,
    expected: int | None = None,
    evidence_budget: int | None = None,
) -> dict[str, Any]:
    """Topic histories or exact observations with their complete correction groups."""
    if topics is None and observations is None:
        raise ValueError("evidence requires topics or observations")
    _paging(offset, limit, expected)
    _evidence_budget(evidence_budget)
    record = _load(root, scope, expected)
    stored = record.get("observations", {})
    if topics is not None:
        links(topics, record.get("topics", {}), "topics")
    if observations is not None:
        links(observations, stored, "observations")
    seeds = sorted(stored if observations is None else observations, key=_number)
    if topics is not None:
        seeds = [
            key for key in seeds if set(topics).intersection(stored[key]["topics"])
        ]
    newest_first = observations is None and limit is None
    if newest_first:
        seeds = seeds[::-1]
    return _assemble(
        record,
        scope,
        mode="observations" if observations is not None else "topics",
        task_id=None,
        checkpoint={},
        active_topics=list(topics or []),
        topics=topics,
        observations=observations,
        seeds=seeds,
        page_limit=limit
        if limit is not None
        else (None if observations is not None else AUTOMATIC_OBSERVATIONS),
        offset=offset,
        order="newest_first" if newest_first else "oldest_first",
        budget=evidence_budget
        if evidence_budget is not None
        else (None if observations is not None else AUTOMATIC_EVIDENCE_BYTES),
    )


def catalog(root: Path, scope: str | None = None) -> dict[str, Any]:
    """Handles only: the scope list, or one scope's topic/source/task/knowledge index."""
    if scope is None:
        entries = read(root, None)
        assert isinstance(entries, list)
        return {
            "scopes": [item for item in entries if "error" not in item],
            "errors": [item for item in entries if "error" in item],
        }
    record = _load(root, scope, None)
    return {
        "scope": scope,
        "revision": record["revision"],
        "digest": record["digest"],
        "updated_at": record.get("updated_at"),
        **{field: record[field] for field in IDENTITY_FIELDS if field in record},
        "task_index": {
            key: {field: value[field] for field in ("task", "topics") if field in value}
            for key, value in record.get("tasks", {}).items()
        },
        "topic_index": _topic_index(record),
        "sources": record.get("sources", {}),
        "knowledge_keys": sorted(record.get("knowledge", {})),
        "route": briefing(record, {}, []).get("route"),
        "counts": {
            name: len(record.get(name, {}))
            for name in ("topics", "observations", "knowledge", "tasks", "sources")
        },
    }
