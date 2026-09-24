"""Assemble relevant planning evidence; teaching decisions remain with the tutor."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from learning.briefing import route_position
from learning.course import context_for_plan
from learning.records import read
from learning.retrieval import (
    AUTOMATIC_EVIDENCE_BYTES,
    AUTOMATIC_KNOWLEDGE_BYTES,
    knowledge_context,
    select_evidence,
)
from learning.schema import route_parts, source_ids, task_parts
from sync.study.context import journal_summary

COURSE_FIELDS = ("title", "goal", "coverage", "exam", "status", "journal_activity")


def _journal(vault: Path, days: int, today: date, horizon: int) -> dict[str, Any]:
    try:
        journal = journal_summary(vault, days=days, today=today, horizon=horizon)
        journal.pop("daily", None)
        return journal
    except (ValueError, OSError) as error:
        return {"error": str(error)}


def _study_status(state: dict[str, Any], journal: dict[str, Any]) -> dict[str, Any]:
    by_activity = journal.get("by_activity", {})
    assert isinstance(by_activity, dict)
    activity = state.get("journal_activity")
    recorded = by_activity.get(activity) if isinstance(activity, str) else None
    if not activity:
        status = "unmapped"
    elif "error" in journal or not journal.get("available_day_count"):
        status = "unavailable"
    else:
        status = "recorded" if recorded else "not_recorded"
    return {
        "status": status,
        "recorded_study_minutes": recorded["study_minutes"] if recorded else None,
        "session_count": recorded["session_count"] if recorded else None,
    }


def _topic_support(state: dict[str, Any]) -> tuple[set[str], dict[str, Any]]:
    """Evidence handles cited by interpretations, plus whole topic histories where needed."""
    selected: set[str] = set()
    topic_context = {}
    observations = state.get("observations", {})
    for key, topic in state.get("topics", {}).items():
        assessment = topic.get("assessment")
        review = topic.get("review")
        history = {
            handle for handle, item in observations.items() if key in item["topics"]
        }
        if assessment is None:
            selected.update(history)
        for decision in (assessment, review):
            if decision:
                selected.update(decision["observations"])
                if decision["pending"]:
                    selected.update(history)
        topic_context[key] = {
            **({"title": topic["title"]} if "title" in topic else {}),
            "assessment": assessment,
            **({"review": review} if review else {}),
        }
    return selected, topic_context


def _active_parts(state: dict[str, Any]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    for task in state.get("tasks", {}).values():
        parts.extend((task, *task_parts(task, active_only=True)))
    if state.get("route"):
        parts.extend(route_parts(state["route"], active_only=True))
    return parts


def _course(
    slug: str,
    state: dict[str, Any],
    journal: dict[str, Any],
    today: date,
    *,
    scoped: bool,
    knowledge_budget: int | None,
    evidence_budget: int,
) -> dict[str, Any]:
    selected, topic_context = _topic_support(state)
    source_context = context_for_plan(state)
    referenced = set(source_context.get("sources", {}))
    active_topics = set(state.get("focus", []))
    for part in _active_parts(state):
        active_topics.update(part.get("topics", []))
        selected.update(part.get("observations", []))
        referenced.update(source_ids(part))
    bounded = select_evidence(
        state,
        sorted(selected, key=lambda key: int(key[1:]), reverse=True),
        topics=topic_context,
        budget=evidence_budget,
    )
    supporting = bounded["observations"]
    bounded["selection"]["scope_complete"] = len(supporting) == len(
        state["observations"]
    )
    for observation in supporting.values():
        referenced.update(source_ids(observation))
    source_context["sources"] = {
        key: state["sources"][key] for key in sorted(referenced)
    }
    selection = {"evidence": bounded["selection"]}
    if scoped:
        chosen = knowledge_context(
            state,
            sorted(active_topics),
            source_context["sources"],
            budget=AUTOMATIC_KNOWLEDGE_BYTES
            if knowledge_budget is None
            else knowledge_budget,
        )
        source_context["sources"].update(chosen.pop("sources"))
        source_context["knowledge"] = chosen["knowledge"]
        selection["knowledge"] = chosen["selection"]
    else:
        source_context["knowledge_count"] = len(state.get("knowledge", {}))
    exam = date.fromisoformat(state["exam"]) if state.get("exam") else None
    return {
        "scope": slug,
        "revision": state["revision"],
        "digest": state["digest"],
        **{key: state[key] for key in COURSE_FIELDS if key in state},
        "days_to_exam": (exam - today).days if exam else None,
        "route": route_position(state["route"]) if state.get("route") else None,
        "unfinished": state.get("tasks", {}),
        "topics": bounded["topics"],
        "observations": supporting,
        "selection": selection,
        "recent_study": _study_status(state, journal),
        **source_context,
    }


def _reviews(
    slug: str, state: dict[str, Any], course: dict[str, Any], today: date
) -> list[dict[str, Any]]:
    exam = date.fromisoformat(state["exam"]) if state.get("exam") else None
    finished = (exam is not None and exam < today) or state.get("status") == "completed"
    reviews = []
    for topic, topic_state in state.get("topics", {}).items():
        review = topic_state.get("review")
        if not review or "due" not in review or (finished and not review.get("retain")):
            continue
        due = date.fromisoformat(review["due"])
        reviews.append(
            {
                "scope": slug,
                "topic": topic,
                **review,
                "due_now": due <= today,
                "support_in_context": "review" in course["topics"].get(topic, {}),
            }
        )
    return reviews


def plan(
    root: Path,
    vault: Path,
    scope: str | None = None,
    days: int = 7,
    *,
    horizon: int = 7,
    knowledge_budget: int | None = None,
    evidence_budget: int = AUTOMATIC_EVIDENCE_BYTES,
) -> dict[str, Any]:
    if type(evidence_budget) is not int or evidence_budget < 2:
        raise ValueError("evidence_budget must be at least 2 bytes")
    if knowledge_budget is not None and (
        scope is None or type(knowledge_budget) is not int or knowledge_budget < 1
    ):
        raise ValueError(
            "knowledge_budget must be positive and requires a single scope"
        )
    today = date.today()
    errors: list[dict[str, Any]] = []
    if scope is not None:
        scopes = [scope]
    else:
        catalog = read(root, None)
        assert isinstance(catalog, list)
        scopes = [item["scope"] for item in catalog if "error" not in item]
        errors = [item for item in catalog if "error" in item]
    journal = _journal(vault, days, today, horizon)
    courses = []
    reviews: list[dict[str, Any]] = []
    for slug in scopes:
        state = read(root, slug)
        assert isinstance(state, dict)
        if state.get("revision") == 0:
            continue
        course = _course(
            slug,
            state,
            journal,
            today,
            scoped=scope is not None,
            knowledge_budget=knowledge_budget,
            evidence_budget=evidence_budget,
        )
        courses.append(course)
        reviews.extend(_reviews(slug, state, course, today))
    reviews.sort(key=lambda item: (item["due"], item["scope"], item["topic"]))
    return {
        "today": today.isoformat(),
        "scopes": courses,
        "reviews": reviews,
        "journal": journal,
        "errors": errors,
    }
