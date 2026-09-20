"""Select learning evidence, corrections, and the context needed to teach."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from learning import task_context
from learning.observations import correction_links, expand_corrections
from learning.records import read, source_ids, validate_references


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
    offset: int = 0,
    limit: int | None = None,
    expected: int | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    if (
        type(offset) is not int
        or offset < 0
        or (limit is not None and (type(limit) is not int or limit < 1))
    ):
        raise ValueError("offset must be nonnegative and limit must be positive")
    if expected is not None and (type(expected) is not int or expected < 0):
        raise ValueError("expected revision must be a nonnegative integer")
    if offset and expected is None:
        raise ValueError("continued pages require an expected revision")
    if query is not None and (not isinstance(query, str) or not query.strip()):
        raise ValueError("query must be a nonempty literal string")
    if scope is None and (
        topics is not None
        or task is not None
        or query is not None
        or observations is not None
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
            if key not in {"topics", "observations", "sources", "coverage", "tasks"}
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
        needle = query.casefold()
        result["candidates"] = {
            "topics": {
                key: item
                for key, item in _topic_index(record).items()
                if needle in key.casefold()
                or any(needle in text.casefold() for text in _strings(item))
            },
            "tasks": {
                key: {
                    field: value[field]
                    for field in ("task", "topics")
                    if field in value
                }
                for key, value in tasks.items()
                if needle in key.casefold()
                or any(needle in text.casefold() for text in _strings(value))
            },
            "sources": {
                key: item
                for key, item in record.get("sources", {}).items()
                if needle in key.casefold()
                or any(needle in text.casefold() for text in _strings(item))
            },
            "observations": {key: "literal query match" for key in page},
        }
    return result
