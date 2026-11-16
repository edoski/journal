"""A review asks one question, on a part of the topic its earlier reviews did
not (round 14, m5, Edo's rule): ``resume`` gives each due review what each
earlier day's review of its topic asked, and the review doctrine asks one
question, a second only when the first right answer was shaky."""

import json
from pathlib import Path
from typing import Any

import pytest

from learning import retrieval
from learning.workspace import initialize, resolve

GOLDEN = Path(__file__).parent / "golden"
REVIEWS = Path(__file__).parents[2] / "learning/skills/tutor/references/reviews.md"


def _first_of_each_day(record: dict[str, Any], topic: str) -> list[str]:
    days: dict[str, tuple[str, str]] = {}
    for item in record["observations"].values():
        if topic not in item["topics"] or item["kind"] not in ("attempt", "exam"):
            continue
        if item.get("predicted"):
            continue
        if item["date"] not in days or item["recorded"] < days[item["date"]][0]:
            days[item["date"]] = (item["recorded"], item["text"])
    return [days[day][1] for day in sorted(days, reverse=True)]


def test_a_due_review_lists_what_each_earlier_review_asked(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    seed = json.loads((GOLDEN / "demo-world-r14.json").read_text("utf-8"))[
        "checkpoints"
    ]["seed"]
    initialize(tmp_path)
    (tmp_path / ".study" / "course.json").write_text(json.dumps(seed["probability"]))
    monkeypatch.setenv("LEARNING_TODAY", "2026-11-08")
    monkeypatch.setenv("VAULT_DIR", str(tmp_path / "vault"))
    due = retrieval.resume(resolve(tmp_path))["due"]
    assert due, "a review is due today"
    for item in due:
        assert item["asked"] == _first_of_each_day(seed["probability"], item["topic"])
    rank = retrieval._asked(seed["linear-algebra"], {"topic": "rank"})["asked"]
    assert rank == _first_of_each_day(seed["linear-algebra"], "rank")
    assert len(rank) > 1, "every earlier review day, so the next can ask another part"


def test_the_review_doctrine_asks_one_question_and_a_second_only_when_shaky() -> None:
    doctrine = REVIEWS.read_text("utf-8")
    review = doctrine.split("## Today's review", 1)[1].split("\n## ", 1)[0]
    assert "a review asks one question" in review
    assert "A second question, on another part of the topic, comes only when" in review
    for shaky in (
        "hinted",
        '`sure: "guess"`',
        "`partial`",
        "first right answer after a miss",
    ):
        assert shaky in review, shaky
    assert "`asked` lists what each earlier day's review asked" in review
    assert "until one unaided success" not in review
