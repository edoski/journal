"""Teaching preferences: one per-user file merged under each course's own values."""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any

from learning import storage
from learning.workspace import support_directory

DIMENSION = re.compile(r"[a-z][a-z0-9_]{0,39}")
_SCHEMA = 1

# The dimension the engine reads as well as the tutor, a count of days.
# ``final_review_days`` shapes the course's stored review dates, so it belongs
# to the course, never to the global preferences. Unset, the plan reads the
# length from his pace whenever the course is read (``capacity.final_reviews``).
FINAL_REVIEW_DAYS = "final_review_days"
COUNTS = {FINAL_REVIEW_DAYS: (1, 14)}
# Whether a course takes questions at all: "none" is a course studied without
# being asked (a project course), so it has no arc check. How to ask is the
# free-text ``question_style``; this is the one fact the engine reads.
QUESTIONS = "questions"
# Whether a course is a university course or a self-study: something he
# learns on his own, with no exam and no spaced reviews, done when every
# topic is taught. Unset is a course.
KIND = "kind"
SELF_STUDY = "self-study"
CHOICES = {QUESTIONS: ("asked", "none"), KIND: ("course", SELF_STUDY)}
# Course-only dimensions: why each belongs to one course, and an example value.
COURSE_ONLY = {
    FINAL_REVIEW_DAYS: ("it moves that course's review dates", "4"),
    QUESTIONS: ("it says whether that course takes questions", "none"),
    KIND: (
        "it says whether the course is a university course or self-study",
        SELF_STUDY,
    ),
}
# How much a day holds, and which days, come from what the learner completes.
LEARNED = frozenset({"daily_topics", "new_topics_on_weekends"})
_LEADING_NUMBER = re.compile(r"\s*(\d+)\b")


def global_path() -> Path:
    """The per-user preferences shared by every course."""
    return support_directory() / "preferences.json"


def dimension_name(value: str) -> str:
    """The closest valid dimension for free text, e.g. ``Teaching Style`` → ``teaching_style``."""
    name = re.sub(r"[^a-z0-9]+", "_", value.casefold()).strip("_")
    if not name or not name[0].isalpha():
        name = f"d_{name}".rstrip("_")
    return name[:40].rstrip("_")


def _dimension(value: Any, field: str) -> str:
    if not isinstance(value, str) or not DIMENSION.fullmatch(value):
        hint = (
            f"; did you mean {dimension_name(value)!r}?"
            if isinstance(value, str) and value.strip()
            else ""
        )
        raise ValueError(
            f"{field}: invalid dimension {value!r}; dimensions are 1–40 lowercase "
            f"letters, digits or underscores starting with a letter{hint}"
        )
    return value


def validate(changes: object, field: str) -> dict[str, str | None]:
    """Check a ``dimension → instruction`` patch; ``None`` deletes a dimension."""
    if not isinstance(changes, dict):
        raise ValueError(
            f"{field} must be an object mapping dimensions to instructions, "
            'e.g. {"teaching_style": "Concrete example first"}'
        )
    result: dict[str, str | None] = {}
    for key, value in changes.items():
        dimension = _dimension(key, field)
        if value is None:
            result[dimension] = None
        elif isinstance(value, str) and value.strip():
            result[dimension] = value.strip()
        else:
            raise ValueError(
                f"{field}.{dimension} must be a nonempty instruction, or null to delete it"
            )
    return result


def _count(value: str, low: int, high: int) -> int | None:
    match = _LEADING_NUMBER.match(value)
    number = int(match.group(1)) if match else None
    return number if number is not None and low <= number <= high else None


def check_engine(changes: dict[str, str | None], field: str) -> None:
    """Refuse an engine dimension the engine could not read, naming the fix."""
    for dimension, instruction in changes.items():
        if field != "preferences" and dimension in COURSE_ONLY:
            raise ValueError(
                f"{field}.{dimension} belongs to one course, since "
                f"{COURSE_ONLY[dimension][0]}; save it as "
                f'{{"preferences": {{"{dimension}": "{COURSE_ONLY[dimension][1]}"}}}}'
            )
        if instruction is None:
            continue
        if dimension in LEARNED:
            raise ValueError(
                f"{field}.{dimension} is not a setting: the daily plan holds what "
                "the learner actually completes on each weekday, learned from the "
                "record; send null to delete it"
            )
        if dimension in CHOICES and instruction not in CHOICES[dimension]:
            choices = " or ".join(f'"{choice}"' for choice in CHOICES[dimension])
            raise ValueError(
                f"{field}.{dimension} must be {choices}, not {instruction!r}"
            )
        if dimension in COUNTS and _count(instruction, *COUNTS[dimension]) is None:
            low, high = COUNTS[dimension]
            raise ValueError(
                f"{field}.{dimension} must start with a whole number from {low} to "
                f'{high}, e.g. "{low + 3}"'
            )


def count(preferences: dict[str, str], dimension: str, default: int) -> int:
    """An engine count from the preferences; the default when unset or unreadable."""
    value = preferences.get(dimension)
    number = _count(value, *COUNTS[dimension]) if value is not None else None
    return default if number is None else number


def merge(current: dict[str, str], changes: dict[str, str | None]) -> dict[str, str]:
    """Apply a validated patch; the result is ordered by dimension."""
    merged = dict(current)
    for dimension, instruction in changes.items():
        if instruction is None:
            merged.pop(dimension, None)
        else:
            merged[dimension] = instruction
    return dict(sorted(merged.items()))


def _stored(value: dict[str, Any] | None, path: Path) -> dict[str, str]:
    if value is None:
        return {}
    content = {key: item for key, item in value.items() if key not in storage.METADATA}
    if content.get("schema") != _SCHEMA or set(content) != {"schema", "preferences"}:
        raise ValueError(
            f"Unsupported global preferences at {path}; expected "
            '{"schema": 1, "preferences": {dimension: instruction}}'
        )
    preferences = validate(content["preferences"], "global_preferences")
    if any(instruction is None for instruction in preferences.values()):
        raise ValueError(f"Global preferences at {path} contain a null instruction")
    return {key: str(item) for key, item in sorted(preferences.items())}


def read_global() -> dict[str, str]:
    """The learner's preferences for every course; a missing file is empty."""
    path = global_path()
    return _stored(storage.load(path), path)


def save_global(changes: dict[str, str | None]) -> dict[str, str]:
    """Merge a validated patch into the per-user file under its lock."""
    path = global_path()
    with storage.lock(storage.lock_path(path)):
        current = _stored(storage.load(path), path)
        merged = merge(current, changes)
        if merged != current:
            content = {"schema": _SCHEMA, "preferences": merged}
            storage.publish_text(
                path, json.dumps(content, ensure_ascii=False, indent=2) + "\n"
            )
    return merged


def effective(course: dict[str, str]) -> dict[str, str]:
    """Global preferences overridden per dimension by the course's own."""
    return dict(sorted({**read_global(), **course}.items()))
