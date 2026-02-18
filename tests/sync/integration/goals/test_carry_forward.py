"""Tests for carried-goal cache management."""

from __future__ import annotations

import datetime
import json
from pathlib import Path

from sync.adapters.json_goal_cache import JsonGoalCarryForwardCacheStore
from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.goals.daily_pipeline import carry_forward_daily_tasks
from sync.goals.tombstones import (
    cleanup_old_entries,
    get_carried_ids,
    get_deleted_ids,
    get_prior_period_key,
    prune_deleted_ids,
    record_carried_ids,
    record_deleted_ids,
)
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


def _carry_store(tmp_path) -> JsonGoalCarryForwardCacheStore:
    return JsonGoalCarryForwardCacheStore(
        cache_dir=str(tmp_path / "cache" / "goals"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )


def _cache_snapshot(store: JsonGoalCarryForwardCacheStore):
    return store.load()


class TestGetPriorPeriodKey:
    """Tests for get_prior_period_key helper."""

    def test_daily_simple(self):
        assert get_prior_period_key("daily", "2026-02-05") == "2026-02-04"

    def test_daily_month_boundary(self):
        assert get_prior_period_key("daily", "2026-02-01") == "2026-01-31"

    def test_daily_year_boundary(self):
        assert get_prior_period_key("daily", "2026-01-01") == "2025-12-31"

    def test_weekly_simple(self):
        assert get_prior_period_key("weekly", "2026-W06") == "2026-W05"

    def test_weekly_year_boundary(self):
        assert get_prior_period_key("weekly", "2026-W01") == "2025-W52"

    def test_weekly_53_week_year(self):
        assert get_prior_period_key("weekly", "2021-W01") == "2020-W53"

    def test_monthly_simple(self):
        assert get_prior_period_key("monthly", "2026-02") == "2026-01"

    def test_monthly_year_boundary(self):
        assert get_prior_period_key("monthly", "2026-01") == "2025-12"

    def test_quarterly_simple(self):
        assert get_prior_period_key("quarterly", "2026-Q2") == "2026-Q1"
        assert get_prior_period_key("quarterly", "2026-Q3") == "2026-Q2"
        assert get_prior_period_key("quarterly", "2026-Q4") == "2026-Q3"

    def test_quarterly_year_boundary(self):
        assert get_prior_period_key("quarterly", "2026-Q1") == "2025-Q4"

    def test_yearly_simple(self):
        assert get_prior_period_key("yearly", "2026") == "2025"

    def test_unknown_period_type(self):
        assert get_prior_period_key("unknown", "something") is None

    def test_invalid_period_key_returns_none(self):
        assert get_prior_period_key("monthly", "bad-key") is None
        assert get_prior_period_key("daily", "2026-99-99") is None


class TestCacheIntegration:
    """Integration tests for cache behavior during period transitions."""

    def test_monthly_transition_preserves_prior_month(self, tmp_path):
        store = _carry_store(tmp_path)
        with store.locked_state() as cache:
            record_carried_ids(cache, "monthly", "2026-01", ["gid-jan-1", "gid-jan-2"])
            prior_key = get_prior_period_key("monthly", "2026-02")
            assert prior_key == "2026-01"
            cleanup_old_entries(cache, "monthly", [prior_key, "2026-02"])

        snapshot = _cache_snapshot(store)
        assert get_carried_ids(snapshot, "monthly", "2026-01") == {
            "gid-jan-1",
            "gid-jan-2",
        }

    def test_cleanup_does_not_remove_deleted_tombstones(self, tmp_path):
        store = _carry_store(tmp_path)
        with store.locked_state() as cache:
            record_carried_ids(cache, "monthly", "2026-01", ["gid-old"])
            record_deleted_ids(cache, "monthly", "2026-01", ["gid-old"])
            cleanup_old_entries(cache, "monthly", ["2026-02"])

        snapshot = _cache_snapshot(store)
        assert get_carried_ids(snapshot, "monthly", "2026-01") == set()
        assert get_deleted_ids(snapshot, "monthly") == {"gid-old"}

    def test_deleted_goal_not_re_added_across_month_boundary(self, tmp_path):
        store = _carry_store(tmp_path)
        prev_tasks = [_goal("gid-abc", "Goal A", done=False)]

        current_tasks, added = carry_forward_with_tombstones(
            prev_tasks,
            [],
            "2026-02",
            "monthly",
            cache_store=store,
        )
        assert added == 1
        assert {g.id for g in current_tasks} == {"gid-abc"}

        deleted_view, added = carry_forward_with_tombstones(
            prev_tasks,
            [],
            "2026-02",
            "monthly",
            cache_store=store,
        )
        assert added == 0
        assert deleted_view == []
        assert get_deleted_ids(_cache_snapshot(store), "monthly") == {"gid-abc"}

        march_tasks, added = carry_forward_with_tombstones(
            prev_tasks,
            [],
            "2026-03",
            "monthly",
            cache_store=store,
        )
        assert added == 0
        assert march_tasks == []

    def test_deleted_goal_not_re_added_across_year_boundary(self, tmp_path):
        store = _carry_store(tmp_path)
        prev_tasks = [_goal("gid-yearly", "Year Goal", done=False)]

        current_tasks, added = carry_forward_with_tombstones(
            prev_tasks,
            [],
            "2026",
            "yearly",
            cache_store=store,
        )
        assert added == 1
        assert {g.id for g in current_tasks} == {"gid-yearly"}

        deleted_view, added = carry_forward_with_tombstones(
            prev_tasks,
            [],
            "2026",
            "yearly",
            cache_store=store,
        )
        assert added == 0
        assert deleted_view == []
        assert get_deleted_ids(_cache_snapshot(store), "yearly") == {"gid-yearly"}

        next_year_tasks, added = carry_forward_with_tombstones(
            prev_tasks,
            [],
            "2027",
            "yearly",
            cache_store=store,
        )
        assert added == 0
        assert next_year_tasks == []

    def test_explicit_readd_clears_tombstone(self, tmp_path):
        store = _carry_store(tmp_path)
        with store.locked_state() as cache:
            record_deleted_ids(cache, "monthly", "2026-02", ["gid-abc"])

        current_tasks = [_goal("gid-abc", "Goal A", done=False)]
        carry_forward_with_tombstones(
            [_goal("gid-abc", "Goal A")],
            current_tasks,
            "2026-03",
            "monthly",
            cache_store=store,
        )

        assert get_deleted_ids(_cache_snapshot(store), "monthly") == set()

    def test_yearly_explicit_readd_clears_tombstone(self, tmp_path):
        store = _carry_store(tmp_path)
        with store.locked_state() as cache:
            record_deleted_ids(cache, "yearly", "2026", ["gid-yearly"])

        current_tasks = [_goal("gid-yearly", "Year Goal", done=False)]
        carry_forward_with_tombstones(
            [_goal("gid-yearly", "Year Goal")],
            current_tasks,
            "2027",
            "yearly",
            cache_store=store,
        )

        assert get_deleted_ids(_cache_snapshot(store), "yearly") == set()

    def test_prune_deleted_ids_respects_monthly_window(self, tmp_path):
        store = _carry_store(tmp_path)
        keys: list[str] = []
        key: str | None = "2026-12"
        for _ in range(40):
            if key is None:
                break
            keys.append(key)
            key = get_prior_period_key("monthly", key)

        with store.locked_state() as cache:
            for idx, period_key in enumerate(keys):
                record_deleted_ids(cache, "monthly", period_key, [f"gid-{idx:04d}"])
            prune_deleted_ids(cache, "monthly", "2026-12")

        payload = json.loads(Path(store.path).read_text(encoding="utf-8"))
        deleted = payload.get("_deleted", {}).get("monthly", {})
        assert isinstance(deleted, dict)
        assert len(deleted) == 36
        assert set(deleted.values()) == set(keys[:36])

    def test_prune_deleted_ids_respects_yearly_window(self, tmp_path):
        store = _carry_store(tmp_path)
        keys = [str(year) for year in range(2026, 2010, -1)]
        with store.locked_state() as cache:
            for idx, period_key in enumerate(keys):
                record_deleted_ids(cache, "yearly", period_key, [f"gid-y{idx:04d}"])
            prune_deleted_ids(cache, "yearly", "2026")

        payload = json.loads(Path(store.path).read_text(encoding="utf-8"))
        deleted = payload.get("_deleted", {}).get("yearly", {})
        assert isinstance(deleted, dict)
        assert len(deleted) == 12
        assert set(deleted.values()) == set(keys[:12])

    def test_daily_tombstone_blocks_future_day(self, tmp_path):
        journal_dir = tmp_path / "journal"
        journal_dir.mkdir()
        store = _carry_store(tmp_path)

        _write_daily_note(
            journal_dir / "2026-02-05.md",
            ["- [ ] Ask Prof. Bacchiega ^gid-md1b9dadad"],
        )
        _write_daily_note(
            journal_dir / "2026-02-06.md",
            ["- [ ] Ask Prof. Bacchiega ^gid-md1b9dadad"],
        )

        note_store = MarkdownNoteStore()
        goal_store = MarkdownGoalStore()

        _, added = carry_forward_daily_tasks(
            today_date=datetime.date(2026, 2, 6),
            yesterday_date=datetime.date(2026, 2, 5),
            existing_daily_tasks=[],
            carry_cache_store=store,
            note_store=note_store,
            goal_store=goal_store,
            journal_dir=str(journal_dir),
        )
        assert added == 1

        tasks_after_delete, added = carry_forward_daily_tasks(
            today_date=datetime.date(2026, 2, 6),
            yesterday_date=datetime.date(2026, 2, 5),
            existing_daily_tasks=[],
            carry_cache_store=store,
            note_store=note_store,
            goal_store=goal_store,
            journal_dir=str(journal_dir),
        )
        assert added == 0
        assert tasks_after_delete == []
        assert get_deleted_ids(_cache_snapshot(store), "daily") == {"gid-md1b9dadad"}

        tasks_next_day, added = carry_forward_daily_tasks(
            today_date=datetime.date(2026, 2, 7),
            yesterday_date=datetime.date(2026, 2, 6),
            existing_daily_tasks=[],
            carry_cache_store=store,
            note_store=note_store,
            goal_store=goal_store,
            journal_dir=str(journal_dir),
        )
        assert added == 0
        assert tasks_next_day == []

    def test_daily_carry_forward_excludes_reminder_ids(self, tmp_path):
        journal_dir = tmp_path / "journal"
        journal_dir.mkdir()
        store = _carry_store(tmp_path)

        _write_daily_note(
            journal_dir / "2026-02-05.md",
            [
                "- [ ] Reminder task ^gid-r111111111",
                "- [ ] Manual task ^gid-m222222222",
            ],
        )

        note_store = MarkdownNoteStore()
        goal_store = MarkdownGoalStore()

        tasks, added = carry_forward_daily_tasks(
            today_date=datetime.date(2026, 2, 6),
            yesterday_date=datetime.date(2026, 2, 5),
            existing_daily_tasks=[],
            carry_cache_store=store,
            note_store=note_store,
            goal_store=goal_store,
            journal_dir=str(journal_dir),
        )
        assert added == 1
        assert len(tasks) == 1
        assert tasks[0].id == "gid-m222222222"
