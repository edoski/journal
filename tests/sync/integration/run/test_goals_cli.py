from __future__ import annotations

import argparse
import datetime
import re
from pathlib import Path

import pytest

import sync.run.commands.goals as goals_cmd


def _goals_add_args(
    *,
    period: str,
    text: str,
    current: bool = False,
    next: bool = False,
) -> argparse.Namespace:
    return argparse.Namespace(period=period, text=text, current=current, next=next)


def _template_lines(target_section: str, mirror_section: str | None) -> list[str]:
    lines = ["## Goals", "---"]
    if mirror_section is not None:
        lines.extend(
            [
                f"### **{mirror_section}**",
                "- [ ] Existing mirror line — `12d` ^gid-m111111111",
                "",
            ]
        )
    lines.extend(
        [
            f"### **{target_section}**",
            "",
            f"_No {target_section.lower()} goals have been defined yet._",
            "",
            "## Metrics",
            "---",
        ]
    )
    return lines


def _configure_goal_paths(tmp_path: Path) -> goals_cmd.GoalCommandConfig:
    journal_dir = tmp_path / "journal"
    templates_dir = tmp_path / "templates"
    journal_dir.mkdir(parents=True, exist_ok=True)
    templates_dir.mkdir(parents=True, exist_ok=True)

    daily_template = templates_dir / "daily.md"
    weekly_template = templates_dir / "weekly.md"
    monthly_template = templates_dir / "monthly.md"
    yearly_template = templates_dir / "yearly.md"

    daily_template.write_text(
        "\n".join(_template_lines("DAILY", "WEEKLY")) + "\n",
        encoding="utf-8",
    )
    weekly_template.write_text(
        "\n".join(_template_lines("WEEKLY", "MONTHLY")) + "\n",
        encoding="utf-8",
    )
    monthly_template.write_text(
        "\n".join(_template_lines("MONTHLY", "YEARLY")) + "\n",
        encoding="utf-8",
    )
    yearly_template.write_text(
        "\n".join(_template_lines("YEARLY", None)) + "\n",
        encoding="utf-8",
    )

    return goals_cmd.GoalCommandConfig(
        journal_dir=str(journal_dir),
        daily_template_path=str(daily_template),
        weekly_template_path=str(weekly_template),
        monthly_template_path=str(monthly_template),
        yearly_template_path=str(yearly_template),
    )


@pytest.mark.parametrize(
    ("period", "section"),
    [
        ("daily", "DAILY"),
        ("weekly", "WEEKLY"),
        ("monthly", "MONTHLY"),
        ("yearly", "YEARLY"),
    ],
)
def test_goals_add_appends_to_source_period_note(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    period: str,
    section: str,
) -> None:
    config = _configure_goal_paths(tmp_path)
    fixed_today = datetime.date(2026, 2, 28)
    monkeypatch.setattr(goals_cmd, "_today", lambda: fixed_today)

    rc = goals_cmd.cmd_goals_add(
        _goals_add_args(period=period, text="Plan focused work"),
        config=config,
    )

    assert rc == 0
    target = goals_cmd._resolve_target(
        period,
        use_next=False,
        today=fixed_today,
        config=config,
    )
    target_path = Path(target.note_path)
    assert target_path.exists()
    lines = target_path.read_text(encoding="utf-8").splitlines()
    assert f"### **{section}**" in lines
    assert any(
        re.fullmatch(r"- \[ \] Plan focused work \^gid-m[0-9a-f]{9}", line)
        for line in lines
    )
    assert f"_No {section.lower()} goals have been defined yet._" not in lines


def test_goals_add_preserves_untouched_mirror_subsection(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    config = _configure_goal_paths(tmp_path)
    fixed_today = datetime.date(2026, 2, 28)
    monkeypatch.setattr(goals_cmd, "_today", lambda: fixed_today)

    weekly_target = goals_cmd._resolve_target(
        "weekly",
        use_next=False,
        today=fixed_today,
        config=config,
    )
    weekly_path = Path(weekly_target.note_path)
    weekly_path.parent.mkdir(parents=True, exist_ok=True)
    weekly_path.write_text(
        "\n".join(
            [
                "## Goals",
                "---",
                "### **MONTHLY**",
                "- [ ] Monthly prep — `12d` ^gid-m111111111",
                "",
                "### **WEEKLY**",
                "",
                "_No weekly goals have been defined yet._",
                "",
                "## Metrics",
                "---",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    rc = goals_cmd.cmd_goals_add(
        _goals_add_args(period="weekly", text="Weekly review"),
        config=config,
    )

    assert rc == 0
    lines = weekly_path.read_text(encoding="utf-8").splitlines()
    mirror_line = "- [ ] Monthly prep — `12d` ^gid-m111111111"
    assert lines.count(mirror_line) == 1
    assert any(
        re.fullmatch(r"- \[ \] Weekly review \^gid-m[0-9a-f]{9}", line)
        for line in lines
    )


def test_goals_add_duplicate_canonical_is_no_op(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    config = _configure_goal_paths(tmp_path)
    fixed_today = datetime.date(2026, 2, 28)
    monkeypatch.setattr(goals_cmd, "_today", lambda: fixed_today)

    monthly_target = goals_cmd._resolve_target(
        "monthly",
        use_next=False,
        today=fixed_today,
        config=config,
    )
    monthly_path = Path(monthly_target.note_path)
    monthly_path.parent.mkdir(parents=True, exist_ok=True)
    original_lines = [
        "## Goals",
        "---",
        "### **MONTHLY**",
        "- [ ] Ship Feature ^gid-mabc123456",
        "",
        "## Metrics",
        "---",
    ]
    monthly_path.write_text("\n".join(original_lines) + "\n", encoding="utf-8")
    before = monthly_path.read_text(encoding="utf-8")

    rc = goals_cmd.cmd_goals_add(
        _goals_add_args(period="monthly", text="ship feature!"),
        config=config,
    )
    captured = capsys.readouterr()

    assert rc == 0
    assert "No-op: goal already exists in MONTHLY." in captured.out
    assert monthly_path.read_text(encoding="utf-8") == before


def test_goals_add_month_end_next_month_creates_target_note(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    config = _configure_goal_paths(tmp_path)
    fixed_today = datetime.date(2026, 1, 31)
    monkeypatch.setattr(goals_cmd, "_today", lambda: fixed_today)

    monthly_template = Path(config.monthly_template_path)
    monthly_template.write_text(
        "\n".join(
            [
                "MONTHLY TEMPLATE MARKER",
                "## Goals",
                "---",
                "### **MONTHLY**",
                "",
                "_No monthly goals have been defined yet._",
                "",
                "## Metrics",
                "---",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    target = goals_cmd._resolve_target(
        "monthly",
        use_next=True,
        today=fixed_today,
        config=config,
    )
    target_path = Path(target.note_path)
    assert not target_path.exists()
    assert target.period_key == "2026-02"

    rc = goals_cmd.cmd_goals_add(
        _goals_add_args(period="monthly", next=True, text="Kick off February plan"),
        config=config,
    )

    assert rc == 0
    assert target_path.exists()
    lines = target_path.read_text(encoding="utf-8").splitlines()
    assert "MONTHLY TEMPLATE MARKER" in lines
    assert any(
        re.fullmatch(r"- \[ \] Kick off February plan \^gid-m[0-9a-f]{9}", line)
        for line in lines
    )
