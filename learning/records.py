"""Learning record validation, persistence, and revision-checked publication."""

from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import re
from typing import Any

from learning import assessments, course, preferences, storage, task_context

KNOWLEDGE_FIELDS = frozenset(
    {"text", "topics", "refs", "attribution", "uncertainty", "conflicts", "aliases"}
)


def _date(value: Any, field: str) -> date:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"{field} must be a date in YYYY-MM-DD form")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{field} is not a valid date: {value}") from error


def _review(value: Any, field: str, exam: date | None, today: date) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    review = dict(value)
    if "due" in review:
        _date(review["due"], f"{field}.due")
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


def _names(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or any(
        not isinstance(item, str) or not item.strip() for item in value
    ):
        raise ValueError(f"{field} must be a list of nonempty strings")
    if len(value) != len(set(value)):
        raise ValueError(f"{field} must not contain duplicate keys")
    return value


def validate_references(value: Any, available: dict[str, Any], field: str) -> list[str]:
    """Validate a caller-supplied list of unique handles against its owning map."""
    names = _names(value, field)
    missing = [name for name in names if name not in available]
    if missing:
        raise ValueError(f"unknown {field}: {', '.join(missing)}")
    return names


def source_ids(value: dict[str, Any]) -> list[str]:
    """Collect source handles from a validated record or record part."""
    result = [value["source"]] if "source" in value else []
    result.extend(ref["source"] for ref in value.get("refs", []))
    return result


def _links(value: dict[str, Any], record: dict[str, Any], field: str) -> None:
    for name, target in (
        ("topics", "topics"),
        ("observations", "observations"),
        ("corrects", "observations"),
        ("prerequisites", "topics"),
    ):
        if name in value:
            validate_references(value[name], record[target], f"{field}.{name}")
    if "parent" in value and value["parent"] is not None:
        validate_references([value["parent"]], record["topics"], f"{field}.parent")
    _source_links(value, record, field)


def _source_links(value: dict[str, Any], record: dict[str, Any], field: str) -> None:
    if "refs" in value:
        refs = value["refs"]
        if not isinstance(refs, list) or any(
            not isinstance(ref, dict)
            or not isinstance(ref.get("source"), str)
            or ("locator" in ref and not isinstance(ref["locator"], str))
            for ref in refs
        ):
            raise ValueError(
                f"{field}.refs must contain source handles and optional string locators"
            )
    for source in source_ids(value):
        validate_references([source], record["sources"], f"{field}.source")
    if (
        "source" in value
        and "source_version" in value
        and value["source_version"] != record["sources"][value["source"]].get("version")
    ):
        raise ValueError(f"{field}.source_version no longer matches its source handle")
    for ref in value.get("refs", []):
        if "excerpt" in ref and (
            not isinstance(ref["excerpt"], str) or not ref["excerpt"].strip()
        ):
            raise ValueError(f"{field}.refs.excerpt must be a nonempty string")
        if "source_version" in ref and ref["source_version"] != record["sources"][
            ref["source"]
        ].get("version"):
            raise ValueError(
                f"{field}.refs source version no longer matches its source handle"
            )
        if "source_fingerprint" in ref and (
            ref["source_fingerprint"] is None
            or ref["source_fingerprint"]
            != record["sources"][ref["source"]].get("fingerprint")
        ):
            raise ValueError(
                f"{field}.refs source fingerprint no longer matches its source handle"
            )
    if (
        "source" in value
        and "source_fingerprint" in value
        and (
            value["source_fingerprint"] is None
            or value["source_fingerprint"]
            != record["sources"][value["source"]].get("fingerprint")
        )
    ):
        raise ValueError(
            f"{field}.source_fingerprint no longer matches its source handle"
        )


def normalize_record(record: Any, today: date | None = None) -> dict[str, Any]:
    """Validate the current schema and resolve newly requested review intervals."""
    if not isinstance(record, dict):
        raise ValueError("state must be a JSON object")
    if (
        type(record.get("schema_version", 5)) is not int
        or record.get("schema_version", 5) != 5
    ):
        raise ValueError(
            "learning state requires schema_version 5; run the explicit learning migration first"
        )
    result = {
        key: value
        for key, value in record.items()
        if key not in {"revision", "updated_at", "digest", "topic_index"}
    }
    result["schema_version"] = 5
    for field in ("topics", "sources", "observations"):
        value = result.setdefault(field, {})
        if not isinstance(value, dict) or any(
            not isinstance(key, str) or not key.strip() or not isinstance(item, dict)
            for key, item in value.items()
        ):
            raise ValueError(f"{field} must map nonempty keys to objects")
    if "title" in result and not isinstance(result["title"], str):
        raise ValueError("title must be a string")
    if "teaching" in result:
        raise ValueError("store current teaching preferences in preferences.json")
    if "aliases" in result:
        _names(result["aliases"], "aliases")
    for key, source in result["sources"].items():
        if not isinstance(source.get("path"), str) or not source["path"].strip():
            raise ValueError(f"sources.{key}.path must be a nonempty string")
        if source.get("version") is not None and (
            not isinstance(source["version"], str) or not source["version"].strip()
        ):
            raise ValueError(f"sources.{key}.version must be a nonempty string or null")
        if "title" in source and not isinstance(source["title"], str):
            raise ValueError(f"sources.{key}.title must be a string")
        if "fingerprint" in source:
            fingerprint = source["fingerprint"]
            if (
                not isinstance(fingerprint, dict)
                or set(fingerprint) != {"sha256", "size"}
                or not isinstance(fingerprint.get("sha256"), str)
                or not re.fullmatch(r"[a-f0-9]{64}", fingerprint["sha256"])
                or type(fingerprint.get("size")) is not int
                or fingerprint["size"] < 0
            ):
                raise ValueError(
                    f"sources.{key}.fingerprint must contain sha256 and size"
                )
    if result.get("course_context") is None:
        result.pop("course_context", None)
    else:
        result["course_context"] = course.normalize_context(
            result["course_context"], result["sources"]
        )
    _source_links(result, result, "scope")
    exam = _date(result["exam"], "exam") if result.get("exam") is not None else None
    if "review" in result:
        raise ValueError("put each review under topics[topic].review")
    topics = {}
    for key, value in result["topics"].items():
        if "evidence" in value or "earlier_evidence_count" in value:
            raise ValueError(f"topics.{key}: store evidence in observations")
        if {"summary", "gap", "status"}.intersection(value):
            raise ValueError(f"topics.{key}: put current interpretations in assessment")
        topic = dict(value)
        if topic.get("assessment") is None:
            topic.pop("assessment", None)
        for field in ("aliases", "tags", "concepts", "domains"):
            if field in topic:
                _names(topic[field], f"topics.{key}.{field}")
        if "title" in topic and not isinstance(topic["title"], str):
            raise ValueError(f"topics.{key}.title must be a string")
        if topic.get("review") is None:
            topic.pop("review", None)
        elif "review" in topic:
            topic["review"] = _review(
                topic["review"], f"topics.{key}.review", exam, today or date.today()
            )
        _links(topic, result, f"topics.{key}")
        topics[key] = topic
    result["topics"] = topics
    for key, observation in result["observations"].items():
        if not re.fullmatch(r"o[1-9]\d*", key):
            raise ValueError(f"invalid observation handle: {key}")
        if (
            not isinstance(observation.get("text"), str)
            or not observation["text"].strip()
        ):
            raise ValueError(f"observations.{key}.text must be a nonempty string")
        if not validate_references(
            observation.get("topics"), topics, f"observations.{key}.topics"
        ):
            raise ValueError(f"observations.{key}.topics must not be empty")
        if not isinstance(observation.get("origin"), str) or observation[
            "origin"
        ] not in {
            "direct_attempt",
            "self_report",
            "tutor_inference",
            "external_assessment",
            "unknown",
        }:
            raise ValueError(
                f"observations.{key}.origin is not a supported evidence origin"
            )
        if "recorded_at" not in observation:
            raise ValueError(f"observations.{key}.recorded_at is required")
        assessments.timestamp(
            observation["recorded_at"], f"observations.{key}.recorded_at", unknown=True
        )
        for field in ("response", "assistance", "uncertainty", "task", "provenance"):
            if field in observation and (
                not isinstance(observation[field], str)
                or not observation[field].strip()
            ):
                raise ValueError(
                    f"observations.{key}.{field} must be a nonempty string"
                )
        _links(observation, result, f"observations.{key}")
        if "source" in observation and "source_version" not in observation:
            raise ValueError(f"observations.{key} requires a captured source_version")
        for ref in observation.get("refs", []):
            if isinstance(ref, dict) and "source_version" not in ref:
                raise ValueError(
                    f"observations.{key}.refs requires a captured source_version"
                )
        if "date" in observation:
            _date(observation["date"], f"observations.{key}.date")
        if any(
            int(target[1:]) >= int(key[1:])
            for target in observation.get("corrects", [])
        ):
            raise ValueError(
                f"observations.{key}.corrects must refer to earlier observations"
            )
    last_observation = max((int(key[1:]) for key in result["observations"]), default=0)
    sequence = result.setdefault("observation_sequence", last_observation)
    if type(sequence) is not int or sequence < last_observation:
        raise ValueError(
            "observation_sequence must be an integer at least the last observation handle"
        )
    for key, topic in topics.items():
        for field in ("assessment", "review"):
            if field in topic:
                topic[field] = assessments.normalize(
                    topic[field],
                    f"topics.{key}.{field}",
                    result["observations"],
                    review=field == "review",
                )
    knowledge = result.get("knowledge", {})
    if not isinstance(knowledge, dict):
        raise ValueError("knowledge must map handles to entry objects")
    for key, entry in knowledge.items():
        field = f"knowledge.{key}"
        if not isinstance(key, str) or not re.fullmatch(
            r"[a-z0-9][a-z0-9_-]{0,63}", key
        ):
            raise ValueError(f"{field}: handles must be short lowercase identifiers")
        if not isinstance(entry, dict):
            raise ValueError(f"{field} must be an object")
        if set(entry) - KNOWLEDGE_FIELDS:
            raise ValueError(
                f"{field} accepts only text, topics, refs, attribution, uncertainty, conflicts and aliases"
            )
        if not isinstance(entry.get("text"), str) or not entry["text"].strip():
            raise ValueError(f"{field}.text must be a nonempty string")
        for name in ("attribution", "uncertainty"):
            if name in entry and (
                not isinstance(entry[name], str) or not entry[name].strip()
            ):
                raise ValueError(f"{field}.{name} must be a nonempty string")
        for name in ("conflicts", "aliases"):
            if name in entry:
                _names(entry[name], f"{field}.{name}")
        _links(entry, result, field)
        if any("source_version" not in ref for ref in entry.get("refs", [])):
            raise ValueError(f"{field}.refs requires a captured source_version")
    if "focus" in result:
        validate_references(result["focus"], topics, "focus")
    if "active" in result:
        raise ValueError("store unfinished work under tasks with a current_task handle")
    tasks = result.setdefault("tasks", {})
    if not isinstance(tasks, dict):
        raise ValueError("tasks must map handles to checkpoint objects")
    for key, task in tasks.items():
        if not isinstance(key, str) or not re.fullmatch(
            r"[a-z0-9][a-z0-9_-]{0,63}", key
        ):
            raise ValueError("task handles must be short lowercase identifiers")
        if not isinstance(task, dict):
            raise ValueError(f"tasks.{key} must be an object")
        if "task" in task and (
            not isinstance(task["task"], str) or not task["task"].strip()
        ):
            raise ValueError(f"tasks.{key}.task must be a nonempty string")
        _links(task, result, f"tasks.{key}")
        task_context.validate(task, f"tasks.{key}")
        for part in task_context.parts(task):
            _links(part, result, f"tasks.{key}.context")
    if result.get("current_task") is not None:
        validate_references([result["current_task"]], tasks, "current_task")
    if isinstance(result.get("coverage"), dict):
        _links(result["coverage"], result, "coverage")
    return result


def _scope(value: str) -> str:
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", value):
        raise ValueError(
            "scope must be 1–64 lowercase letters, digits, underscores or hyphens; start with a letter or digit"
        )
    return value


def _validated(record: dict[str, Any]) -> dict[str, Any]:
    if record["revision"] == 0:
        return record
    if record.get("schema_version") != 5:
        raise ValueError(
            "learning state requires schema_version 5; run the explicit learning migration first"
        )
    normalized = normalize_record(record)
    return {
        **normalized,
        "revision": record["revision"],
        "updated_at": record.get("updated_at"),
    }


def read(root: Path, scope: str | None) -> dict[str, Any] | list[dict[str, Any]]:
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
        }
        if "exam" in record:
            item["exam"] = record["exam"]
        catalog.append(item)
    return catalog


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
    for ref in result.get("refs", []):
        if isinstance(ref, dict) and ref.get("source") in sources:
            if "source_version" not in ref and "fingerprint" in sources[ref["source"]]:
                ref["source_fingerprint"] = deepcopy(
                    sources[ref["source"]]["fingerprint"]
                )
            ref["source_version"] = sources[ref["source"]].get("version")
    if "source" in result and result["source"] in sources:
        if (
            "source_version" not in result
            and "fingerprint" in sources[result["source"]]
        ):
            result["source_fingerprint"] = deepcopy(
                sources[result["source"]]["fingerprint"]
            )
        result["source_version"] = sources[result["source"]].get("version")
    return result


def _cites(value: Any, source: str) -> bool:
    if isinstance(value, dict):
        return value.get("source") == source or any(
            _cites(item, source) for item in value.values()
        )
    return isinstance(value, list) and any(_cites(item, source) for item in value)


def save(
    root: Path,
    scope: str,
    expected: int,
    record: Any,
    *,
    expected_digest: str | None = None,
) -> dict[str, Any]:
    scope = _scope(scope)
    if not isinstance(record, dict):
        raise ValueError("state patch must be a JSON object")
    if {
        "revision",
        "updated_at",
        "digest",
        "topic_index",
        "policy_topics",
        "observation_sequence",
    }.intersection(record):
        raise ValueError(
            "record revision, timestamps and retrieval metadata are helper-owned"
        )
    assigned: list[str] = []

    def transform(current: dict[str, Any]) -> dict[str, Any]:
        current = _validated(current)
        patch = deepcopy(record)
        now = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        additions = patch.get("observations", [])
        if not isinstance(additions, list):
            raise ValueError("observations patch must be a list of new observations")
        saved = dict(current.get("observations", {}))
        next_id = current.get("observation_sequence", 0) + 1
        aliases = {}
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
                    or not re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", alias)
                    or alias in aliases
                ):
                    raise ValueError(
                        "observation aliases must be distinct short lowercase identifiers"
                    )
                aliases[alias] = key
            item["recorded_at"] = now
            item.setdefault("origin", "unknown")
            saved[key] = item
            assigned.append(key)
            next_id += 1
        patch = _aliases(patch, aliases)
        for key in assigned:
            saved[key] = _aliases(saved[key], aliases)
        result = {**current, **patch}
        for field in ("topics", "sources"):
            changes = patch.get(field, {})
            if not isinstance(changes, dict):
                raise ValueError(f"{field} patch must be an object")
            merged = dict(current.get(field, {}))
            for key, change in changes.items():
                if change is None:
                    merged.pop(key, None)
                elif isinstance(change, dict):
                    if field == "topics":
                        change = dict(change)
                        for name in ("assessment", "review"):
                            if name in change:
                                change[name] = assessments.stamp(
                                    change[name], now, f"topics.{key}.{name}"
                                )
                    merged[key] = {**merged.get(key, {}), **change}
                else:
                    raise ValueError(f"{field}.{key} must be an object or null")
            result[field] = merged
        deleted = set(current.get("topics", {})) - set(result["topics"])
        if deleted:
            preferences.assert_topics_removable(root, scope, deleted)
        for key, source in current.get("sources", {}).items():
            if (
                key in result["sources"]
                and source.get("version") != result["sources"][key].get("version")
                and _cites(current, key)
            ):
                raise ValueError(
                    f"sources.{key}: cited content versions are immutable; use a new source handle for a new edition"
                )
            if (
                key in result["sources"]
                and "fingerprint" in source
                and source["fingerprint"] != result["sources"][key].get("fingerprint")
                and _cites(current, key)
            ):
                raise ValueError(
                    f"sources.{key}: cited fingerprints are immutable; use a new source handle for changed content"
                )
        for key in assigned:
            _source_links(saved[key], result, f"observations.{key}")
            saved[key] = snapshot_sources(saved[key], result["sources"])
        changes = patch.get("tasks", {})
        if not isinstance(changes, dict):
            raise ValueError("tasks patch must be an object")
        tasks = dict(current.get("tasks", {}))
        for key, change in changes.items():
            if change is None:
                tasks.pop(key, None)
            elif isinstance(change, dict):
                tasks[key] = {
                    name: value
                    for name, value in {**tasks.get(key, {}), **change}.items()
                    if value is not None
                }
            else:
                raise ValueError(f"tasks.{key} must be an object or null")
        result["tasks"] = tasks
        if "knowledge" in patch:
            knowledge_changes = patch["knowledge"]
            if not isinstance(knowledge_changes, dict):
                raise ValueError(
                    "knowledge patch must be an object; remove individual entries with null"
                )
            knowledge = dict(current.get("knowledge", {}))
            for key, change in knowledge_changes.items():
                field = f"knowledge.{key}"
                if not isinstance(key, str) or not re.fullmatch(
                    r"[a-z0-9][a-z0-9_-]{0,63}", key
                ):
                    raise ValueError(
                        f"{field}: handles must be short lowercase identifiers"
                    )
                if change is None:
                    knowledge.pop(key, None)
                elif isinstance(change, dict):
                    if set(change) - KNOWLEDGE_FIELDS:
                        raise ValueError(f"{field} contains unknown fields")
                    entry = {
                        name: value
                        for name, value in {**knowledge.get(key, {}), **change}.items()
                        if value is not None or name == "text"
                    }
                    _source_links(entry, result, field)
                    if "refs" in change and change["refs"] is not None:
                        entry = snapshot_sources(entry, result["sources"])
                    knowledge[key] = entry
                else:
                    raise ValueError(f"knowledge.{key} must be an object or null")
            result["knowledge"] = knowledge
        selected = result.get("current_task")
        if (
            isinstance(selected, str)
            and selected in changes
            and changes[selected] is None
        ):
            result["current_task"] = None
        result["observations"] = saved
        result["observation_sequence"] = next_id - 1
        return normalize_record(result)

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
        "assigned_observations": assigned,
        "review_dates": {
            key: result["topics"][key]["review"]["due"]
            for key in record.get("topics", {})
            if "due" in result.get("topics", {}).get(key, {}).get("review", {})
        },
    }
