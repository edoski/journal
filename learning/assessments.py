"""Evidence-backed tutor interpretations and their computed freshness."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any


from learning.observations import correction_links, expand_corrections


HELPER_FIELDS = frozenset({"reviewed_through", "assessed_at", "pending"})


def timestamp(value: Any, field: str, *, unknown: bool = False) -> None:
    """Validate a recorded instant without inventing unknown historical times."""
    if value is None and unknown:
        return
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO timestamp with timezone")
    try:
        instant = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{field} must be an ISO timestamp with timezone") from error
    if instant.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")


def normalize(
    value: Any,
    field: str,
    observations: dict[str, Any],
    *,
    review: bool = False,
) -> dict[str, Any]:
    """Validate persisted interpretations; freshness is never persisted."""
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    if "reviewed_through" in value:
        raise ValueError(f"{field}: use considered_observations, not reviewed_through")
    result = {key: item for key, item in value.items() if key != "pending"}
    text_fields = ("reason", "task") if review else ("summary", "gap", "status")
    for key in (*text_fields, "uncertainty"):
        if key in result and (
            not isinstance(result[key], str) or not result[key].strip()
        ):
            raise ValueError(f"{field}.{key} must be a nonempty string")
    historical = result.get("assessed_at") is None
    if review and not historical:
        for key in text_fields:
            if key not in result:
                raise ValueError(f"{field}.{key} is required")
        if "due" not in result:
            raise ValueError(f"{field}.due or in_days is required")
    if not review and not any(key in result for key in (*text_fields, "uncertainty")):
        raise ValueError(f"{field} requires an interpretation or uncertainty")
    support = result.get("observations")
    if (
        not isinstance(support, list)
        or any(not isinstance(key, str) or key not in observations for key in support)
        or len(support) != len(set(support))
    ):
        raise ValueError(
            f"{field}.observations must name distinct existing observations"
        )
    if not support and not historical and (review or not result.get("uncertainty")):
        raise ValueError(f"{field} requires supporting observations")
    if "considered_observations" not in result:
        raise ValueError(f"{field}.considered_observations is required")
    considered = result["considered_observations"]
    if considered is not None:
        if (
            not isinstance(considered, list)
            or any(
                not isinstance(key, str) or key not in observations
                for key in considered
            )
            or len(considered) != len(set(considered))
        ):
            raise ValueError(
                f"{field}.considered_observations must name distinct existing observations"
            )
        if not set(support).issubset(considered):
            raise ValueError(
                f"{field}.considered_observations must include all support"
            )
    timestamp(result.get("assessed_at"), f"{field}.assessed_at", unknown=True)
    if "retain" in result and type(result["retain"]) is not bool:
        raise ValueError(f"{field}.retain must be a boolean")
    return result


def stamp(value: Any, now: str, field: str) -> Any:
    """Assign metadata to an agent-supplied replacement assessment or review."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    if HELPER_FIELDS.intersection(value):
        raise ValueError(
            f"{field}: assessment timestamps and pending are helper-owned; reviewed_through is obsolete"
        )
    if not isinstance(value.get("considered_observations"), list):
        raise ValueError(
            f"{field}.considered_observations must declare reviewed evidence"
        )
    return {**value, "assessed_at": now}


def _pending(
    topic: str,
    value: dict[str, Any],
    observations: dict[str, Any],
    links: dict[str, set[str]],
) -> bool:
    """New relevant events or corrections require a fresh tutor interpretation."""
    considered = value["considered_observations"]
    if (
        considered is None
        or not value.get("observations")
        or value.get("assessed_at") is None
    ):
        return True
    related = set(value["observations"]) | {
        key for key, event in observations.items() if topic in event["topics"]
    }
    return not expand_corrections(links, related).issubset(considered)


def with_freshness(record: dict[str, Any]) -> dict[str, Any]:
    """Expose freshness using the same full evidence snapshot as the record."""
    result = deepcopy(record)
    observations = result.get("observations", {})
    links = correction_links(observations)
    for key, topic in result.get("topics", {}).items():
        for field in ("assessment", "review"):
            if field in topic:
                topic[field]["pending"] = _pending(
                    key, topic[field], observations, links
                )
    return result
