"""Record shapes: one handle rule, per-type validation and per-type patching.

Every stored part of a scope record has one validator here and, where the
agent can patch it, one patch function. ``records.py`` composes these into
whole-record normalization and revision-checked publication.
"""

from __future__ import annotations

from datetime import date, timedelta
from graphlib import CycleError, TopologicalSorter
import re
from typing import Any, TypedDict

HANDLE = re.compile(r"[a-z0-9][a-z0-9_-]{0,63}")
OBSERVATION_HANDLE = re.compile(r"o[1-9]\d*")
ALIAS = re.compile(r"[a-z][a-z0-9_-]{0,63}")
ORIGINS = frozenset(
    {
        "direct_attempt",
        "self_report",
        "tutor_inference",
        "external_assessment",
        "unknown",
    }
)
DEFAULT_ORIGIN = "direct_attempt"
KNOWLEDGE_FIELDS = frozenset(
    {"text", "topics", "refs", "attribution", "uncertainty", "conflicts", "aliases"}
)
ROUTE_STATUSES = ("proposed", "agreed")
OBSERVATION_TEXT_FIELDS = (
    "response",
    "assistance",
    "uncertainty",
    "task",
    "provenance",
)
HELPER_RECORD_FIELDS = frozenset({"revision", "updated_at", "digest", "topic_index"})


class Reference(TypedDict, total=False):
    """A citation of a registered source; helper-owned fields round-trip only."""

    source: str
    locator: str
    excerpt: str
    source_version: str | None
    source_fingerprint: dict[str, Any]


class Source(TypedDict, total=False):
    path: str
    title: str
    version: str | None
    fingerprint: dict[str, Any]


class Observation(TypedDict, total=False):
    """One piece of learner evidence, appended once and never edited in place."""

    text: str
    topics: list[str]
    origin: str
    recorded_at: str | None
    date: str
    response: str
    assistance: str
    uncertainty: str
    task: str
    provenance: str
    corrects: list[str]
    refs: list[Reference]
    source: str
    source_version: str | None


class Knowledge(TypedDict, total=False):
    """Reusable understanding kept independently of learner evidence."""

    text: str
    topics: list[str]
    refs: list[Reference]
    attribution: str
    uncertainty: str
    conflicts: list[str]
    aliases: list[str]


class RouteNode(TypedDict, total=False):
    label: str
    needs: list[str]
    topics: list[str]
    observations: list[str]
    refs: list[Reference]
    done: bool


class Route(TypedDict, total=False):
    """An acyclic teaching path; a scope route spans the course, a task plan one activity."""

    status: str
    nodes: dict[str, RouteNode]
    current: str | None
    basis: str


class Task(TypedDict, total=False):
    task: str
    topics: list[str]
    question: str
    pending_question: str
    assistance: str
    why: str
    instructions: str
    observations: list[str]
    refs: list[Reference]
    source: str
    frame: dict[str, Any]
    plan: Route


# --- primitive checks -------------------------------------------------------


def text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a nonempty string")
    return value


def handle(value: Any, field: str) -> str:
    """The one identifier rule for scopes, topics, sources, tasks, nodes and keys."""
    if not isinstance(value, str) or not HANDLE.fullmatch(value):
        raise ValueError(
            f"invalid {field}: handles are 1–64 lowercase letters, digits, "
            "underscores or hyphens and start with a letter or digit"
        )
    return value


def names(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or any(
        not isinstance(item, str) or not item.strip() for item in value
    ):
        raise ValueError(f"{field} must be a list of nonempty strings")
    if len(value) != len(set(value)):
        raise ValueError(f"{field} must not contain duplicate keys")
    return value


def links(value: Any, available: dict[str, Any], field: str) -> list[str]:
    """Validate a caller-supplied list of unique handles against its owning map."""
    result = names(value, field)
    missing = [name for name in result if name not in available]
    if missing:
        raise ValueError(f"unknown {field}: {', '.join(missing)}")
    return result


def day(value: Any, field: str) -> date:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"{field} must be a date in YYYY-MM-DD form")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{field} is not a valid date: {value}") from error


def object_map(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict) or any(
        not isinstance(key, str) or not key.strip() or not isinstance(item, dict)
        for key, item in value.items()
    ):
        raise ValueError(f"{field} must map nonempty keys to objects")
    return value


# --- source references ------------------------------------------------------


def source_ids(value: dict[str, Any]) -> list[str]:
    """Collect source handles from a validated record or record part."""
    result = [value["source"]] if "source" in value else []
    result.extend(ref["source"] for ref in value.get("refs", []))
    return result


def _reference(ref: Any, sources: dict[str, Any], field: str) -> None:
    if (
        not isinstance(ref, dict)
        or not isinstance(ref.get("source"), str)
        or ("locator" in ref and not isinstance(ref["locator"], str))
    ):
        raise ValueError(
            f"{field}.refs must contain source handles and optional string locators"
        )
    links([ref["source"]], sources, f"{field}.source")
    if "excerpt" in ref and (
        not isinstance(ref["excerpt"], str) or not ref["excerpt"].strip()
    ):
        raise ValueError(f"{field}.refs.excerpt must be a nonempty string")
    stored = sources[ref["source"]]
    if "source_version" in ref and ref["source_version"] != stored.get("version"):
        raise ValueError(
            f"{field}.refs source version no longer matches its source handle"
        )
    if "source_fingerprint" in ref and (
        ref["source_fingerprint"] is None
        or ref["source_fingerprint"] != stored.get("fingerprint")
    ):
        raise ValueError(
            f"{field}.refs source fingerprint no longer matches its source handle"
        )


def source_links(value: dict[str, Any], sources: dict[str, Any], field: str) -> None:
    """Check a part's bare ``source`` and ``refs`` against the registered sources."""
    if "refs" in value:
        if not isinstance(value["refs"], list):
            raise ValueError(
                f"{field}.refs must contain source handles and optional string locators"
            )
        for ref in value["refs"]:
            _reference(ref, sources, field)
    if "source" not in value:
        return
    links([value["source"]], sources, f"{field}.source")
    stored = sources[value["source"]]
    if "source_version" in value and value["source_version"] != stored.get("version"):
        raise ValueError(f"{field}.source_version no longer matches its source handle")
    if "source_fingerprint" in value and (
        value["source_fingerprint"] is None
        or value["source_fingerprint"] != stored.get("fingerprint")
    ):
        raise ValueError(
            f"{field}.source_fingerprint no longer matches its source handle"
        )


def evidence_links(value: dict[str, Any], record: dict[str, Any], field: str) -> None:
    """Check topic, observation, correction, prerequisite, parent and source links."""
    for name, target in (
        ("topics", "topics"),
        ("observations", "observations"),
        ("corrects", "observations"),
        ("prerequisites", "topics"),
    ):
        if name in value:
            links(value[name], record[target], f"{field}.{name}")
    if value.get("parent") is not None and "parent" in value:
        links([value["parent"]], record["topics"], f"{field}.parent")
    source_links(value, record["sources"], field)


# --- per-type validators ----------------------------------------------------


def source(key: str, value: Any, field: str) -> Source:
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    if not isinstance(value.get("path"), str) or not value["path"].strip():
        raise ValueError(f"{field}.path must be a nonempty string")
    if value.get("version") is not None and (
        not isinstance(value["version"], str) or not value["version"].strip()
    ):
        raise ValueError(f"{field}.version must be a nonempty string or null")
    if "title" in value and not isinstance(value["title"], str):
        raise ValueError(f"{field}.title must be a string")
    if "fingerprint" in value:
        fingerprint = value["fingerprint"]
        if (
            not isinstance(fingerprint, dict)
            or set(fingerprint) != {"sha256", "size"}
            or not isinstance(fingerprint.get("sha256"), str)
            or not re.fullmatch(r"[a-f0-9]{64}", fingerprint["sha256"])
            or type(fingerprint.get("size")) is not int
            or fingerprint["size"] < 0
        ):
            raise ValueError(f"{field}.fingerprint must contain sha256 and size")
    return value  # type: ignore[return-value]


def review_due(
    value: Any, field: str, exam: date | None, today: date
) -> dict[str, Any]:
    """Resolve a requested ``in_days`` interval into a due date capped before the exam."""
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    review = dict(value)
    if "due" in review:
        day(review["due"], f"{field}.due")
    if "in_days" in review:
        interval = review.pop("in_days")
        if type(interval) is not int or interval < 0:
            raise ValueError(f"{field}.in_days must be a nonnegative integer")
        try:
            due = today + timedelta(days=interval)
        except OverflowError as error:
            raise ValueError(f"{field}.in_days is too large") from error
        if exam is not None and exam >= today:
            due = min(due, max(today, exam - timedelta(days=1)))
        review["due"] = due.isoformat()
    return review


def topic(
    key: str,
    value: dict[str, Any],
    record: dict[str, Any],
    field: str,
    *,
    exam: date | None,
    today: date,
) -> dict[str, Any]:
    """Structural topic checks; assessments are normalized once evidence is known."""
    if "evidence" in value or "earlier_evidence_count" in value:
        raise ValueError(f"{field}: store evidence in observations")
    if {"summary", "gap", "status"}.intersection(value):
        raise ValueError(f"{field}: put current interpretations in assessment")
    result = dict(value)
    if result.get("assessment") is None:
        result.pop("assessment", None)
    for name in ("aliases", "tags", "concepts", "domains"):
        if name in result:
            names(result[name], f"{field}.{name}")
    if "title" in result and not isinstance(result["title"], str):
        raise ValueError(f"{field}.title must be a string")
    if result.get("review") is None:
        result.pop("review", None)
    else:
        result["review"] = review_due(result["review"], f"{field}.review", exam, today)
    evidence_links(result, record, field)
    return result


def observation(
    key: str, value: Any, record: dict[str, Any], field: str
) -> Observation:
    if not OBSERVATION_HANDLE.fullmatch(key):
        raise ValueError(f"invalid observation handle: {key}")
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    text(value.get("text"), f"{field}.text")
    if not links(value.get("topics"), record["topics"], f"{field}.topics"):
        raise ValueError(f"{field}.topics must not be empty")
    if value.get("origin") not in ORIGINS:
        raise ValueError(f"{field}.origin is not a supported evidence origin")
    if "recorded_at" not in value:
        raise ValueError(f"{field}.recorded_at is required")
    for name in OBSERVATION_TEXT_FIELDS:
        if name in value:
            text(value[name], f"{field}.{name}")
    evidence_links(value, record, field)
    if "source" in value and "source_version" not in value:
        raise ValueError(f"{field} requires a captured source_version")
    if any(
        isinstance(ref, dict) and "source_version" not in ref
        for ref in value.get("refs", [])
    ):
        raise ValueError(f"{field}.refs requires a captured source_version")
    if "date" in value:
        day(value["date"], f"{field}.date")
    if any(int(target[1:]) >= int(key[1:]) for target in value.get("corrects", [])):
        raise ValueError(f"{field}.corrects must refer to earlier observations")
    return value  # type: ignore[return-value]


def knowledge_entry(key: str, value: Any, record: dict[str, Any]) -> Knowledge:
    field = f"knowledge.{key}"
    handle(key, field)
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    if set(value) - KNOWLEDGE_FIELDS:
        raise ValueError(
            f"{field} accepts only text, topics, refs, attribution, uncertainty, conflicts and aliases"
        )
    text(value.get("text"), f"{field}.text")
    for name in ("attribution", "uncertainty"):
        if name in value:
            text(value[name], f"{field}.{name}")
    for name in ("conflicts", "aliases"):
        if name in value:
            names(value[name], f"{field}.{name}")
    evidence_links(value, record, field)
    if any("source_version" not in ref for ref in value.get("refs", [])):
        raise ValueError(f"{field}.refs requires a captured source_version")
    return value  # type: ignore[return-value]


def route(value: Any, field: str, record: dict[str, Any]) -> Route:
    """Validate an acyclic path of labelled nodes with an optional current node."""
    if not isinstance(value, dict) or value.get("status") not in ROUTE_STATUSES:
        raise ValueError(f"{field} requires status proposed or agreed")
    if set(value) - {"status", "nodes", "current", "basis"}:
        raise ValueError(f"{field} accepts only status, nodes, current and basis")
    if "basis" in value:
        text(value["basis"], f"{field}.basis")
    nodes = value.get("nodes")
    if not isinstance(nodes, dict) or not nodes:
        raise ValueError(f"{field}.nodes must be a nonempty object")
    graph = {}
    for key, node in nodes.items():
        handle(key, f"{field}.nodes key")
        if (
            not isinstance(node, dict)
            or not isinstance(node.get("label"), str)
            or not node["label"].strip()
        ):
            raise ValueError(f"{field}.nodes.{key} requires a label")
        needs = node.get("needs", [])
        if not isinstance(needs, list) or any(
            not isinstance(item, str) for item in needs
        ):
            raise ValueError(
                f"{field}.nodes.{key}.needs must be a list of node handles"
            )
        if len(needs) != len(set(needs)) or any(item not in nodes for item in needs):
            raise ValueError(
                f"{field}.nodes.{key}.needs has duplicate or unknown nodes"
            )
        if "done" in node and type(node["done"]) is not bool:
            raise ValueError(f"{field}.nodes.{key}.done must be a boolean")
        evidence_links(node, record, f"{field}.nodes.{key}")
        graph[key] = needs
    try:
        tuple(TopologicalSorter(graph).static_order())
    except CycleError as error:
        raise ValueError(f"{field} dependencies must be acyclic") from error
    current = value.get("current")
    if current is not None and (not isinstance(current, str) or current not in nodes):
        raise ValueError(f"{field}.current must name a plan node")
    return value  # type: ignore[return-value]


def route_parts(
    value: dict[str, Any], *, active_only: bool = False
) -> list[dict[str, Any]]:
    """Nodes carrying links; ``active_only`` keeps the current node and its needs."""
    nodes = value.get("nodes", {})
    if active_only:
        current = value.get("current")
        keys = [current, *nodes[current].get("needs", [])] if current else []
    else:
        keys = list(nodes)
    return [nodes[key] for key in keys]


def task(key: str, value: Any, record: dict[str, Any]) -> Task:
    field = f"tasks.{key}"
    handle(key, "task handle")
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    if "task" in value:
        text(value["task"], f"{field}.task")
    evidence_links(value, record, field)
    if "frame" in value:
        frame = value["frame"]
        if not isinstance(frame, dict):
            raise ValueError(f"{field}.frame must be an object")
        for name in ("within", "goal", "completion"):
            if name in frame:
                text(frame[name], f"{field}.frame.{name}")
        evidence_links(frame, record, f"{field}.frame")
    if "plan" in value:
        route(value["plan"], f"{field}.plan", record)
    return value  # type: ignore[return-value]


def task_parts(
    value: dict[str, Any], *, active_only: bool = False
) -> list[dict[str, Any]]:
    """Link-bearing context of a task: its frame and plan nodes."""
    result = [value["frame"]] if "frame" in value else []
    result.extend(route_parts(value.get("plan", {}), active_only=active_only))
    return result


# --- per-type patching ------------------------------------------------------


def patch_entry(
    existing: dict[str, Any], change: dict[str, Any], *, clear_null: bool
) -> dict[str, Any]:
    """Apply a field patch; omitted fields survive and, when enabled, null clears."""
    merged = {**existing, **change}
    if not clear_null:
        return merged
    return {name: value for name, value in merged.items() if value is not None}


def patch_map(
    current: dict[str, Any], changes: Any, field: str, *, clear_null: bool
) -> dict[str, Any]:
    """Merge a handle-keyed map: objects patch fields, null removes the entry."""
    if not isinstance(changes, dict):
        raise ValueError(f"{field} patch must be an object")
    merged = dict(current)
    for key, change in changes.items():
        if change is None:
            merged.pop(key, None)
        elif isinstance(change, dict):
            merged[key] = patch_entry(
                merged.get(key, {}), change, clear_null=clear_null
            )
        else:
            raise ValueError(f"{field}.{key} must be an object or null")
    return merged


def patch_knowledge(current: dict[str, Any], changes: Any) -> dict[str, Any]:
    """Knowledge patches keep ``text`` even when null so validation names the loss."""
    if not isinstance(changes, dict):
        raise ValueError(
            "knowledge patch must be an object; remove individual entries with null"
        )
    merged = dict(current)
    for key, change in changes.items():
        field = f"knowledge.{key}"
        handle(key, field)
        if change is None:
            merged.pop(key, None)
        elif isinstance(change, dict):
            if set(change) - KNOWLEDGE_FIELDS:
                raise ValueError(f"{field} contains unknown fields")
            entry = {**merged.get(key, {}), **change}
            merged[key] = {
                name: value
                for name, value in entry.items()
                if value is not None or name == "text"
            }
        else:
            raise ValueError(f"{field} must be an object or null")
    return merged
