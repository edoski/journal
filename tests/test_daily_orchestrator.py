"""
Integration-style tests for daily orchestrator end-to-end behavior.
"""

from __future__ import annotations

import datetime
import hashlib

import sync.daily.orchestrator as orchestrator
import sync.daily.goals as daily_goals


def _session_for_today(today: datetime.date | None = None) -> dict:
    """Build a minimal session payload consumed by update_markdown()."""
    today = today or datetime.date.today()
    start = datetime.datetime.combine(today, datetime.time(9, 0))
    end = datetime.datetime.combine(today, datetime.time(10, 0))
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


def _prepare_isolated_orchestrator(monkeypatch, tmp_path):
    """Patch orchestrator dependencies to isolate tests from external systems."""
    journal_dir = tmp_path / "journal"
    journal_dir.mkdir()

    template_path = tmp_path / "daily_template.md"
    template_path.write_text("---\nmood: 6.0\n---\n")

    monkeypatch.setattr(orchestrator, "JOURNAL_DIR", str(journal_dir))
    monkeypatch.setattr(orchestrator, "TEMPLATE_PATH", str(template_path))

    monkeypatch.setattr(
        orchestrator,
        "get_vault_files_modified_on_date",
        lambda _target_date: [],
    )
    monkeypatch.setattr(
        orchestrator,
        "load_weekly_goals",
        lambda _date_obj: (
            [],
            [],
            [],
            [],
            str(journal_dir / "dummy-weekly.md"),
            str(journal_dir / "dummy-monthly.md"),
            str(journal_dir / "dummy-quarterly.md"),
        ),
    )
    monkeypatch.setattr(orchestrator, "write_weekly_goals", lambda *_a, **_kw: None)
    monkeypatch.setattr(orchestrator, "get_review_reminders_for_date", lambda _d: [])
    monkeypatch.setattr(orchestrator, "get_periodic_reminders_for_date", lambda _d: [])
    monkeypatch.setattr(orchestrator, "_load_status_file", lambda _name: (False, None))
    monkeypatch.setattr(orchestrator, "_load_screen_time_data", lambda _today: None)
    monkeypatch.setattr(
        orchestrator, "write_study_times_to_icloud", lambda *_a, **_kw: None
    )

    return journal_dir


def test_update_markdown_creates_and_populates_daily_note(monkeypatch, tmp_path):
    """First run should create today's note and populate frontmatter + sections."""
    journal_dir = _prepare_isolated_orchestrator(monkeypatch, tmp_path)
    session = _session_for_today()

    changed = orchestrator.update_markdown([session])
    assert changed is True

    note_path = journal_dir / f"{datetime.date.today():%Y-%m-%d}.md"
    assert note_path.exists()

    content = note_path.read_text()
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
    assert "### **TRAINING**" in content
    assert "### **PROCRASTINATION**" in content
    assert "### **SLEEP**" in content


def test_update_markdown_is_idempotent_on_second_run(monkeypatch, tmp_path):
    """Second run with same inputs should report no changes."""
    _prepare_isolated_orchestrator(monkeypatch, tmp_path)
    session = _session_for_today()

    first = orchestrator.update_markdown([session])
    second = orchestrator.update_markdown([session])

    assert first is True
    assert second is False


def test_update_markdown_output_characterization(monkeypatch, tmp_path):
    """
    Lock down full daily note markdown output for deterministic inputs.

    Uses a fixed date to avoid drift from runtime date.
    """
    fixed_today = datetime.date(2025, 1, 15)

    class _FixedDate(datetime.date):
        @classmethod
        def today(cls):
            return cls(2025, 1, 15)

    class _FixedDateTime(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            base = cls(2025, 1, 15, 12, 0, 0)
            if tz is not None:
                return base.replace(tzinfo=tz)
            return base

    monkeypatch.setattr(orchestrator.datetime, "date", _FixedDate)
    monkeypatch.setattr(orchestrator.datetime, "datetime", _FixedDateTime)
    monkeypatch.setattr(daily_goals.datetime, "date", _FixedDate)

    journal_dir = _prepare_isolated_orchestrator(monkeypatch, tmp_path)
    session = _session_for_today(fixed_today)
    changed = orchestrator.update_markdown([session])
    assert changed is True

    note_path = journal_dir / f"{fixed_today:%Y-%m-%d}.md"
    content = note_path.read_text()
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

    assert (
        content_hash
        == "654d4b7785d4593f44ff11644e7bbf38e0e3e351764792d2d167e31c088cfdf7"
    )
