"""Round 19, m5 (4 minor 1): with Real Analysis's ``course.json`` unreadable,
Home's Probability row changed from "Review Binomial distribution" to "Review
Law of total probability" and Calculus's slip changed too, and both came back
once the file read again: the day's plan was made without Real Analysis, so
its room went to the other courses. Another course's plan keeps an unreadable
course as it was last read; the unreadable course still says it can't be
read."""

from datetime import date, timedelta
import io
import json
from pathlib import Path
import sys
from typing import Any

import pytest

from learning import capacity
from learning.__main__ import main
from learning.capacity import Capacity, Limit, Weekday
from learning.workspace import initialize

TODAY = date(2026, 10, 10)


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


@pytest.fixture(autouse=True)
def one_review_a_day(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())
    monkeypatch.setenv("VAULT_DIR", str(tmp_path / "vault"))
    weekday = Weekday(1.0, Limit(1.0, True), Limit(0.0, True))
    week = Capacity((weekday,) * 7, frozenset(range(7)), 30.0)
    monkeypatch.setattr(capacity, "of", lambda records, today: week)


def run(
    monkeypatch: pytest.MonkeyPatch, capsys: Any, *args: str, stdin: Any = None
) -> Any:
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(stdin or {})))
    assert main(list(args)) == 0
    return json.loads(capsys.readouterr().out)


def course(
    monkeypatch: pytest.MonkeyPatch, capsys: Any, root: Path, title: str
) -> Path:
    root.mkdir()
    initialize(root)
    late = {"introduced": day(-20), "review": {"due": day(-3)}}
    topics = {f"{title[:2].lower()}{n}": late for n in range(3)}
    run(
        monkeypatch,
        capsys,
        "--workspace",
        str(root),
        "save",
        stdin={"title": title, "topics": topics},
    )
    return root


def reviews(monkeypatch: pytest.MonkeyPatch, capsys: Any, root: Path) -> dict[str, str]:
    topics = run(monkeypatch, capsys, "--workspace", str(root), "map")["topics"]
    return {item["topic"]: item["review"] for item in topics}


def test_an_unreadable_course_keeps_its_share_of_the_days(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    chance = course(monkeypatch, capsys, tmp_path / "chance", "Probability")
    analysis = course(monkeypatch, capsys, tmp_path / "analysis", "Analysis")
    before = reviews(monkeypatch, capsys, chance)
    planned = run(monkeypatch, capsys, "plan", "--all", "--days", "7")

    (analysis / ".study" / "course.json").write_text("{", encoding="utf-8")
    assert reviews(monkeypatch, capsys, chance) == before, (
        "Probability's days stay as they were"
    )
    broken = run(monkeypatch, capsys, "plan", "--all", "--days", "7")
    entries = {entry["workspace"]: entry for entry in broken["courses"]}
    assert entries[str(analysis)]["problem"] == "damaged", (
        "Analysis still says it can't be read"
    )
    was = {entry["workspace"]: entry for entry in planned["courses"]}
    assert entries[str(chance)]["plan"] == was[str(chance)]["plan"]
