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
    goal_cache_dir = cache_root / "goals"
    media_cache_dir = cache_root / "media"
    training_cache_dir = cache_root / "daily" / "training"
    screen_cache_dir = cache_root / "daily" / "screen_time"
    note_lock_dir = cache_root / "locks" / "notes"
    state_lock_dir = cache_root / "locks" / "state"

    monkeypatch.setattr(
        "sync.adapters.json_goal_cache.GOAL_CACHE_DIR", str(goal_cache_dir)
    )
    monkeypatch.setattr(
        "sync.adapters.json_goal_cache.STATE_LOCK_DIR", str(state_lock_dir)
    )
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
        "sync.adapters.json_daily_cache.SCREEN_TIME_CACHE_DIR", str(screen_cache_dir)
    )
    monkeypatch.setattr(
        "sync.adapters.json_daily_cache.STATE_LOCK_DIR", str(state_lock_dir)
    )
    monkeypatch.setattr("sync.notes.locking.NOTE_LOCK_DIR", str(note_lock_dir))
    monkeypatch.setattr("sync.notes.locking._PRUNED_LOCK_ROOTS", set())

    yield


@pytest.fixture
def sample_daily_data() -> dict[datetime.date, dict[str, Any]]:
    """Sample daily data for testing aggregation and chart functions."""
    return {
        datetime.date(2025, 12, 23): {
            "study_minutes": 420,  # 7 hours - meets target
            "sleep_minutes": 480,  # 8 hours
            "mood": 7.5,
            "workout": True,
            "stretch": True,
            "awake_minutes": 15,
            "awakenings": 2,
            "activity_totals": {"coding": 300, "reading": 120},
            "interrupt_minutes": 10,
            "overrun_minutes": 5,
        },
        datetime.date(2025, 12, 24): {
            "study_minutes": 180,  # 3 hours - below target
            "sleep_minutes": 420,  # 7 hours
            "mood": 6.0,
            "workout": False,
            "stretch": True,
            "awake_minutes": 20,
            "awakenings": 3,
            "activity_totals": {"coding": 180},
            "interrupt_minutes": 5,
            "overrun_minutes": 0,
        },
        datetime.date(2025, 12, 25): {
            "study_minutes": 0,  # No study
            "sleep_minutes": 540,  # 9 hours
            "mood": 8.0,
            "workout": True,
            "stretch": False,
            "awake_minutes": 10,
            "awakenings": 1,
            "activity_totals": {},
            "interrupt_minutes": 0,
            "overrun_minutes": 0,
        },
        datetime.date(2025, 12, 26): {
            "study_minutes": 360,  # 6 hours - meets target exactly
            "sleep_minutes": 450,  # 7.5 hours
            "mood": 7.0,
            "workout": True,
            "stretch": True,
            "awake_minutes": 25,
            "awakenings": 4,
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
        "mood: 7.5",
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
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |",
        "| ---- | -------- | -------- | --------- | ----- | ------- | ----- |",
        "| 09:00 | `coding` | `2h00m` | `+10m` | `15m (+5m)` | [[coding.md]] | note |",
        "| 14:00 | `reading` | `1h30m` | `` | `10m` | – | – |",
        "",
    ]


@pytest.fixture
def sample_sleep_table_lines() -> list[str]:
    """Sample lines containing a SLEEP table."""
    return [
        "### **SLEEP**",
        "",
        "| TIME | DURATION | AWAKE | AWAKENINGS |",
        "| ---- | -------- | ----- | ---------- |",
        "| 23:00-07:00 | `8h00m` | `20m` | `2` |",
        "",
    ]


@pytest.fixture
def sample_goals_section_lines() -> list[str]:
    """Sample Goals section with subsections."""
    return [
        "## Goals",
        "---",
        "### **STUDY**",
        "- [x] Complete chapter 5 ^gid-abc1234567",
        "- [ ] Review notes ^gid-def1234567",
        "",
        "### **HEALTH**",
        "- [x] Morning workout ^gid-ghi1234567",
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
