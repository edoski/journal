"""Shared deterministic period fixtures for rendering tests."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.dates import daterange
from sync.models.media import Book

FIXTURE_MEDIA_BUNDLE = MediaBundle(
    books=[
        Book(
            title="Fixture Book",
            author="Fixture Author",
            started=datetime.date(2019, 12, 1),
            completed=datetime.date(2020, 1, 1),
            rating=None,
        )
    ],
    podcasts=[],
)


def payload_for_date(day: datetime.date) -> dict:
    """Create deterministic daily payload for period fixture tests."""
    idx = day.toordinal()
    study = float((idx % 8) * 60)
    coding = float(round(study * 0.65))
    reading = float(max(0.0, study - coding))
    return {
        "study_minutes": study,
        "sleep_minutes": float(390 + (idx % 7) * 15),
        "mood": float(4.5 + (idx % 11) * 0.5),
        "workout": idx % 3 == 0,
        "stretch": idx % 2 == 0,
        "meditate": idx % 4 in {0, 1},
        "awake_minutes": float(10 + (idx % 5) * 5),
        "awakenings": int((idx % 4) + 1),
        "activity_totals": (
            {"coding": coding, "reading": reading} if study > 0 else {}
        ),
        "interrupt_minutes": float((idx % 6) * 3),
        "overrun_minutes": float((idx % 5) * 2),
        "planned_break_minutes": float(5 + (idx % 3) * 5),
        "screen_time_totals": {
            "YouTube": float((idx % 4) * 12),
            "X": float((idx % 3) * 7),
            "Netflix": float(20 if idx % 5 == 0 else 0),
        },
    }


def range_data(start: datetime.date, end: datetime.date) -> dict[datetime.date, dict]:
    """Build deterministic day->payload mapping for a date range."""
    return {day: payload_for_date(day) for day in daterange(start, end)}
