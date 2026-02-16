"""Integration-style tests for the port-driven daily sync service."""

from __future__ import annotations

import datetime
from pathlib import Path

import pytest

from sync.adapters.json_daily_cache import JsonDailyTrainingCacheStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.daily_sync_service import DailySyncService
from sync.models.screen_time import DailyScreenTimeData
from sync.models.status import CanonicalTrainingStatus


class _StubStatusSource:
    def target_days(self, anchor_day: datetime.date) -> tuple[datetime.date, ...]:
        return (anchor_day,)

    def load_training(self, _day: datetime.date) -> CanonicalTrainingStatus:
        return CanonicalTrainingStatus()

    def load_sleep(self, _day: datetime.date):
        return None

    def load_screen_time(self, _day: datetime.date) -> DailyScreenTimeData | None:
        return None

    def write_study_times(self, _day: datetime.date, _sessions) -> None:
        return None


class _CountingStatusSource(_StubStatusSource):
    def __init__(self) -> None:
        self.write_calls = 0

    def write_study_times(self, _day: datetime.date, _sessions) -> None:
        self.write_calls += 1


class _StubContextSource:
    def files_modified_on_date(self, _day: datetime.date):
        return []

    def links_for_window(
        self, _files, _start: datetime.datetime, _end: datetime.datetime
    ):
        return []


class _StubReminderStore:
    def load(self):
        return []

    def save(self, _rules):
        return None


class _StubGoalSyncService:
    def sync_daily_note(
        self,
        lines,
        *,
        day,
        note_path,
        yaml_end_idx,
        reminder_rules,
    ):
        _ = day, note_path, yaml_end_idx, reminder_rules
        return lines


class _ConflictNoteStore(MarkdownNoteStore):
    def __init__(self, *, mutate_on_reads: int) -> None:
        self.mutate_on_reads = mutate_on_reads
        self.read_calls = 0

    def read(self, path: str) -> list[str] | None:
        self.read_calls += 1
        if self.read_calls <= self.mutate_on_reads:
            marker = f"<!-- external-change-{self.read_calls} -->"
            current = super().read(path) or []
            if marker not in current:
                current.append(marker)
                super().write(path, current)
        return super().read(path)


def _session_for_day(day: datetime.date) -> dict:
    start = datetime.datetime.combine(day, datetime.time(9, 0))
    end = datetime.datetime.combine(day, datetime.time(10, 0))
    return {
        "start": start,
        "end": end,
        "title": "Flow",
        "actual_elapsed": 60.0,
        "interruptions_duration": 0,
        "break_expected": 5,
        "break_overrun": 0,
        "is_open": False,
        "completed_at": end,
    }


def _build_service(
    monkeypatch,
    tmp_path,
    reminder_store=None,
    status_source=None,
    note_store=None,
) -> tuple[DailySyncService, str]:
    journal_dir = tmp_path / "journal"
    journal_dir.mkdir()
    template_path = tmp_path / "daily_template.md"
    template_path.write_text("---\nmood: 6.0\n---\n", encoding="utf-8")
    _ = monkeypatch
    training_cache_store = JsonDailyTrainingCacheStore(
        cache_dir=str(tmp_path / "cache" / "daily" / "training"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )

    service = DailySyncService(
        note_store=note_store or MarkdownNoteStore(),
        status_source=status_source or _StubStatusSource(),
        context_source=_StubContextSource(),
        reminder_store=reminder_store or _StubReminderStore(),
        goal_sync_service=_StubGoalSyncService(),
        training_cache_store=training_cache_store,
        journal_dir=str(journal_dir),
        template_path=str(template_path),
    )
    return service, str(journal_dir)


def _seed_daily_note(
    *,
    journal_dir: str,
    day: datetime.date,
    reflections_lines: list[str],
) -> Path:
    note_path = Path(journal_dir) / f"{day:%Y-%m-%d}.md"
    lines = [
        "---",
        "mood: 6.0",
        "---",
        "## Goals",
        "---",
        "",
        "## Metrics",
        "---",
        "",
        "## Reflections",
        "---",
        "",
        *reflections_lines,
        "",
    ]
    note_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return note_path


def test_sync_day_creates_and_populates_daily_note(monkeypatch, tmp_path):
    day = datetime.date.today()
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    changed = service.sync_day(day, [_session_for_day(day)])
    assert changed is True

    note_path = f"{journal_dir}/{day:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    assert "study: 1h00m" in content
    assert "workout: false" in content
    assert "stretch: false" in content
    assert "meditate: false" in content
    assert "## Goals" in content
    assert "## Metrics" in content
    assert "## Reflections" in content
    assert "### **STUDY**" in content
    assert (
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |"
        in content
    )
    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` | – | – |" in content


def test_sync_day_is_idempotent(monkeypatch, tmp_path):
    day = datetime.date.today()
    service, _ = _build_service(monkeypatch, tmp_path)
    first = service.sync_day(day, [_session_for_day(day)])
    second = service.sync_day(day, [_session_for_day(day)])
    assert first is True
    assert second is False


def test_sync_day_output_uses_canonical_sections_and_schema(monkeypatch, tmp_path):
    fixed_today = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)

    changed = service.sync_day(fixed_today, [_session_for_day(fixed_today)])
    assert changed is True

    note_path = f"{journal_dir}/{fixed_today:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    lines = content.splitlines()

    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` | – | – |" in lines
    assert (
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |" in lines
    )

    level_two_headers = [line for line in lines if line.startswith("## ")]
    assert level_two_headers[:3] == ["## Goals", "## Metrics", "## Reflections"]

    level_three_headers = [line for line in lines if line.startswith("### **")]
    assert "### **STUDY**" in level_three_headers


def test_sync_day_fails_without_reminders_config(monkeypatch, tmp_path):
    class _MissingReminderStore(_StubReminderStore):
        def load(self):
            raise FileNotFoundError("Required reminder config not found")

    day = datetime.date.today()
    service, _ = _build_service(
        monkeypatch, tmp_path, reminder_store=_MissingReminderStore()
    )

    with pytest.raises(FileNotFoundError, match="Required reminder config not found"):
        service.sync_day(day, [_session_for_day(day)])


def test_sync_day_tolerates_missing_sleep_payload(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    changed = service.sync_day(day, [_session_for_day(day)])
    assert changed is True
    note_path = f"{journal_dir}/{day:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    assert "### **SLEEP**" in content


def test_sync_day_rebases_when_note_changes_before_write(monkeypatch, tmp_path, caplog):
    day = datetime.date(2025, 1, 15)
    status_source = _CountingStatusSource()
    service, journal_dir = _build_service(
        monkeypatch,
        tmp_path,
        status_source=status_source,
        note_store=_ConflictNoteStore(mutate_on_reads=1),
    )

    caplog.set_level("WARNING")
    changed = service.sync_day(day, [_session_for_day(day)])

    assert changed is True
    assert status_source.write_calls == 1
    assert "retrying with rebase" in caplog.text
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "<!-- external-change-1 -->" in content


def test_sync_day_skips_write_after_persistent_rebase_conflicts(
    monkeypatch, tmp_path, caplog
):
    day = datetime.date(2025, 1, 15)
    status_source = _CountingStatusSource()
    service, journal_dir = _build_service(
        monkeypatch,
        tmp_path,
        status_source=status_source,
        note_store=_ConflictNoteStore(mutate_on_reads=2),
    )

    caplog.set_level("WARNING")
    changed = service.sync_day(day, [_session_for_day(day)])

    assert changed is False
    assert status_source.write_calls == 1
    assert "skipped write" in caplog.text
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "<!-- external-change-2 -->" in content


def test_sync_day_repairs_reflections_h_mm_time(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=[
            "| TIME | ENTRY |",
            "| ---- | ----- |",
            "| `7:18` | test entry |",
        ],
    )

    changed = service.sync_day(day, [])
    assert changed is True
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "| `07:18` | test entry |" in content


def test_sync_day_repairs_reflections_partial_hh_m_time(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=[
            "| TIME | ENTRY |",
            "| ---- | ----- |",
            "| `08:4` | partial time entry |",
        ],
    )

    changed = service.sync_day(day, [])
    assert changed is True
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "| `08:40` | partial time entry |" in content


def test_sync_day_repairs_collapsed_reflections_row(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=[
            "| TIME | ENTRY |",
            "| ---- | ----- |",
            "| `08:3 collapsed reflection content | |",
        ],
    )

    changed = service.sync_day(day, [])
    assert changed is True
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "| `08:30` | collapsed reflection content |" in content


def test_sync_day_repairs_reflections_overflow_columns(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=[
            "| TIME | ENTRY |",
            "| ---- | ----- |",
            "| `08:43` | part one | part two |",
        ],
    )

    changed = service.sync_day(day, [])
    assert changed is True
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "| `08:43` | part one \\| part two |" in content


def test_sync_day_preserves_unrecoverable_reflections_entry(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=[
            "| TIME | ENTRY |",
            "| ---- | ----- |",
            "| broken time text | |",
        ],
    )

    changed = service.sync_day(day, [])
    assert changed is True
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "|  | broken time text |" in content


def test_sync_day_preserves_escaped_reflections_pipes(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=[
            "| TIME | ENTRY |",
            "| ---- | ----- |",
            "| `08:43` | [[x\\|y]] |",
        ],
    )

    changed = service.sync_day(day, [])
    assert changed is True
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "| `08:43` | [[x\\|y]] |" in content


def test_sync_day_repairs_reflections_header_when_first_column_is_corrupt(
    monkeypatch, tmp_path
):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=[
            "| TIME is corrupted text | ENTRY |",
            "| -------- | ----------- |",
            "| `08:43` | valid entry |",
        ],
    )

    changed = service.sync_day(day, [])
    assert changed is True
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "| TIME | ENTRY |" in content
    assert "| ---- | ----- |" in content
