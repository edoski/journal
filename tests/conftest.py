"""
Pytest configuration and shared fixtures for journal sync tests.
"""

from __future__ import annotations

import datetime
import pytest
from typing import Any


@pytest.fixture(autouse=True)
def isolate_cache_dirs(tmp_path, monkeypatch):
    """
    Automatically isolate all tests from production cache/lock directories.

    New cache adapters resolve defaults at runtime, so monkeypatching these
    module-level constants keeps every test sandboxed under tmp_path.
    """
    cache_root = tmp_path / "cache"
    media_cache_dir = cache_root / "media"
    training_cache_dir = cache_root / "daily" / "training"
    note_lock_dir = cache_root / "locks" / "notes"
    state_lock_dir = cache_root / "locks" / "state"

    monkeypatch.setattr(
        "sync.adapters.json_media_cache.MEDIA_CACHE_DIR", str(media_cache_dir)
    )
    monkeypatch.setattr(
        "sync.adapters.json_media_cache.STATE_LOCK_DIR", str(state_lock_dir)
    )
    monkeypatch.setattr(
        "sync.adapters.json_daily_cache.TRAINING_CACHE_DIR", str(training_cache_dir)
    )
    monkeypatch.setattr(
        "sync.adapters.json_daily_cache.STATE_LOCK_DIR", str(state_lock_dir)
    )
    monkeypatch.setattr(
        "sync.adapters.markdown_notes.NOTE_LOCK_DIR", str(note_lock_dir)
    )
    monkeypatch.setattr("sync.notes.locking._PRUNED_LOCK_ROOTS", set())

    yield


@pytest.fixture
def sample_daily_data() -> dict[datetime.date, dict[str, Any]]:
    """Sample daily data for testing aggregation and chart functions."""
    return {
        datetime.date(2025, 12, 23): {
            "study_minutes": 420,  # 7 hours - meets target
            "sleep_minutes": 480,  # 8 hours
            "workout": True,
            "stretch": True,
            "awake_minutes": 15,
            "sleep_asleep_time": "22:30",
            "sleep_awake_time": "06:30",
            "activity_totals": {"coding": 300, "reading": 120},
            "interrupt_minutes": 10,
            "overrun_minutes": 5,
        },
        datetime.date(2025, 12, 24): {
            "study_minutes": 180,  # 3 hours - below target
            "sleep_minutes": 420,  # 7 hours
            "workout": False,
            "stretch": True,
            "awake_minutes": 20,
            "sleep_asleep_time": "23:00",
            "sleep_awake_time": "07:00",
            "activity_totals": {"coding": 180},
            "interrupt_minutes": 5,
            "overrun_minutes": 0,
        },
        datetime.date(2025, 12, 25): {
            "study_minutes": 0,  # No study
            "sleep_minutes": 540,  # 9 hours
            "workout": True,
            "stretch": False,
            "awake_minutes": 10,
            "sleep_asleep_time": "22:00",
            "sleep_awake_time": "07:00",
            "activity_totals": {},
            "interrupt_minutes": 0,
            "overrun_minutes": 0,
        },
        datetime.date(2025, 12, 26): {
            "study_minutes": 360,  # 6 hours - meets target exactly
            "sleep_minutes": 450,  # 7.5 hours
            "workout": True,
            "stretch": True,
            "awake_minutes": 25,
            "sleep_asleep_time": "23:15",
            "sleep_awake_time": "06:45",
            "activity_totals": {"coding": 200, "writing": 160},
            "interrupt_minutes": 15,
            "overrun_minutes": 10,
        },
    }


@pytest.fixture
def sample_week_dates() -> list[datetime.date]:
    """A full week of dates (Mon-Sun) for testing."""
    return [datetime.date(2025, 12, 22) + datetime.timedelta(days=i) for i in range(7)]


@pytest.fixture
def sample_frontmatter_lines() -> list[str]:
    """Sample markdown lines with valid frontmatter."""
    return [
        "---",
        "date: 2025-12-26",
        "workout: true",
        "stretch: false",
        "sleep: 7h30m",
        "---",
        "",
        "# Daily Note",
        "",
        "## Metrics",
        "---",
    ]


@pytest.fixture
def sample_study_table_lines() -> list[str]:
    """Sample lines containing a STUDY table."""
    return [
        "### **STUDY**",
        "",
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
        "| ---- | -------- | -------- | --------- | ----- |",
        "| 09:00 | `coding` | `2h00m` | `+10m` | `15m (+5m)` |",
        "| 14:00 | `reading` | `1h30m` | `` | `10m` |",
        "",
    ]


@pytest.fixture
def sample_sleep_table_lines() -> list[str]:
    """Sample lines containing a SLEEP table."""
    return [
        "### **SLEEP**",
        "",
        "| TIME | ASLEEP | AWAKE |",
        "| ---- | -------- | ----- |",
        "| 23:00-07:00 | `8h00m` | `20m` |",
        "",
    ]


def assert_lines_equal(actual: list[str], expected: list[str], msg: str = "") -> None:
    """Helper to compare multi-line output with clear diff on failure."""
    if actual != expected:
        # Build a detailed diff message
        diff_lines = []
        max_len = max(len(actual), len(expected))
        for i in range(max_len):
            a = actual[i] if i < len(actual) else "<missing>"
            e = expected[i] if i < len(expected) else "<missing>"
            if a != e:
                diff_lines.append(f"  Line {i}: expected {repr(e)}")
                diff_lines.append(f"           got      {repr(a)}")

        full_msg = f"{msg}\n" if msg else ""
        full_msg += f"Line count: expected {len(expected)}, got {len(actual)}\n"
        full_msg += "Differences:\n" + "\n".join(diff_lines)
        pytest.fail(full_msg)
