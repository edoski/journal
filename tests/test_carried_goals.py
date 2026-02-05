"""Tests for carried_goals cache management."""

import pytest
from unittest.mock import patch

from sync.carried_goals import (
    get_prior_period_key,
    get_carried_ids,
    record_carried_ids,
    cleanup_old_entries,
)


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
        # 2026-W01 should go back to 2025-W53 or 2025-W52 depending on year
        result = get_prior_period_key("weekly", "2026-W01")
        # 2025 has 52 weeks
        assert result == "2025-W52"

    def test_weekly_53_week_year(self):
        """Test weekly for a year with 53 weeks (2020 had 53 weeks)."""
        # 2021-W01 should go back to 2020-W53
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


class TestCacheIntegration:
    """Integration tests for cache behavior during period transitions."""

    @pytest.fixture
    def temp_cache(self, tmp_path):
        """Create a temporary cache file."""
        cache_path = tmp_path / "carried_goals.json"
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(cache_path)):
            yield cache_path

    def test_monthly_transition_preserves_prior_month(self, temp_cache):
        """Test that transitioning months doesn't lose prior month's data."""
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)):
            # January: record some goals
            record_carried_ids("monthly", "2026-01", ["gid-jan-1", "gid-jan-2"])

            # February: cleanup should keep both January and February
            prior_key = get_prior_period_key("monthly", "2026-02")
            assert prior_key == "2026-01"
            cleanup_old_entries("monthly", [prior_key, "2026-02"])

            # January's goals should still be accessible
            jan_ids = get_carried_ids("monthly", "2026-01")
            assert jan_ids == {"gid-jan-1", "gid-jan-2"}

    def test_monthly_transition_without_fix_loses_data(self, temp_cache):
        """Demonstrate the bug if we only keep current period."""
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)):
            # January: record some goals
            record_carried_ids("monthly", "2026-01", ["gid-jan-1", "gid-jan-2"])

            # BUG SIMULATION: cleanup with only February (the old behavior)
            cleanup_old_entries("monthly", ["2026-02"])

            # January's goals are LOST
            jan_ids = get_carried_ids("monthly", "2026-01")
            assert jan_ids == set()  # Empty - this is the bug!

    def test_deleted_goal_not_re_added_across_month_boundary(self, temp_cache):
        """Test the full scenario: goal deleted in Jan shouldn't reappear in Feb."""
        with patch("sync.carried_goals.CARRIED_GOALS_PATH", str(temp_cache)):
            # Scenario: User has goal "gid-abc" in January
            # It gets offered for carry-forward to January
            record_carried_ids("monthly", "2026-01", ["gid-abc"])

            # User deletes "gid-abc" from January note (just removes the line)
            # Now it's February, carry-forward runs

            # With the fix: cleanup keeps January
            prior_key = get_prior_period_key("monthly", "2026-02")
            cleanup_old_entries("monthly", [prior_key, "2026-02"])

            # When we check if "gid-abc" was already offered to Feb...
            # We look at Jan's cache (where we carried it from)
            jan_carried = get_carried_ids("monthly", "2026-01")

            # "gid-abc" is in January's cache, so it was already offered
            # This means it should NOT be re-added to February
            assert "gid-abc" in jan_carried
