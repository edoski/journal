"""Service-level tests for canonical goal synchronization flows."""

from __future__ import annotations

import datetime
from contextlib import contextmanager

from sync.adapters.json_goal_cache import (
    JsonGoalCarryForwardCacheStore,
    JsonGoalReconcileCacheStore,
)
from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.application.goal_note_gateway import DailyGoalSources, QuarterlyGoalSources
from sync.application.goal_sync_service import GoalSyncService
from sync.goals.reminders import get_reminders_for_date
from sync.goals.period_pipeline import MirrorSyncResult, PiercingSyncResult
from sync.contracts.goals import Goal
from sync.contracts.reminders import DailySchedule, ReminderRule
from sync.periods.windows import (
    build_quarter_window,
    build_week_window,
    build_year_window,
)


class _StubNoteStore:
    def __init__(self) -> None:
        self._notes: dict[str, list[str]] = {}

    def read(self, path: str) -> list[str] | None:
        lines = self._notes.get(path)
        return lines[:] if lines is not None else None

    def read_or_create(self, path: str, _template_path: str) -> list[str]:
        lines = self._notes.get(path)
        if lines is None:
            lines = ["## Goals", "", "## Metrics", "---", "", "## Reflections", ""]
            self._notes[path] = lines
        return lines[:]

    def write(self, path: str, lines: list[str]) -> None:
        self._notes[path] = lines[:]


class _StubGoalStore:
    def __init__(self) -> None:
        self.last_sections = []
        self.extract_calls = []

    def extract(
        self,
        _lines: list[str],
        section: str,
        horizon: str | None = None,
        period_key: str | None = None,
    ):
        self.extract_calls.append((section, horizon, period_key))
        return []

    def apply(self, lines: list[str], sections, *, insert_after_idx=None):
        _ = insert_after_idx
        self.last_sections = sections
        return lines

    def write(self, _path: str, lines: list[str], _sections, *, insert_after_idx=None):
        _ = insert_after_idx
        return lines


def test_sync_weekly_note_builds_monthly_and_weekly_sections(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    goal_store = _StubGoalStore()
    service = GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=JsonGoalCarryForwardCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
        reconcile_cache_store=JsonGoalReconcileCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
    )

    window = build_week_window(datetime.date(2026, 2, 6))
    note_path = str(tmp_path / window.filename)

    base_dir = tmp_path / "journal"
    base_dir.mkdir()
    monkeypatch.setattr(
        "sync.application.goal_sync_period.journal_path",
        lambda filename: str(base_dir / filename),
    )
    monkeypatch.setattr(
        service.gateway,
        "load_quarterly_sources",
        lambda _month_start: QuarterlyGoalSources(
            yearly_mirror=[],
            quarterly_tasks=[],
            path=str(base_dir / "2026-Q1.md"),
            lines=[],
        ),
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_period.load_source_tasks_with_carry_forward",
        lambda *_a, **_kw: [],
    )
    mirror_today_calls: list[datetime.date] = []
    pierce_today_calls: list[datetime.date] = []

    def _mirror_stub(*_args, **kwargs):
        mirror_today_calls.append(kwargs["today"])
        return MirrorSyncResult([], [], False, ["mirror"])

    def _pierce_stub(*_args, **kwargs):
        pierce_today_calls.append(kwargs["today"])
        return PiercingSyncResult(["source"], [[], []], [False, False])

    monkeypatch.setattr(
        "sync.application.goal_sync_period.sync_mirror_section",
        _mirror_stub,
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_period.sync_pierced_source_section",
        _pierce_stub,
    )

    lines = note_store.read_or_create(note_path, "unused")
    updated = service.sync_weekly_note(lines, note_path=note_path, window=window)

    assert updated == lines
    assert len(goal_store.last_sections) == 2
    assert goal_store.last_sections[0].section == "MONTHLY"
    assert goal_store.last_sections[0].lines == ["mirror"]
    assert goal_store.last_sections[1].section == "WEEKLY"
    assert goal_store.last_sections[1].lines == ["source"]
    monthly_calls = [call for call in goal_store.extract_calls if call[0] == "MONTHLY"]
    assert monthly_calls == [
        ("MONTHLY", "monthly", "2026-02"),
        ("MONTHLY", "monthly", "2026-02"),
    ]
    assert mirror_today_calls == [window.target_date]
    assert pierce_today_calls == [window.target_date]


def test_sync_yearly_note_uses_carry_forward(monkeypatch):
    note_store = _StubNoteStore()
    goal_store = _StubGoalStore()
    service = GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=_StubCarryCacheStore(),
        reconcile_cache_store=_StubReconcileCacheStore(),
    )

    window = build_year_window(2026, target_date=datetime.date(2026, 6, 1))
    lines = ["## Goals", "", "## Metrics"]

    carry_calls = []

    def _carry(prev_tasks, current_tasks, period_key, horizon, *, cache_store):
        carry_calls.append(
            (prev_tasks, current_tasks, period_key, horizon, cache_store)
        )
        return (
            [
                Goal(
                    body="Ship refactor",
                    done=False,
                    id="gid-m123456789",
                )
            ],
            1,
        )

    monkeypatch.setattr(
        "sync.application.goal_sync_period.carry_forward_with_tombstones",
        _carry,
    )

    updated = service.sync_yearly_note(lines, window=window)

    assert updated == lines
    assert len(carry_calls) == 1
    assert carry_calls[0][2:4] == ("2026", "yearly")
    assert isinstance(carry_calls[0][4], _StubCarryCacheStore)
    assert len(goal_store.last_sections) == 1
    assert goal_store.last_sections[0].section == "YEARLY"


def test_sync_quarterly_note_renders_empty_quarterly_placeholder(tmp_path):
    note_store = _StubNoteStore()
    goal_store = MarkdownGoalStore()
    service = GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=JsonGoalCarryForwardCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
        reconcile_cache_store=JsonGoalReconcileCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
    )

    lines = [
        "## Goals",
        "---",
        "### **YEARLY**",
        "",
        "### **QUARTERLY**",
        "",
        "## Metrics",
        "---",
    ]

    updated = service.sync_quarterly_note(
        lines,
        note_path=str(tmp_path / "2026-Q1.md"),
        window=build_quarter_window(
            2026,
            1,
            target_date=datetime.date(2026, 2, 15),
        ),
    )

    updated_text = "\n".join(updated)
    assert "_No yearly goals have been defined yet._" in updated_text
    assert "_No quarterly goals have been defined yet._" in updated_text


def test_sync_quarterly_note_uses_target_date_for_yearly_mirror(
    monkeypatch,
    tmp_path,
):
    note_store = _StubNoteStore()
    goal_store = _StubGoalStore()
    service = GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=_StubCarryCacheStore(),
        reconcile_cache_store=_StubReconcileCacheStore(),
    )

    mirror_today_calls: list[datetime.date] = []

    def _mirror_stub(*_args, **kwargs):
        mirror_today_calls.append(kwargs["today"])
        return MirrorSyncResult([], [], False, ["mirror"])

    monkeypatch.setattr(
        "sync.application.goal_sync_period.load_source_tasks_with_carry_forward",
        lambda *_a, **_kw: [],
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_period.sync_mirror_section",
        _mirror_stub,
    )

    updated = service.sync_quarterly_note(
        ["## Goals", "---", "### **YEARLY**", "", "### **QUARTERLY**", ""],
        note_path=str(tmp_path / "2026-Q1.md"),
        window=build_quarter_window(
            2026,
            1,
            target_date=datetime.date(2026, 2, 11),
        ),
    )

    assert updated == ["## Goals", "---", "### **YEARLY**", "", "### **QUARTERLY**", ""]
    assert mirror_today_calls == [datetime.date(2026, 2, 11)]


def test_sync_daily_note_removes_stale_reminder_ids(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    goal_store = MarkdownGoalStore()
    service = GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=JsonGoalCarryForwardCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
        reconcile_cache_store=JsonGoalReconcileCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
    )

    day = datetime.date(2026, 2, 14)
    rules = [ReminderRule(schedule=DailySchedule(), body="Do touch-toes stretch")]
    today_reminder = get_reminders_for_date(day, rules)[0]
    stale_reminder = get_reminders_for_date(day - datetime.timedelta(days=1), rules)[0]

    lines = [
        "## Goals",
        "---",
        "### **WEEKLY**",
        "",
        "_No weekly goals have been defined yet._",
        "",
        "### **DAILY**",
        f"- [ ] Do touch-toes stretch ^{stale_reminder.id}",
        f"- [ ] Do touch-toes stretch ^{today_reminder.id}",
        "- [ ] Manual carry task ^gid-m222222222",
        "",
        "## Metrics",
        "---",
    ]

    monkeypatch.setattr(
        "sync.application.goal_sync_daily.carry_forward_daily_tasks",
        lambda _today, _yesterday, existing_daily_tasks, **_kwargs: (
            existing_daily_tasks,
            0,
        ),
    )
    monkeypatch.setattr(
        service.gateway,
        "load_daily_sources",
        lambda _day: DailyGoalSources(
            weekly_tasks=[],
            monthly_tasks=[],
            quarterly_tasks=[],
            yearly_tasks=[],
            weekly_path="weekly.md",
            monthly_path="monthly.md",
            quarterly_path="quarterly.md",
        ),
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_daily.reconcile_goal_lists",
        lambda *_a, **_kw: ([], [], False, False),
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_daily.process_pierced_goals",
        lambda *_a, **kwargs: (
            kwargs["existing_tasks"],
            [],
            kwargs["source_goal_lists"],
        ),
    )

    updated = service.sync_daily_note(
        lines,
        day=day,
        note_path=str(tmp_path / "2026-02-14.md"),
        yaml_end_idx=-1,
        reminder_rules=rules,
    )
    updated_text = "\n".join(updated)
    assert stale_reminder.id not in updated_text
    assert updated_text.count(today_reminder.id) == 1
    assert "Manual carry task" in updated_text
    assert "_No daily goals have been defined yet._" not in updated_text

    updated_again = service.sync_daily_note(
        updated,
        day=day,
        note_path=str(tmp_path / "2026-02-14.md"),
        yaml_end_idx=-1,
        reminder_rules=rules,
    )
    assert updated_again == updated


def test_sync_daily_note_renders_empty_daily_placeholder(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    goal_store = MarkdownGoalStore()
    service = GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=JsonGoalCarryForwardCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
        reconcile_cache_store=JsonGoalReconcileCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
    )

    day = datetime.date(2026, 2, 14)
    lines = [
        "## Goals",
        "---",
        "### **WEEKLY**",
        "",
        "_No weekly goals have been defined yet._",
        "",
        "### **DAILY**",
        "",
        "## Metrics",
        "---",
    ]

    monkeypatch.setattr(
        "sync.application.goal_sync_daily.carry_forward_daily_tasks",
        lambda _today, _yesterday, existing_daily_tasks, **_kwargs: (
            existing_daily_tasks,
            0,
        ),
    )
    monkeypatch.setattr(
        service.gateway,
        "load_daily_sources",
        lambda _day: DailyGoalSources(
            weekly_tasks=[],
            monthly_tasks=[],
            quarterly_tasks=[],
            yearly_tasks=[],
            weekly_path="weekly.md",
            monthly_path="monthly.md",
            quarterly_path="quarterly.md",
        ),
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_daily.reconcile_goal_lists",
        lambda *_a, **_kw: ([], [], False, False),
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_daily.process_pierced_goals",
        lambda *_a, **kwargs: (
            kwargs["existing_tasks"],
            [],
            kwargs["source_goal_lists"],
        ),
    )

    updated = service.sync_daily_note(
        lines,
        day=day,
        note_path=str(tmp_path / "2026-02-14.md"),
        yaml_end_idx=-1,
        reminder_rules=[],
    )

    updated_text = "\n".join(updated)
    assert "_No daily goals have been defined yet._" in updated_text

    updated_again = service.sync_daily_note(
        updated,
        day=day,
        note_path=str(tmp_path / "2026-02-14.md"),
        yaml_end_idx=-1,
        reminder_rules=[],
    )
    assert updated_again == updated


def test_sync_daily_note_inserts_goals_after_yaml(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    goal_store = MarkdownGoalStore()
    service = GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=JsonGoalCarryForwardCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
        reconcile_cache_store=JsonGoalReconcileCacheStore(
            cache_dir=str(tmp_path / "cache" / "goals"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        ),
    )

    day = datetime.date(2026, 2, 14)
    lines = [
        "---",
        "date: 2026-02-14",
        "---",
        "## Metrics",
        "---",
    ]

    monkeypatch.setattr(
        "sync.application.goal_sync_daily.carry_forward_daily_tasks",
        lambda _today, _yesterday, existing_daily_tasks, **_kwargs: (
            existing_daily_tasks,
            0,
        ),
    )
    monkeypatch.setattr(
        service.gateway,
        "load_daily_sources",
        lambda _day: DailyGoalSources(
            weekly_tasks=[],
            monthly_tasks=[],
            quarterly_tasks=[],
            yearly_tasks=[],
            weekly_path="weekly.md",
            monthly_path="monthly.md",
            quarterly_path="quarterly.md",
        ),
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_daily.reconcile_goal_lists",
        lambda *_a, **_kw: ([], [], False, False),
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_daily.process_pierced_goals",
        lambda *_a, **kwargs: (
            kwargs["existing_tasks"],
            [],
            kwargs["source_goal_lists"],
        ),
    )

    updated = service.sync_daily_note(
        lines,
        day=day,
        note_path=str(tmp_path / "2026-02-14.md"),
        yaml_end_idx=2,
        reminder_rules=[],
    )

    assert updated[:7] == [
        "---",
        "date: 2026-02-14",
        "---",
        "## Goals",
        "---",
        "### **WEEKLY**",
        "",
    ]
    assert "## Metrics" in updated


class _StubCarryCacheStore:
    @contextmanager
    def locked_state(self):
        payload = {}
        yield payload


class _StubReconcileCacheStore:
    @contextmanager
    def locked_state(self):
        payload = {"goals": {}}
        yield payload
