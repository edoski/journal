"""Shared deterministic period fixtures for rendering tests."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.dates import daterange
from sync.contracts.media import Book

FIXTURE_MEDIA_BUNDLE = MediaBundle(
    books=[
        Book(
            title="Fixture Book",
            author="Fixture Author",
            completed=datetime.date(2020, 1, 1),
            rating=None,
        )
    ],
    podcasts=[],
    series=[],
)


def _clock_to_minutes(hour: int, minute: int) -> int:
    """Convert clock values to minutes since midnight."""
    return hour * 60 + minute


def payload_for_date(day: datetime.date) -> dict:
    """Create deterministic daily payload for period fixture tests."""
    idx = day.toordinal()
    study = float((idx % 8) * 60)
    coding = float(round(study * 0.65))
    reading = float(max(0.0, study - coding))
    workout = idx % 3 == 0
    stretch = idx % 2 == 0

    training_type_minutes: dict[str, float] = {}
    training_type_sessions: dict[str, int] = {}
    training_type_duration_minutes: dict[str, tuple[float, ...]] = {}
    training_type_interrupt_minutes: dict[str, tuple[float, ...]] = {}
    training_type_start_minutes: dict[str, tuple[int, ...]] = {}
    training_type_end_minutes: dict[str, tuple[int, ...]] = {}

    if workout:
        start_min = _clock_to_minutes(18, 0 + (idx % 20))
        interrupt_min = float(idx % 5)
        end_min = start_min + 33 + int(interrupt_min)
        training_type_minutes["Functional Strength Training"] = 33.0
        training_type_sessions["Functional Strength Training"] = 1
        training_type_duration_minutes["Functional Strength Training"] = (33.0,)
        training_type_interrupt_minutes["Functional Strength Training"] = (
            interrupt_min,
        )
        training_type_start_minutes["Functional Strength Training"] = (start_min,)
        training_type_end_minutes["Functional Strength Training"] = (end_min,)

    if stretch:
        start_min = _clock_to_minutes(19, 0 + (idx % 15))
        interrupt_min = float(idx % 3)
        end_min = start_min + 26 + int(interrupt_min)
        training_type_minutes["Cooldown"] = 26.0
        training_type_sessions["Cooldown"] = 1
        training_type_duration_minutes["Cooldown"] = (26.0,)
        training_type_interrupt_minutes["Cooldown"] = (interrupt_min,)
        training_type_start_minutes["Cooldown"] = (start_min,)
        training_type_end_minutes["Cooldown"] = (end_min,)

    return {
        "study_minutes": study,
        "sleep_minutes": float(390 + (idx % 7) * 15),
        "workout": workout,
        "stretch": stretch,
        "awake_minutes": float(10 + (idx % 5) * 5),
        "sleep_asleep_time": f"{22 + (idx % 3)}:{(idx % 4) * 15:02d}",
        "sleep_awake_time": f"{6 + (idx % 3)}:{(idx % 4) * 15:02d}",
        "activity_totals": (
            {"coding": coding, "reading": reading} if study > 0 else {}
        ),
        "interrupt_minutes": float((idx % 6) * 3),
        "overrun_minutes": float((idx % 5) * 2),
        "planned_break_minutes": float(5 + (idx % 3) * 5),
        "training_type_minutes": training_type_minutes,
        "training_type_sessions": training_type_sessions,
        "training_type_duration_minutes": training_type_duration_minutes,
        "training_type_interrupt_minutes": training_type_interrupt_minutes,
        "training_type_start_minutes": training_type_start_minutes,
        "training_type_end_minutes": training_type_end_minutes,
    }


def range_data(start: datetime.date, end: datetime.date) -> dict[datetime.date, dict]:
    """Build deterministic day->payload mapping for a date range."""
    return {day: payload_for_date(day) for day in daterange(start, end)}
