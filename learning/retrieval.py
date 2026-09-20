"""Select learning evidence, corrections, and the context needed to teach."""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from learning import task_context
from learning.observations import correction_links, expand_corrections
from learning.records import read, source_ids, validate_references

AUTOMATIC_KNOWLEDGE_BYTES = 4096
EXACT_KNOWLEDGE_BYTES = 8192
DISCOVERY_BYTES = 4096


def _bytes(value: Any) -> int:
    return len(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )


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
    eligible = related + general
    result: dict[str, Any] = {
        "knowledge": {},
        "knowledge_selection": {
            "eligible": len(eligible),
            "included": 0,
            "omitted": len(eligible),
        },
        "sources": {},
    }
    if type(budget) is not int or budget < _bytes(result):
        raise ValueError("knowledge budget must fit the selection envelope")
    for key in eligible:
        entries = {**result["knowledge"], key: stored[key]}
        candidate = {
            "knowledge": entries,
            "knowledge_selection": {
                "eligible": len(eligible),
                "included": len(entries),
                "omitted": len(eligible) - len(entries),
            },
            "sources": _knowledge_sources(record, entries, available_sources or {}),
        }
        if _bytes(candidate) <= budget:
            result = candidate
    return result


def _knowledge_read(
    record: dict[str, Any],
    scope: str,
    keys: list[str],
    offset: int,
    limit: int | None,
    budget: int | None,
) -> dict[str, Any]:
    stored = record.get("knowledge", {})
    if keys:
        validate_references(keys, stored, "knowledge")
        entries = {key: stored[key] for key in sorted(set(keys))}
        result = {
            "scope": scope,
            "revision": record["revision"],
            "knowledge": entries,
            "sources": _knowledge_sources(record, entries, {}),
        }
        required = _bytes(result)
        allowance = EXACT_KNOWLEDGE_BYTES if budget is None else budget
        if required > allowance:
            sizes = ", ".join(
                f"{key}={_bytes(entry)}" for key, entry in entries.items()
            )
            raise ValueError(
                f"knowledge read requires {required} bytes (budget {allowance}); entries: {sizes}; "
                f"fetch fewer entries or set --knowledge-budget {required}"
            )
        return result
    ordered = sorted(stored)
    if offset > len(ordered):
        raise ValueError("offset exceeds knowledge entry count")
    page: list[dict[str, Any]] = []
    result = _knowledge_index(record, scope, page, offset)
    for key in ordered[offset : offset + (20 if limit is None else limit)]:
        candidate = _knowledge_index(
            record, scope, [*page, {"key": key, "bytes": _bytes(stored[key])}], offset
        )
        if _bytes(candidate) > DISCOVERY_BYTES:
            if not page:
                raise ValueError(
                    "knowledge index descriptor exceeds discovery byte budget"
                )
            break
        page = candidate["knowledge_index"]
        result = candidate
    return result


def _knowledge_index(
    record: dict[str, Any], scope: str, page: list[dict[str, Any]], offset: int
) -> dict[str, Any]:
    total = len(record.get("knowledge", {}))
    next_offset = offset + len(page)
    return {
        "scope": scope,
        "revision": record["revision"],
        "knowledge_index": page,
        "selection": {
            "mode": "knowledge_index",
            "total": total,
            "returned": len(page),
            "offset": offset,
            "next_offset": None if next_offset == total else next_offset,
            "complete": next_offset == total,
        },
    }


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


def _candidates(
    record: dict[str, Any], scope: str, query: str, offset: int
) -> dict[str, Any]:
    needle = query.casefold()
    collections = {
        "knowledge": record.get("knowledge", {}),
        "topic": {
            key: {
                name: value
                for name, value in item.items()
                if name not in {"assessment", "review"}
            }
            for key, item in record.get("topics", {}).items()
        },
        "source": record.get("sources", {}),
        "task": record.get("tasks", {}),
        "scope": {
            scope: {
                key: value
                for key, value in record.items()
                if key
                not in {
                    "knowledge",
                    "topics",
                    "sources",
                    "tasks",
                    "observations",
                    "revision",
                    "schema_version",
                    "updated_at",
                    "current_task",
                    "focus",
                }
            }
        },
    }
    matches = []
    for kind, entities in sorted(collections.items()):
        for key, value in sorted(entities.items()):
            texts = [key, *_strings(value)]
            matched = next((text for text in texts if needle in text.casefold()), None)
            if matched is not None:
                matches.append(
                    {
                        "kind": kind,
                        "key": key,
                        "excerpt": _excerpt(matched, needle),
                        "discovery_only": True,
                    }
                )
    total = len(matches)
    if offset > total:
        raise ValueError("candidate offset exceeds candidate count")
    page: list[dict[str, Any]] = []
    result = _candidate_page(page, offset, total)
    for item in matches[offset : offset + 8]:
        candidate = _candidate_page([*page, item], offset, total)
        if _bytes({"candidates": candidate}) > DISCOVERY_BYTES:
            if not page:
                raise ValueError("candidate descriptor exceeds discovery byte budget")
            break
        page = candidate["items"]
        result = candidate
    return result


def _candidate_page(
    items: list[dict[str, Any]], offset: int, total: int
) -> dict[str, Any]:
    next_offset = offset + len(items)
    return {
        "items": items,
        "offset": offset,
        "total": total,
        "next_offset": None if next_offset == total else next_offset,
        "complete": next_offset == total,
    }


def _strings(value: Any) -> Iterator[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


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


def evidence(record: dict[str, Any], observation_ids: list[str]) -> dict[str, Any]:
    """Return selected observations together with their complete correction links."""
    stored = record.get("observations", {})
    validate_references(observation_ids, stored, "observations")
    return {
        key: stored[key]
        for key in sorted(
            expand_corrections(correction_links(stored), observation_ids),
            key=lambda item: int(item[1:]),
        )
    }


def context(
    root: Path,
    scope: str | None,
    topics: list[str] | None = None,
    *,
    task: str | None = None,
    query: str | None = None,
    observations: list[str] | None = None,
    knowledge: list[str] | None = None,
    candidate_offset: int = 0,
    knowledge_budget: int | None = None,
    offset: int = 0,
    limit: int | None = None,
    expected: int | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
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
    if candidate_offset and query is None:
        raise ValueError("candidate_offset requires a query")
    if knowledge_budget is not None and (
        scope is None
        or query is not None
        or knowledge == []
        or type(knowledge_budget) is not int
        or knowledge_budget < 1
    ):
        raise ValueError(
            "knowledge_budget must be positive and requires ordinary scoped context or exact knowledge selection"
        )
    if knowledge is not None:
        if (
            topics is not None
            or task is not None
            or observations is not None
            or query is not None
        ):
            raise ValueError(
                "knowledge selection cannot combine with topic, task, observation, or query selectors"
            )
        if knowledge and (offset or limit is not None):
            raise ValueError("exact knowledge reads cannot use offset or limit")
        if not knowledge and limit is not None and limit > 20:
            raise ValueError("knowledge index limit must not exceed 20")
    if query is not None and (not isinstance(query, str) or not query.strip()):
        raise ValueError("query must be a nonempty literal string")
    if scope is None and (
        topics is not None
        or task is not None
        or query is not None
        or observations is not None
        or knowledge is not None
        or offset
        or limit is not None
        or expected is not None
    ):
        raise ValueError("context selection requires a scope")
    record = read(root, scope)
    if isinstance(record, list):
        return record
    if expected is not None and record["revision"] != expected:
        raise ValueError(
            f"revision conflict for {scope}: expected {expected}, found {record['revision']}"
        )
    if knowledge is not None:
        assert scope is not None
        return _knowledge_read(
            record, scope, knowledge, offset, limit, knowledge_budget
        )
    stored_topics = record.get("topics", {})
    stored = record.get("observations", {})
    continuing = topics is None and observations is None and query is None
    tasks = record.get("tasks", {})
    if task is not None:
        validate_references([task], tasks, "task")
    selected_task = task
    if selected_task is None and continuing:
        selected_task = record.get("current_task")
        if selected_task is None and len(tasks) == 1:
            selected_task = next(iter(tasks))
    checkpoint = tasks.get(selected_task, {})
    if topics is None and (task is not None or continuing) and "topics" in checkpoint:
        topics = list(checkpoint["topics"])
    if topics is not None:
        validate_references(topics, stored_topics, "topics")
    if observations is not None:
        validate_references(observations, stored, "observations")
    active_topics = list(topics or [])
    if topics is None and (continuing or task is not None):
        active_topics = list(
            checkpoint.get("topics", []) if selected_task else record.get("focus", [])
        )
    mode = "topics"
    index = topics == [] and observations is None and query is None
    if observations is not None:
        selected = list(observations)
        mode = "observations"
    elif query is not None:
        selected = list(stored)
        mode = "query"
    else:
        if topics is None:
            topics = (
                checkpoint.get("topics", [])
                if selected_task
                else record.get("focus", [])
            )
        selected = list(stored)
        if continuing and checkpoint.get("observations"):
            mode = "task"
    if topics is not None:
        topic_filter = set(topics)
        selected = [
            key for key in selected if topic_filter.intersection(stored[key]["topics"])
        ]
    if query is not None:
        needle = query.casefold()
        selected = [
            key
            for key in selected
            if any(needle in text.casefold() for text in _strings(stored[key]))
        ]
    context_parts = (
        task_context.parts(checkpoint, active_only=True) if continuing else []
    )
    context_topics = {key for part in context_parts for key in part.get("topics", [])}
    context_observations = {
        key for part in context_parts for key in part.get("observations", [])
    }
    if continuing:
        context_observations.update(checkpoint.get("observations", []))
    selected.extend(context_observations)
    selected.extend(
        key
        for key, item in stored.items()
        if context_topics.intersection(item["topics"])
    )
    selected = sorted(set(selected), key=lambda key: int(key[1:]))
    total = len(selected)
    if offset > total:
        raise ValueError("offset exceeds selected observation count")
    page = selected[offset : None if limit is None else offset + limit]
    links = correction_links(stored)
    expanded = expand_corrections(links, page)
    selected_topics = set(topics or []) | context_topics
    for key in expanded:
        selected_topics.update(stored[key]["topics"])
    if continuing or task is not None:
        selected_topics.update(checkpoint.get("topics", []))
    relevant_topics = {
        key: value for key, value in stored_topics.items() if key in selected_topics
    }
    if query is not None and expected is not None and offset == total:
        relevant_topics = {}
    support = {
        key
        for topic in relevant_topics.values()
        for field in ("assessment", "review")
        for key in topic.get(field, {}).get("observations", [])
    }
    expanded = expand_corrections(links, expanded | support)
    items = {key: stored[key] for key in sorted(expanded, key=lambda key: int(key[1:]))}
    selected_sources = set(source_ids(record))
    selected_sources.update(source_ids(record.get("course_context", {})))
    if continuing or task is not None:
        selected_sources.update(source_ids(checkpoint))
        for part in task_context.parts(checkpoint):
            selected_sources.update(source_ids(part))
    for value in [*items.values(), *relevant_topics.values()]:
        selected_sources.update(source_ids(value))
    next_offset = offset + len(page)
    result = {
        **{
            key: value
            for key, value in record.items()
            if key
            not in {
                "topics",
                "observations",
                "sources",
                "coverage",
                "tasks",
                "knowledge",
            }
        },
        "task": {"id": selected_task, **checkpoint} if selected_task else None,
        "task_index": {
            key: {field: value[field] for field in ("task", "topics") if field in value}
            for key, value in tasks.items()
        },
        "found": record["revision"] != 0,
        "topics": relevant_topics,
        "sources": {
            key: value
            for key, value in record.get("sources", {}).items()
            if index or key in selected_sources
        },
        "observations": items,
        "policy_topics": {key: stored_topics[key] for key in active_topics},
        "selection": {
            "active_topics": active_topics,
            "mode": "index" if index else mode,
            "task": selected_task,
            "topics": topics,
            "observations": observations,
            "query": query,
            "context_topics": sorted(context_topics),
            "context_observations": sorted(
                context_observations, key=lambda key: int(key[1:])
            ),
        },
        "total": total,
        "returned": len(items),
        "offset": offset,
        "complete": next_offset == total,
        "next_offset": None if next_offset == total else next_offset,
        "expanded_observations": [key for key in items if key not in page],
    }
    if index:
        result["topic_index"] = _topic_index(record)
    if query is not None:
        assert scope is not None
        result["candidates"] = _candidates(record, scope, query, candidate_offset)
    else:
        selected_knowledge = knowledge_context(
            record,
            active_topics,
            result["sources"],
            budget=AUTOMATIC_KNOWLEDGE_BYTES
            if knowledge_budget is None
            else knowledge_budget,
        )
        result["sources"].update(selected_knowledge.pop("sources"))
        result.update(selected_knowledge)
    return result
