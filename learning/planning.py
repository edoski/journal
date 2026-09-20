"""Assemble relevant planning evidence; teaching decisions remain with the tutor."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from learning.course import context_for_plan
from learning import task_context
from sync.study.context import journal_summary
from learning.records import read, source_ids
from learning.retrieval import evidence


def plan(
    root: Path,
    vault: Path,
    scope: str | None = None,
    days: int = 7,
    *,
    horizon: int = 7,
) -> dict[str, Any]:
    today = date.today()
    errors = []
    if scope is not None:
        scopes = [scope]
    else:
        catalog = read(root, None)
        assert isinstance(catalog, list)
        scopes = [item["scope"] for item in catalog if "error" not in item]
        errors = [item for item in catalog if "error" in item]
    try:
        journal = journal_summary(vault, days=days, today=today, horizon=horizon)
        journal.pop("daily", None)
    except (ValueError, OSError) as error:
        journal = {"error": str(error)}
    by_activity = journal.get("by_activity", {})
    assert isinstance(by_activity, dict)
    courses = []
    reviews = []
    for slug in scopes:
        state = read(root, slug)
        assert isinstance(state, dict)
        if state.get("revision") == 0:
            continue
        selected: set[str] = set()
        topic_context = {}
        for key, topic in state.get("topics", {}).items():
            assessment = topic.get("assessment")
            review = topic.get("review")
            if assessment is None:
                selected.update(
                    handle
                    for handle, observation in state["observations"].items()
                    if key in observation["topics"]
                )
            for decision in (assessment, review):
                if decision:
                    selected.update(decision["observations"])
                    if decision["pending"]:
                        selected.update(
                            handle
                            for handle, observation in state["observations"].items()
                            if key in observation["topics"]
                        )
            topic_context[key] = {
                **({"title": topic["title"]} if "title" in topic else {}),
                "assessment": assessment,
                **({"review": review} if review else {}),
            }
        source_context = context_for_plan(state)
        referenced_sources = set(source_context.get("sources", {}))
        for task in state.get("tasks", {}).values():
            for part in (task, *task_context.parts(task, active_only=True)):
                selected.update(part.get("observations", []))
                referenced_sources.update(source_ids(part))
        supporting = evidence(state, list(selected))
        for observation in supporting.values():
            referenced_sources.update(source_ids(observation))
        source_context["sources"] = {
            key: state["sources"][key] for key in sorted(referenced_sources)
        }
        exam = date.fromisoformat(state["exam"]) if state.get("exam") else None
        activity = state.get("journal_activity")
        recorded = by_activity.get(activity) if isinstance(activity, str) else None
        if not activity:
            study_status = "unmapped"
        elif "error" in journal or not journal.get("available_day_count"):
            study_status = "unavailable"
        else:
            study_status = "recorded" if recorded else "not_recorded"
        courses.append(
            {
                "scope": slug,
                **{
                    key: state[key]
                    for key in (
                        "title",
                        "goal",
                        "coverage",
                        "exam",
                        "status",
                        "journal_activity",
                    )
                    if key in state
                },
                "days_to_exam": (exam - today).days if exam else None,
                "unfinished": state.get("tasks", {}),
                "topics": topic_context,
                "observations": supporting,
                "recent_study": {
                    "status": study_status,
                    "recorded_study_minutes": recorded["study_minutes"]
                    if recorded
                    else None,
                    "session_count": recorded["session_count"] if recorded else None,
                },
                **source_context,
            }
        )
        for topic, topic_state in state.get("topics", {}).items():
            review = topic_state.get("review")
            if not review or "due" not in review:
                continue
            if (
                exam and exam < today or state.get("status") == "completed"
            ) and not review.get("retain"):
                continue
            due = date.fromisoformat(review["due"])
            reviews.append(
                {"scope": slug, "topic": topic, **review, "due_now": due <= today}
            )
    reviews.sort(key=lambda item: (item["due"], item["scope"], item["topic"]))
    return {
        "today": today.isoformat(),
        "scopes": courses,
        "reviews": reviews,
        "journal": journal,
        "errors": errors,
    }
