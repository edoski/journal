"""Integration-style tests for the port-driven daily sync service."""

from __future__ import annotations

import datetime
import logging
from pathlib import Path

from sync.adapters.json_daily_cache import JsonDailyTrainingCacheStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.daily_sync_service import DailySyncService
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.status import TrainingStatus


class _StubStatusSource:
    def target_days(self, anchor_day: datetime.date) -> tuple[datetime.date, ...]:
        return (anchor_day,)

    def load_training(self, _day: datetime.date) -> TrainingStatus:
        return TrainingStatus()

    def load_sleep(self, _day: datetime.date):
        return None


class _ConflictNoteStore(MarkdownNoteStore):
    def __init__(self) -> None:
        super().__init__()
        self.mutated = False

    def publish(self, path: str, lines: list[str], *, expected: list[str] | None):
        if not self.mutated:
            self.mutated = True
            self.update(
                path,
                lambda current: [*(current or []), "<!-- external-change -->"],
            )
        return super().publish(path, lines, expected=expected)


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


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
        is_off_day=False,
    )


def _build_service(
    monkeypatch,
    tmp_path,
    status_source=None,
    note_store=None,
) -> tuple[DailySyncService, str]:
    journal_dir = tmp_path / "journal"
    journal_dir.mkdir()
    template_path = tmp_path / "daily_template.md"
    template_path.write_text("---\nsleep: 7h30m\n---\n", encoding="utf-8")
    _ = monkeypatch
    training_cache_store = JsonDailyTrainingCacheStore(
        cache_dir=str(tmp_path / "cache" / "daily" / "training"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )

    service = DailySyncService(
        note_store=note_store or MarkdownNoteStore(),
        status_source=status_source or _StubStatusSource(),
        training_cache_store=training_cache_store,
        journal_dir=str(journal_dir),
        template_path=str(template_path),
    )
    return service, str(journal_dir)


def test_sync_day_creates_and_populates_daily_note(monkeypatch, tmp_path):
    day = datetime.date.today()
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    changed = service.sync_day(day, [_session_for_day(day)], _default_schedule())
    assert changed is True

    note_path = f"{journal_dir}/{day:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    assert "study: 1h00m" in content
    assert "workout: false" in content
    assert "stretch: false" in content
    assert "## Metrics" in content
    assert "### **STUDY**" in content
    assert "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |" in content
    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` |" in content


def test_sync_day_is_idempotent(monkeypatch, tmp_path):
    day = datetime.date.today()
    service, _ = _build_service(monkeypatch, tmp_path)
    first = service.sync_day(day, [_session_for_day(day)], _default_schedule())
    second = service.sync_day(day, [_session_for_day(day)], _default_schedule())
    assert first is True
    assert second is False


def test_sync_day_output_uses_canonical_sections_and_schema(monkeypatch, tmp_path):
    fixed_today = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)

    changed = service.sync_day(
        fixed_today,
        [_session_for_day(fixed_today)],
        _default_schedule(),
    )
    assert changed is True

    note_path = f"{journal_dir}/{fixed_today:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    lines = content.splitlines()

    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` |" in lines
    assert "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |" in lines

    level_two_headers = [line for line in lines if line.startswith("## ")]
    assert level_two_headers == ["## Metrics"]

    level_three_headers = [line for line in lines if line.startswith("### **")]
    assert "### **STUDY**" in level_three_headers


def test_sync_day_tolerates_missing_sleep_payload(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    changed = service.sync_day(day, [_session_for_day(day)], _default_schedule())
    assert changed is True
    note_path = f"{journal_dir}/{day:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    assert "### **SLEEP**" in content


def test_sync_day_skips_write_when_note_changes_before_write(
    monkeypatch, tmp_path, caplog
):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(
        monkeypatch,
        tmp_path,
        note_store=_ConflictNoteStore(),
    )

    caplog.set_level(logging.WARNING)
    journal_logger = logging.getLogger("journal")
    prior_level = journal_logger.level
    journal_logger.setLevel(logging.WARNING)
    journal_logger.addHandler(caplog.handler)
    try:
        changed = service.sync_day(day, [_session_for_day(day)], _default_schedule())
    finally:
        journal_logger.removeHandler(caplog.handler)
        journal_logger.setLevel(prior_level)

    assert changed is False
    assert any("skipped write" in rec.getMessage() for rec in caplog.records)
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "<!-- external-change -->" in content
