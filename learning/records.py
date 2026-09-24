"""Whole-record validation, scope resolution and revision-checked publication."""

from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone
import json
from pathlib import Path
from typing import Any
import unicodedata

from learning import assessments, course, preferences, schema, storage
from learning.schema import handle, links, source_ids

__all__ = [
    "capture_source_fingerprints",
    "normalize_record",
    "read",
    "resolve_scope",
    "save",
    "snapshot_sources",
    "source_ids",
    "validate_references",
]

validate_references = links


def _scope(value: str) -> str:
    return handle(value, "scope")


# --- normalization ----------------------------------------------------------


def _reject_legacy_shapes(record: dict[str, Any]) -> None:
    if "teaching" in record:
        raise ValueError("store current teaching preferences in preferences.json")
    if "review" in record:
        raise ValueError("put each review under topics[topic].review")
    if "active" in record:
        raise ValueError("store unfinished work under tasks with a current_task handle")


def _normalize_observations(record: dict[str, Any]) -> None:
    for key, value in record["observations"].items():
        schema.observation(key, value, record, f"observations.{key}")
    last = max((int(key[1:]) for key in record["observations"]), default=0)
    sequence = record.setdefault("observation_sequence", last)
    if type(sequence) is not int or sequence < last:
        raise ValueError(
            "observation_sequence must be an integer at least the last observation handle"
        )


def _normalize_interpretations(record: dict[str, Any]) -> None:
    for key, topic in record["topics"].items():
        for field in ("assessment", "review"):
            if field in topic:
                topic[field] = assessments.normalize(
                    topic[field],
                    f"topics.{key}.{field}",
                    record["observations"],
                    review=field == "review",
                )


def normalize_record(record: Any, today: date | None = None) -> dict[str, Any]:
    """Validate the current schema and resolve newly requested review intervals."""
    if not isinstance(record, dict):
        raise ValueError("state must be a JSON object")
    if (
        record.get("schema_version", 5) != 5
        or type(record.get("schema_version", 5)) is not int
    ):
        raise ValueError("learning state requires schema_version 5")
    result = {
        key: value
        for key, value in record.items()
        if key not in schema.HELPER_RECORD_FIELDS
    }
    result["schema_version"] = 5
    _reject_legacy_shapes(result)
    for field in ("topics", "sources", "observations"):
        schema.object_map(result.setdefault(field, {}), field)
    if "title" in result and not isinstance(result["title"], str):
        raise ValueError("title must be a string")
    if "aliases" in result:
        schema.names(result["aliases"], "aliases")
    result["sources"] = {
        key: schema.source(key, value, f"sources.{key}")
        for key, value in result["sources"].items()
    }
    if result.get("course_context") is None:
        result.pop("course_context", None)
    else:
        result["course_context"] = course.normalize_context(
            result["course_context"], result["sources"]
        )
    schema.source_links(result, result["sources"], "scope")
    exam = (
        schema.day(result["exam"], "exam") if result.get("exam") is not None else None
    )
    when = today or date.today()
    result["topics"] = {
        key: schema.topic(key, value, result, f"topics.{key}", exam=exam, today=when)
        for key, value in result["topics"].items()
    }
    _normalize_observations(result)
    _normalize_interpretations(result)
    knowledge = result.get("knowledge", {})
    if not isinstance(knowledge, dict):
        raise ValueError("knowledge must map handles to entry objects")
    for key, entry in knowledge.items():
        schema.knowledge_entry(key, entry, result)
    if "focus" in result:
        links(result["focus"], result["topics"], "focus")
    tasks = result.setdefault("tasks", {})
    if not isinstance(tasks, dict):
        raise ValueError("tasks must map handles to checkpoint objects")
    for key, value in tasks.items():
        schema.task(key, value, result)
    if result.get("current_task") is not None:
        links([result["current_task"]], tasks, "current_task")
    if isinstance(result.get("coverage"), dict):
        schema.evidence_links(result["coverage"], result, "coverage")
    if result.get("route") is None:
        result.pop("route", None)
    else:
        schema.route(result["route"], "route", result)
    return result


def _validated(record: dict[str, Any]) -> dict[str, Any]:
    if record["revision"] == 0:
        return record
    if record.get("schema_version") != 5:
        raise ValueError("learning state requires schema_version 5")
    return {
        **normalize_record(record),
        "revision": record["revision"],
        "updated_at": record.get("updated_at"),
    }


# --- reading ----------------------------------------------------------------


def read(root: Path, scope: str | None) -> dict[str, Any] | list[dict[str, Any]]:
    """Read one validated scope with freshness and digest, or the scope catalog."""
    directory = root / "state"
    if scope is not None:
        stored = storage.load(directory / f"{_scope(scope)}.json")
        return {
            **assessments.with_freshness(_validated(stored)),
            "digest": storage.digest(stored),
        }
    catalog = []
    for path in sorted(directory.glob("*.json")):
        try:
            stored = storage.load(path)
            record = _validated(stored)
        except (ValueError, OSError, TypeError, KeyError, AttributeError) as error:
            catalog.append({"scope": path.stem, "error": str(error)})
            continue
        item = {
            "scope": path.stem,
            "title": record.get("title", path.stem),
            "aliases": record.get("aliases", []),
            "revision": record["revision"],
            "digest": storage.digest(stored),
            "updated_at": record.get("updated_at"),
            "topic_count": len(record.get("topics", {})),
            "task_count": len(record.get("tasks", {})),
        }
        for field in ("exam", "current_task"):
            if record.get(field) is not None:
                item[field] = record[field]
        catalog.append(item)
    return catalog


def _tokens(value: str) -> frozenset[str]:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    stripped = "".join(c for c in normalized if not unicodedata.combining(c))
    return frozenset(
        part for part in stripped.replace("_", " ").replace("-", " ").split() if part
    )


def resolve_scope(root: Path, value: str) -> str:
    """Map an exact handle, or an unambiguous course title/alias, to its handle."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("scope must be a nonempty string")
    if schema.HANDLE.fullmatch(value) and (root / "state" / f"{value}.json").is_file():
        return value
    wanted = _tokens(value)
    catalog = read(root, None)
    assert isinstance(catalog, list)
    matches = [
        item["scope"]
        for item in catalog
        if "error" not in item
        and (
            _tokens(item["scope"]) == wanted
            or _tokens(item["title"]) == wanted
            or any(_tokens(alias) == wanted for alias in item["aliases"])
        )
    ]
    if len(matches) == 1:
        return str(matches[0])
    if len(matches) > 1:
        raise ValueError(
            f"ambiguous scope {value!r}; use one exact handle: {', '.join(sorted(matches))}"
        )
    if schema.HANDLE.fullmatch(value):
        return value
    known = ", ".join(sorted(item["scope"] for item in catalog if "error" not in item))
    raise ValueError(
        f"no scope matches {value!r}; known scopes: {known or 'none'}. "
        "Use an existing handle, or a new lowercase handle to create one"
    )


# --- publication helpers ----------------------------------------------------


def _aliases(value: Any, aliases: dict[str, str]) -> Any:
    if isinstance(value, list):
        return [_aliases(item, aliases) for item in value]
    if not isinstance(value, dict):
        return value
    result = {}
    for key, item in value.items():
        if (
            key in {"observations", "considered_observations", "corrects"}
            and isinstance(item, list)
            and all(isinstance(ref, str) for ref in item)
        ):
            resolved = []
            for ref in item:
                if ref.startswith("$"):
                    if ref[1:] not in aliases:
                        raise ValueError(f"unknown observation alias: {ref}")
                    ref = aliases[ref[1:]]
                resolved.append(ref)
            result[key] = resolved
        else:
            result[key] = _aliases(item, aliases)
    return result


def snapshot_sources(value: dict[str, Any], sources: dict[str, Any]) -> dict[str, Any]:
    """Capture editions on newly ingested source references, including unknown editions."""
    result = deepcopy(value)
    parts = [ref for ref in result.get("refs", []) if isinstance(ref, dict)]
    if "source" in result:
        parts.append(result)
    for part in parts:
        if part.get("source") not in sources:
            continue
        stored = sources[part["source"]]
        if "source_version" not in part and "fingerprint" in stored:
            part["source_fingerprint"] = deepcopy(stored["fingerprint"])
        part["source_version"] = stored.get("version")
    return result


def _cites(value: Any, source: str) -> bool:
    if isinstance(value, dict):
        return value.get("source") == source or any(
            _cites(item, source) for item in value.values()
        )
    return isinstance(value, list) and any(_cites(item, source) for item in value)


def _append_observations(
    current: dict[str, Any], additions: Any, now: str
) -> tuple[dict[str, Any], dict[str, str], list[str], int]:
    if not isinstance(additions, list):
        raise ValueError("observations patch must be a list of new observations")
    saved = dict(current.get("observations", {}))
    next_id = current.get("observation_sequence", 0) + 1
    aliases: dict[str, str] = {}
    assigned: list[str] = []
    for item in additions:
        if not isinstance(item, dict):
            raise ValueError("new observations must be objects")
        if "refs" in item and not isinstance(item["refs"], list):
            raise ValueError("observation refs must be a list")
        if "recorded_at" in item:
            raise ValueError("observation recorded_at is helper-owned")
        key = f"o{next_id}"
        alias = item.pop("as", None)
        if alias is not None:
            if (
                not isinstance(alias, str)
                or not schema.ALIAS.fullmatch(alias)
                or alias in aliases
            ):
                raise ValueError(
                    "observation aliases must be distinct short lowercase identifiers"
                )
            aliases[alias] = key
        item["recorded_at"] = now
        item.setdefault("origin", schema.DEFAULT_ORIGIN)
        saved[key] = item
        assigned.append(key)
        next_id += 1
    return saved, aliases, assigned, next_id - 1


def _patch_sources(current: dict[str, Any], changes: Any) -> dict[str, Any]:
    if not isinstance(changes, dict):
        raise ValueError("sources patch must be an object")
    for key, change in changes.items():
        if isinstance(change, dict) and "fingerprint" in change:
            previous = current.get(key, {})
            if (
                "fingerprint" not in previous
                or change["fingerprint"] != previous["fingerprint"]
            ):
                raise ValueError(
                    f"sources.{key}.fingerprint is helper-owned; inspect and capture the local source instead"
                )
    return schema.patch_map(current, changes, "sources", clear_null=False)


def _patch_topics(current: dict[str, Any], changes: Any, now: str) -> dict[str, Any]:
    if not isinstance(changes, dict):
        raise ValueError("topics patch must be an object")
    stamped = {}
    for key, change in changes.items():
        if isinstance(change, dict):
            change = dict(change)
            for name in ("assessment", "review"):
                if name in change:
                    change[name] = assessments.stamp(
                        change[name], now, f"topics.{key}.{name}"
                    )
        stamped[key] = change
    return schema.patch_map(current, stamped, "topics", clear_null=False)


def _guard_cited_versions(current: dict[str, Any], result: dict[str, Any]) -> None:
    for key, source in current.get("sources", {}).items():
        if (
            key in result["sources"]
            and source.get("version") != result["sources"][key].get("version")
            and _cites(current, key)
        ):
            raise ValueError(
                f"sources.{key}: cited content versions are immutable; use a new source handle for a new edition"
            )


def _qualification_changes(
    previous: dict[str, Any], candidate: dict[str, Any]
) -> list[dict[str, Any]]:
    changes = []
    for key, before in sorted(previous.items()):
        if key not in candidate:
            changes.append({"entry": key, "deleted": True, "before": before})
            continue
        after = candidate[key]
        fields = {}
        for name in ("attribution", "uncertainty", "conflicts", "refs"):
            old, new = before.get(name), after.get(name)
            lost = (
                any(item not in (new or []) for item in old)
                if name in {"conflicts", "refs"} and old
                else bool(old) and old != new
            )
            if lost:
                fields[name] = {"before": old, "after": new}
        if fields:
            if before["text"] != after["text"]:
                fields["text"] = {"before": before["text"], "after": after["text"]}
            changes.append({"entry": key, "fields": fields})
    return changes


class _QualificationReview(Exception):
    def __init__(self, result: dict[str, Any]) -> None:
        self.result = result
        super().__init__("Knowledge changes require review")


def _confirmed(value: Any, expected_digest: str | None) -> list[str]:
    confirmed = [] if value is None else value
    if (
        not isinstance(confirmed, list)
        or any(not isinstance(key, str) for key in confirmed)
        or len(set(confirmed)) != len(confirmed)
    ):
        raise ValueError("confirm_qualification_changes must be unique entry handles")
    if confirmed and expected_digest is None:
        raise ValueError("confirm_qualification_changes requires expected_digest")
    return confirmed


def _apply_patch(
    root: Path, scope: str, current: dict[str, Any], record: dict[str, Any], now: str
) -> tuple[dict[str, Any], list[str]]:
    """Apply one agent patch to a validated record; returns the candidate and new handles."""
    patch = deepcopy(record)
    saved, aliases, assigned, sequence = _append_observations(
        current, patch.get("observations", []), now
    )
    patch = _aliases(patch, aliases)
    for key in assigned:
        saved[key] = _aliases(saved[key], aliases)
    result = {**current, **patch}
    result["sources"] = _patch_sources(
        current.get("sources", {}), patch.get("sources", {})
    )
    result["topics"] = _patch_topics(
        current.get("topics", {}), patch.get("topics", {}), now
    )
    deleted = set(current.get("topics", {})) - set(result["topics"])
    if deleted:
        preferences.assert_topics_removable(root, scope, deleted)
    _guard_cited_versions(current, result)
    for key in assigned:
        schema.source_links(saved[key], result["sources"], f"observations.{key}")
        saved[key] = snapshot_sources(saved[key], result["sources"])
    task_changes = patch.get("tasks", {})
    result["tasks"] = schema.patch_map(
        current.get("tasks", {}), task_changes, "tasks", clear_null=True
    )
    if "knowledge" in patch:
        knowledge = schema.patch_knowledge(
            current.get("knowledge", {}), patch["knowledge"]
        )
        for key, entry in knowledge.items():
            change = patch["knowledge"].get(key)
            if isinstance(change, dict):
                schema.source_links(entry, result["sources"], f"knowledge.{key}")
                if change.get("refs") is not None and "refs" in change:
                    knowledge[key] = snapshot_sources(entry, result["sources"])
        result["knowledge"] = knowledge
    selected = result.get("current_task")
    if (
        isinstance(selected, str)
        and selected in task_changes
        and task_changes[selected] is None
    ):
        result["current_task"] = None
    result["observations"] = saved
    result["observation_sequence"] = sequence
    return normalize_record(result), assigned


def save(
    root: Path,
    scope: str,
    expected: int,
    record: Any,
    *,
    expected_digest: str | None = None,
    confirm_qualification_changes: list[str] | None = None,
) -> dict[str, Any]:
    """Publish a field patch at the expected snapshot, or return a review preview."""
    scope = _scope(scope)
    if not isinstance(record, dict):
        raise ValueError("state patch must be a JSON object")
    if "confirm_qualification_changes" in record:
        raise ValueError(
            "confirm_qualification_changes belongs outside the state patch"
        )
    confirmed = _confirmed(confirm_qualification_changes, expected_digest)
    helper_owned = {
        "revision",
        "updated_at",
        "digest",
        "topic_index",
        "policy_topics",
        "observation_sequence",
    }
    if helper_owned.intersection(record):
        raise ValueError(
            "record revision, timestamps and retrieval metadata are helper-owned"
        )
    assigned: list[str] = []

    def transform(stored: dict[str, Any]) -> dict[str, Any]:
        current = _validated(stored)
        now = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        result, handles = _apply_patch(root, scope, current, record, now)
        assigned.extend(handles)
        changes = _qualification_changes(
            current.get("knowledge", {}), result.get("knowledge", {})
        )
        guarded = {change["entry"] for change in changes}
        if set(confirmed) - guarded:
            raise ValueError(
                "confirm_qualification_changes must name only entries with guarded changes"
            )
        if guarded - set(confirmed):
            json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
            raise _QualificationReview(
                {
                    "status": "needs_confirmation",
                    "scope": scope,
                    "revision": current["revision"],
                    "digest": storage.digest(stored),
                    "changes": changes,
                }
            )
        return result

    try:
        with storage.lock(root / ".records.lock"):
            result = storage.update(
                root / "state" / f"{scope}.json",
                expected,
                transform,
                expected_digest=expected_digest,
            )
    except _QualificationReview as review:
        return review.result
    return {
        "scope": scope,
        "revision": result["revision"],
        "digest": storage.digest(result),
        "updated_at": result.get("updated_at"),
        "assigned_observations": assigned,
        "review_dates": {
            key: result["topics"][key]["review"]["due"]
            for key in record.get("topics", {})
            if "due" in result.get("topics", {}).get(key, {}).get("review", {})
        },
    }


def capture_source_fingerprints(
    root: Path,
    scope: str,
    expected: int,
    fingerprints: dict[str, dict[str, Any]],
    *,
    expected_digest: str,
) -> dict[str, Any]:
    """Publish fingerprints computed by the local source inspector for this snapshot."""
    scope = _scope(scope)

    def transform(current: dict[str, Any]) -> dict[str, Any]:
        current = _validated(current)
        sources = current.get("sources", {})
        links(list(fingerprints), sources, "sources")
        for key, fingerprint in fingerprints.items():
            if (
                "fingerprint" in sources[key]
                and sources[key]["fingerprint"] != fingerprint
            ):
                raise ValueError(
                    f"sources.{key}: captured fingerprints are immutable; use a new source handle for changed content"
                )
            sources[key]["fingerprint"] = deepcopy(fingerprint)
        return normalize_record(current)

    with storage.lock(root / ".records.lock"):
        result = storage.update(
            root / "state" / f"{scope}.json",
            expected,
            transform,
            expected_digest=expected_digest,
        )
    return {
        "scope": scope,
        "revision": result["revision"],
        "digest": storage.digest(result),
        "updated_at": result.get("updated_at"),
    }


def register_sources(
    root: Path,
    scope: str,
    expected: int,
    entries: dict[str, dict[str, Any]],
    *,
    expected_digest: str | None = None,
) -> dict[str, Any]:
    """Register new source handles through the ordinary save path."""
    receipt = save(
        root, scope, expected, {"sources": entries}, expected_digest=expected_digest
    )
    receipt["sources"] = entries
    return receipt
