"""Round 19, M1 (Home's half): on 10 Nov five exam topics fell past the exam
overnight, and Home said nothing, since the map names only a move his study
caused (``moved``). The map's exam names the topics with no room before it
that the plan still started before it as the last day he studied ended
(``fell_past``), whatever moved them, so Home can say so that morning."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from tests.learning.test_one_plan import R17, World


def _lost(found: dict[str, Any]) -> list[str]:
    return next(
        course["plan"].get("does_not_fit", [])
        for course in found["courses"]
        if Path(course["workspace"]).name == "probability"
    )


def test_the_map_names_the_exam_topics_that_fell_past_it_since_he_was_last_told(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    world = World(tmp_path, "d9-end", monkeypatch, capsys, R17)
    evening = world.run(
        "probability", "plan", "--all", "--days", "30", day="2026-11-09"
    )
    morning = world.run(
        "probability", "plan", "--all", "--days", "30", day="2026-11-10"
    )
    fell = [key for key in _lost(morning) if key not in _lost(evening)]
    assert fell, "the 9 Nov world loses exam topics overnight"
    exam = world.run("probability", "map", day="2026-11-10")["exam"]
    assert exam.get("fell_past") == fell
    assert set(fell) <= set(exam["does_not_fit"])
