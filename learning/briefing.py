"""A bounded orientation projection: course destination, route position, handles."""

from __future__ import annotations

from graphlib import TopologicalSorter
from typing import Any

from learning.packing import fit, size
from learning.schema import route_parts, source_ids, task_parts

BRIEFING_BYTES = 4096
COURSE_FIELDS = ("goal", "exam", "course_context", "coverage")


def route_position(route: dict[str, Any]) -> dict[str, Any]:
    """Project the current node, its direct prerequisites and overall progress."""
    nodes = route.get("nodes", {})
    order = list(
        TopologicalSorter(
            {k: v.get("needs", []) for k, v in nodes.items()}
        ).static_order()
    )
    current = route.get("current")
    result: dict[str, Any] = {
        "status": route["status"],
        "order": order,
        "done": [key for key in order if nodes[key].get("done")],
    }
    if "basis" in route:
        result["basis"] = route["basis"]
    if current:
        result["current"] = {"id": current, **nodes[current]}
        result["prerequisites"] = {
            key: nodes[key] for key in nodes[current].get("needs", [])
        }
    return result


def briefing(
    record: dict[str, Any],
    task: dict[str, Any],
    topics: list[str],
    *,
    budget: int = BRIEFING_BYTES,
) -> dict[str, Any]:
    """Project course orientation whole-field by whole-field within a byte budget.

    The selected task is returned separately by retrieval and is not repeated here.
    """
    values: list[tuple[list[str], list[str], Any]] = [
        (["course", field], [field], record[field])
        for field in COURSE_FIELDS
        if field in record
    ]
    route = record.get("route")
    if route:
        values.append((["route"], ["route"], route_position(route)))
    values.append((["topics"], ["topics"], list(topics)))
    linked = [record, task, *task_parts(task, active_only=True)]
    linked.extend(
        value
        for field in ("course_context", "coverage")
        if isinstance(value := record.get(field), dict)
    )
    if route:
        linked.extend(route_parts(route, active_only=True))
    linked.extend(record.get("topics", {}).get(key, {}) for key in topics)
    sources = sorted(
        {key for part in linked if isinstance(part, dict) for key in source_ids(part)}
    )
    values.append((["sources"], ["sources"], sources))

    def render(
        selected: list[tuple[list[str], list[str], Any]],
        omitted: list[tuple[list[str], list[str], Any]],
    ) -> dict[str, Any]:
        result: dict[str, Any] = {"course": {}}
        for target, _, value in selected:
            parent = result
            for key in target[:-1]:
                parent = parent.setdefault(key, {})
            parent[target[-1]] = value
        result["omitted_fields"] = [
            {"field": ".".join(target), "path": path, "bytes": size(value)}
            for target, path, value in omitted
        ]
        if omitted:
            result["expand"] = "inspect SCOPE"
        return result

    return fit(
        values,
        budget,
        render,
        error="briefing budget must fit the omission descriptors",
    )
