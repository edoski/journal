"""Current teaching preferences shared across learning scopes and providers."""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any, cast

from learning import storage

_SELECTORS = frozenset({"scope", "topic", "concept", "domain", "activity"})


def _text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a nonempty string")
    return value


def _scope_state(root: Path, scope: str) -> dict[str, Any]:
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", scope):
        raise ValueError(f"invalid scope: {scope}")
    return storage.load(root / "state" / f"{scope}.json")


def _object(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    return cast(dict[str, Any], value)


def _selector(value: Any) -> dict[str, str]:
    fields = _object(value, "when")
    if set(fields) - _SELECTORS:
        raise ValueError("when must contain only scope/topic/concept/domain/activity")
    selector = {key: _text(item, f"when.{key}") for key, item in fields.items()}
    if "topic" in selector and "scope" not in selector:
        raise ValueError("a topic preference requires its scope")
    if "scope" in selector and not re.fullmatch(
        r"[a-z0-9][a-z0-9_-]{0,63}", selector["scope"]
    ):
        raise ValueError(f"invalid scope: {selector['scope']}")
    return dict(sorted(selector.items()))


def _value(value: Any) -> dict[str, str]:
    fields = _object(value, "preference")
    if set(fields) - {"instruction", "origin", "basis"}:
        raise ValueError(
            "a preference must contain instruction, origin and optional basis"
        )
    instruction = _text(fields.get("instruction"), "instruction")
    origin = fields.get("origin")
    if origin not in ("explicit", "inferred"):
        raise ValueError("origin must be explicit or inferred")
    result = {"instruction": instruction, "origin": origin}
    if "basis" in fields:
        result["basis"] = _text(fields["basis"], "basis")
    return result


def _rules(value: Any, *, patch: bool = False) -> list[dict[str, Any]]:
    entries = cast(list[Any], value)
    if not isinstance(value, list):
        raise ValueError("rules must be a list")
    rules: dict[tuple[tuple[str, str], ...], dict[str, Any]] = {}
    for entry in entries:
        rule = _object(entry, "rule")
        if set(rule) != {"when", "values"}:
            raise ValueError("each rule must contain when and values")
        selector = _selector(rule["when"])
        key = tuple(selector.items())
        values = _object(rule["values"], "rule values")
        normalized = rules.setdefault(key, {"when": selector, "values": {}})
        for dimension, item in values.items():
            _text(dimension, "dimension")
            if dimension in normalized["values"]:
                raise ValueError(f"duplicate preference for selector and {dimension}")
            normalized["values"][dimension] = (
                None if patch and item is None else _value(item)
            )
    return [
        {
            "when": rules[key]["when"],
            "values": dict(sorted(rules[key]["values"].items())),
        }
        for key in sorted(rules)
        if rules[key]["values"]
    ]


def _record(record: dict[str, Any]) -> dict[str, Any]:
    if record["revision"] == 0:
        return {"schema_version": 1, "revision": 0, "rules": []}
    if type(record.get("schema_version")) is not int or record["schema_version"] != 1:
        raise ValueError("unsupported preference schema_version; expected 1")
    return {**record, "rules": _rules(record.get("rules"))}


def read(root: Path) -> dict[str, Any]:
    """Read the current policy, without interpreting or ranking its instructions."""
    raw = storage.load(root / "preferences.json")
    return {**_record(raw), "digest": storage.digest(raw)}


def assert_topics_removable(root: Path, scope: str, deleted_topics: set[str]) -> None:
    """Reject orphaned preference selectors; caller holds the root records lock."""
    referenced = {
        rule["when"]["topic"]
        for rule in read(root)["rules"]
        if rule["when"].get("scope") == scope
        and rule["when"].get("topic") in deleted_topics
    }
    if referenced:
        raise ValueError(
            f"cannot remove topics in {scope} referenced by preferences: "
            f"{', '.join(sorted(referenced))}; remove or reassign their preferences first"
        )


def _labels(values: Any, field: str) -> set[str]:
    if values is None:
        return set()
    labels = cast(list[Any], values)
    if not isinstance(values, list):
        raise ValueError(f"{field} must be a list of labels")
    return {_text(value, field) for value in labels}


def context(
    root: Path,
    scope: str | None = None,
    topics: list[str] | None = None,
    concepts: list[str] | None = None,
    domains: list[str] | None = None,
    activity: str | None = None,
    dimension: str | None = None,
    *,
    state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Select rules using the supplied scope snapshot; leave overlap to the tutor."""
    selected_topics = _labels(topics, "topics")
    labels: dict[str, set[str]] = {
        "scope": {_text(scope, "scope")} if scope is not None else set(),
        "topic": selected_topics,
        "concept": _labels(concepts, "concepts"),
        "domain": _labels(domains, "domains"),
        "activity": {_text(activity, "activity")} if activity is not None else set(),
    }
    if selected_topics and scope is None:
        raise ValueError("topic selection requires a scope")
    if scope is not None and not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", scope):
        raise ValueError(f"invalid scope: {scope}")
    if selected_topics and state is None:
        raise ValueError("topic selection requires the retrieved scope state")
    if state is not None:
        stored_topics = state.get("topics", {})
        for topic in selected_topics:
            if topic not in stored_topics:
                raise ValueError(f"unknown topic in {scope}: {topic}")
            for field, plural in (("concept", "concepts"), ("domain", "domains")):
                labels[field].update(_labels(stored_topics[topic].get(plural), plural))
    policy = read(root)
    selected = [
        rule
        for rule in policy["rules"]
        if all(value in labels[key] for key, value in rule["when"].items())
    ]
    result = _selection(policy, selected, dimension)
    if state is not None:
        result["scope_revision"] = state["revision"]
    return result


def _selection(
    policy: dict[str, Any], rules: list[dict[str, Any]], dimension: str | None
) -> dict[str, Any]:
    if dimension is not None:
        _text(dimension, "dimension")
        rules = [
            {"when": rule["when"], "values": {dimension: rule["values"][dimension]}}
            for rule in rules
            if dimension in rule["values"]
        ]
    return {"revision": policy["revision"], "digest": policy["digest"], "rules": rules}


def inspect(root: Path, dimension: str) -> dict[str, Any]:
    """Return one dimension across all selectors for an explicit broad correction."""
    policy = read(root)
    return _selection(policy, policy["rules"], dimension)


def save(
    root: Path, expected: int, patch: Any, *, expected_digest: str | None = None
) -> dict[str, Any]:
    """Replace supplied values under each selector; null deletes one dimension."""
    fields = _object(patch, "preference patch")
    if set(fields) != {"rules"}:
        raise ValueError("preference patch must contain rules")
    changes = _rules(fields["rules"], patch=True)
    changed: list[dict[str, str]] = []

    def transform(current: dict[str, Any]) -> dict[str, Any]:
        policy = _record(current)
        rules = {tuple(rule["when"].items()): rule for rule in policy["rules"]}
        for change in changes:
            key = tuple(change["when"].items())
            previous = rules.get(key, {"when": change["when"], "values": {}})
            values = dict(previous["values"])
            for dimension, value in change["values"].items():
                if value is None:
                    values.pop(dimension, None)
                else:
                    if (
                        value["origin"] == "inferred"
                        and values.get(dimension, {}).get("origin") == "explicit"
                    ):
                        raise ValueError(
                            f"inferred preference cannot replace explicit {dimension} "
                            f"for selector {change['when']}"
                        )
                    values[dimension] = value
            if values != previous["values"]:
                changed.append(change["when"])
            if values:
                rules[key] = {"when": change["when"], "values": values}
            else:
                rules.pop(key, None)
        if not changed:
            return current
        normalized = [
            {
                "when": rules[key]["when"],
                "values": dict(sorted(rules[key]["values"].items())),
            }
            for key in sorted(rules)
        ]
        scopes: dict[str, dict[str, Any]] = {}
        for rule in normalized:
            selector = rule["when"]
            if "scope" not in selector:
                continue
            scope = selector["scope"]
            if scope not in scopes:
                scopes[scope] = _scope_state(root, scope)
            if scopes[scope]["revision"] == 0:
                raise ValueError(f"unknown scope: {scope}")
            if "topic" in selector and selector["topic"] not in scopes[scope].get(
                "topics", {}
            ):
                raise ValueError(f"unknown topic in {scope}: {selector['topic']}")
        return {"schema_version": 1, "rules": normalized}

    with storage.lock(root / ".records.lock"):
        result = storage.update(
            root / "preferences.json",
            expected,
            transform,
            expected_digest=expected_digest,
        )
    return {
        "revision": result["revision"],
        "digest": storage.digest(result),
        **({"updated_at": result["updated_at"]} if "updated_at" in result else {}),
        "selectors": changed,
    }
