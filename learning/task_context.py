"""Stable task purpose and small, task-local teaching plans."""

from __future__ import annotations

from copy import deepcopy
from graphlib import CycleError, TopologicalSorter
import json
import re
from typing import Any

BRIEFING_BYTES = 4096


def briefing(
    record: dict[str, Any],
    task_id: str | None,
    task: dict[str, Any],
    topics: list[str],
    *,
    budget: int = BRIEFING_BYTES,
) -> dict[str, Any]:
    """Project stored orientation, keeping whole fields and naming any omissions."""
    values: list[tuple[list[str], list[str], Any]] = []
    if task_id is not None:
        for field in ("task", "question", "pending_question", "assistance", "frame"):
            if field in task:
                values.append(
                    (["activity", field], ["tasks", task_id, field], task[field])
                )
        plan = task.get("plan", {})
        if plan:
            values.append(
                (
                    ["route", "status"],
                    ["tasks", task_id, "plan", "status"],
                    plan["status"],
                )
            )
        current = plan.get("current")
        nodes = plan.get("nodes", {})
        if current:
            values.append(
                (
                    ["route", "current"],
                    ["tasks", task_id, "plan", "nodes", current],
                    {"id": current, **nodes[current]},
                )
            )
    for field in ("title", "goal", "exam", "course_context", "coverage"):
        if field in record:
            values.append((["course", field], [field], record[field]))
    if task_id is not None and current:
        values.append(
            (
                ["route", "prerequisites"],
                ["tasks", task_id, "plan", "nodes"],
                {key: nodes[key] for key in nodes[current].get("needs", [])},
            )
        )
    values.append((["topics"], ["topics"], list(topics)))
    linked = [record, task, *parts(task, active_only=True)]
    linked.extend(
        value
        for field in ("course_context", "coverage")
        if isinstance(value := record.get(field), dict)
    )
    linked.extend(record.get("topics", {}).get(key, {}) for key in topics)
    sources = set()
    for part in linked:
        if isinstance(part, dict):
            if "source" in part:
                sources.add(part["source"])
            sources.update(ref["source"] for ref in part.get("refs", []))
    values.append((["sources"], ["sources"], sorted(sources)))

    def size(value: Any) -> int:
        return len(
            json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        )

    result: dict[str, Any] = {
        "course": {},
        "activity": {"id": task_id} if task_id is not None else None,
        "omitted_fields": [
            {"field": ".".join(target), "path": path, "bytes": size(value)}
            for target, path, value in values
        ],
        "expand": "context --all",
    }
    if type(budget) is not int or size(result) > budget:
        raise ValueError("briefing budget must fit the omission descriptors")
    for target, _, value in values:
        candidate = deepcopy(result)
        parent = candidate
        for key in target[:-1]:
            parent = parent.setdefault(key, {})
        parent[target[-1]] = deepcopy(value)
        candidate["omitted_fields"] = [
            item
            for item in candidate["omitted_fields"]
            if item["field"] != ".".join(target)
        ]
        if not candidate["omitted_fields"]:
            candidate.pop("expand")
        if size(candidate) <= budget:
            result = candidate
    return result


def validate(task: dict[str, Any], field: str) -> None:
    """Validate plan structure; learning.records validates evidence/source links."""
    if "frame" in task:
        frame = task["frame"]
        if not isinstance(frame, dict):
            raise ValueError(f"{field}.frame must be an object")
        for name in ("within", "goal", "completion"):
            if name in frame and (
                not isinstance(frame[name], str) or not frame[name].strip()
            ):
                raise ValueError(f"{field}.frame.{name} must be a nonempty string")
    if "plan" not in task:
        return
    plan = task["plan"]
    if not isinstance(plan, dict) or plan.get("status") not in ("proposed", "agreed"):
        raise ValueError(f"{field}.plan requires status proposed or agreed")
    nodes = plan.get("nodes")
    if not isinstance(nodes, dict) or not nodes:
        raise ValueError(f"{field}.plan.nodes must be a nonempty object")
    graph = {}
    for key, node in nodes.items():
        if not isinstance(key, str) or not re.fullmatch(
            r"[a-z0-9][a-z0-9_-]{0,63}", key
        ):
            raise ValueError(
                f"{field}.plan node handles must be short lowercase identifiers"
            )
        if (
            not isinstance(node, dict)
            or not isinstance(node.get("label"), str)
            or not node["label"].strip()
        ):
            raise ValueError(f"{field}.plan.nodes.{key} requires a label")
        needs = node.get("needs", [])
        if not isinstance(needs, list) or any(
            not isinstance(item, str) for item in needs
        ):
            raise ValueError(
                f"{field}.plan.nodes.{key}.needs must be a list of node handles"
            )
        if len(needs) != len(set(needs)) or any(item not in nodes for item in needs):
            raise ValueError(
                f"{field}.plan.nodes.{key}.needs has duplicate or unknown nodes"
            )
        graph[key] = needs
    try:
        tuple(TopologicalSorter(graph).static_order())
    except CycleError as error:
        raise ValueError(f"{field}.plan dependencies must be acyclic") from error
    current = plan.get("current")
    if current is not None and (not isinstance(current, str) or current not in nodes):
        raise ValueError(f"{field}.plan.current must name a plan node")


def parts(task: dict[str, Any], *, active_only: bool = False) -> list[dict[str, Any]]:
    """Expose link-bearing context; routine retrieval excludes distant plan nodes."""
    result = [task["frame"]] if "frame" in task else []
    plan = task.get("plan", {})
    nodes = plan.get("nodes", {})
    if active_only:
        current = plan.get("current")
        keys = [current, *nodes[current].get("needs", [])] if current else []
    else:
        keys = list(nodes)
    result.extend(nodes[key] for key in keys)
    return result
