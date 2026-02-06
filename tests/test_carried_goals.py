"""Tests for carried_goals cache management."""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from sync.carried_goals import (
    cleanup_old_entries,
    get_carried_ids,
    get_deleted_ids,
    get_prior_period_key,
    prune_deleted_ids,
    record_carried_ids,
    record_deleted_ids,
)
from sync.daily.goals import carry_forward_daily_tasks
from sync.goals_engine import carry_forward_with_tombstones
from sync.models.goals import Goal


def _goal(goal_id: str, body: str = "Task", done: bool = False) -> Goal:
    return Goal(id=goal_id, body=body, done=done)


def _write_daily_note(path: Path, daily_lines: list[str]) -> None:
    lines = [
        "## Goals",
        "",
        "### **WEEKLY**",
        "",
        "_No weekly goals have been defined yet._",
        "",
        "### **DAILY**",
        *daily_lines,
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


class TestGetPriorPeriodKey:
    """Tests for get_prior_period_key helper."""

    def test_daily_simple(self):
        """Test daily period subtraction."""
        assert get_prior_period_key("daily", "2026-02-05") == "2026-02-04"

    def test_daily_month_boundary(self):
        """Test daily across month boundary."""
        assert get_prior_period_key("daily", "2026-02-01") == "2026-01-31"

    def test_daily_year_boundary(self):
        """Test daily across year boundary."""
        assert get_prior_period_key("daily", "2026-01-01") == "2025-12-31"

    def test_weekly_simple(self):
        """Test weekly period subtraction."""
        assert get_prior_period_key("weekly", "2026-W06") == "2026-W05"

    def test_weekly_year_boundary(self):
        """Test weekly across year boundary."""
        result = get_prior_period_key("weekly", "2026-W01")
        assert result == "2025-W52"

    def test_weekly_53_week_year(self):
        """Test weekly for a year with 53 weeks (2020 had 53 weeks)."""
        result = get_prior_period_key("weekly", "2021-W01")
        assert result == "2020-W53"

    def test_monthly_simple(self):
        """Test monthly period subtraction."""
        assert get_prior_period_key("monthly", "2026-02") == "2026-01"

    def test_monthly_year_boundary(self):
        """Test monthly across year boundary."""
        assert get_prior_period_key("monthly", "2026-01") == "2025-12"

    def test_quarterly_simple(self):
        """Test quarterly period subtraction."""
        assert get_prior_period_key("quarterly", "2026-Q2") == "2026-Q1"
        assert get_prior_period_key("quarterly", "2026-Q3") == "2026-Q2"
        assert get_prior_period_key("quarterly", "2026-Q4") == "2026-Q3"

    def test_quarterly_year_boundary(self):
        """Test quarterly across year boundary."""
        assert get_prior_period_key("quarterly", "2026-Q1") == "2025-Q4"

    def test_unknown_period_type(self):
        """Test unknown period type returns None."""
        assert get_prior_period_key("yearly", "2026") is None
        assert get_prior_period_key("unknown", "something") is None

    def test_invalid_period_key_returns_none(self):
        """Malformed period keys should fail safely."""
        assert get_prior_period_key("monthly", "bad-key") is None
        assert get_prior_period_key("daily", "2026-99-99") is None


class TestCacheIntegration:
    """Integration tests for cache behavior during period transitions."""

    @pytest.fixture
    def temp_cache(self, tmp_path):
        """Create a temporary cache file."""
        cache_path = tmp_path / "carried_goals.json"
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(cache_path)):
            yield cache_path

    def test_monthly_transition_preserves_prior_month(self, temp_cache):
        """Transitioning months should keep previous month carried IDs."""
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)):
            record_carried_ids("monthly", "2026-01", ["gid-jan-1", "gid-jan-2"])
            prior_key = get_prior_period_key("monthly", "2026-02")
            assert prior_key == "2026-01"
            cleanup_old_entries("monthly", [prior_key, "2026-02"])
            assert get_carried_ids("monthly", "2026-01") == {"gid-jan-1", "gid-jan-2"}

    def test_cleanup_does_not_remove_deleted_tombstones(self, temp_cache):
        """Offered-ID cleanup should not touch tombstones."""
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)):
            record_carried_ids("monthly", "2026-01", ["gid-old"])
            record_deleted_ids("monthly", "2026-01", ["gid-old"])

            cleanup_old_entries("monthly", ["2026-02"])

            assert get_carried_ids("monthly", "2026-01") == set()
            assert get_deleted_ids("monthly") == {"gid-old"}

    def test_deleted_goal_not_re_added_across_month_boundary(self, temp_cache):
        """Deleted goal should stay suppressed in later months."""
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)):
            prev_tasks = [_goal("gid-abc", "Goal A", done=False)]

            # First February run: goal is offered into current month.
            current_tasks, added = carry_forward_with_tombstones(
                prev_tasks, [], "2026-02", "monthly"
            )
            assert added == 1
            assert {g.id for g in current_tasks} == {"gid-abc"}

            # User deletes it from February note; second run records tombstone.
            deleted_view, added = carry_forward_with_tombstones(
                prev_tasks, [], "2026-02", "monthly"
            )
            assert added == 0
            assert deleted_view == []
            assert get_deleted_ids("monthly") == {"gid-abc"}

            # March run should not re-add tombstoned goal.
            march_tasks, added = carry_forward_with_tombstones(
                prev_tasks, [], "2026-03", "monthly"
            )
            assert added == 0
            assert march_tasks == []

    def test_explicit_readd_clears_tombstone(self, temp_cache):
        """If user re-adds a tombstoned goal, suppression should clear."""
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)):
            record_deleted_ids("monthly", "2026-02", ["gid-abc"])

            current_tasks = [_goal("gid-abc", "Goal A", done=False)]
            carry_forward_with_tombstones(
                [_goal("gid-abc", "Goal A")], current_tasks, "2026-03", "monthly"
            )

            assert get_deleted_ids("monthly") == set()

    def test_prune_deleted_ids_respects_monthly_window(self, temp_cache):
        """Monthly tombstones should be bounded to retention window."""
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)):
            keys: list[str] = []
            key: str | None = "2026-12"
            for _ in range(40):
                if key is None:
                    break
                keys.append(key)
                key = get_prior_period_key("monthly", key)

            for idx, period_key in enumerate(keys):
                record_deleted_ids("monthly", period_key, [f"gid-{idx:04d}"])

            prune_deleted_ids("monthly", "2026-12")

            payload = json.loads(temp_cache.read_text(encoding="utf-8"))
            deleted = payload.get("_deleted", {}).get("monthly", {})
            assert isinstance(deleted, dict)
            assert len(deleted) == 36
            assert set(deleted.values()) == set(keys[:36])

    def test_prune_deleted_ids_handles_legacy_shape(self, temp_cache):
        """Malformed legacy tombstone cache should fail safe."""
        temp_cache.write_text(
            json.dumps(
                {
                    "monthly": {"2026-02": ["gid-abc"]},
                    "_deleted": ["unexpected"],
                }
            ),
            encoding="utf-8",
        )
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)):
            prune_deleted_ids("monthly", "2026-02")
            assert get_deleted_ids("monthly") == set()

    def test_daily_tombstone_blocks_future_day(self, temp_cache, tmp_path):
        """Daily carry-forward should suppress deleted goals on later days."""
        journal_dir = tmp_path / "journal"
        journal_dir.mkdir()

        _write_daily_note(
            journal_dir / "2026-02-05.md",
            ["- [ ] Ask Prof. Bacchiega ^gid-d1b9dadad0"],
        )
        _write_daily_note(
            journal_dir / "2026-02-06.md",
            ["- [ ] Ask Prof. Bacchiega ^gid-d1b9dadad0"],
        )

        with (
            patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)),
            patch("sync.daily.goals.JOURNAL_DIR", str(journal_dir)),
        ):
            # First run offers goal to 2026-02-06.
            _, added = carry_forward_daily_tasks(
                today_date=datetime.date(2026, 2, 6),
                yesterday_date=datetime.date(2026, 2, 5),
                existing_daily_tasks=[],
            )
            assert added == 1

            # User deletes it from today's note; second run records tombstone.
            tasks_after_delete, added = carry_forward_daily_tasks(
                today_date=datetime.date(2026, 2, 6),
                yesterday_date=datetime.date(2026, 2, 5),
                existing_daily_tasks=[],
            )
            assert added == 0
            assert tasks_after_delete == []
            assert get_deleted_ids("daily") == {"gid-d1b9dadad0"}

            # Next day should still suppress it.
            tasks_next_day, added = carry_forward_daily_tasks(
                today_date=datetime.date(2026, 2, 7),
                yesterday_date=datetime.date(2026, 2, 6),
                existing_daily_tasks=[],
            )
            assert added == 0
            assert tasks_next_day == []
