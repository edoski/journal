"""One read of the daily plan stays cheap: L1's replay (64a55b02) made
``resume`` and ``plan`` about four times slower, and every tutor turn waits on
them (round 12, M4). The cost is counted in plans made afresh on the same
records, in the same process, so a busy machine slows both sides alike; the
line is the ratio this fix reached, recorded beside the ratios before and
after 64a55b02 (``golden/replay-cost.json``), never a number of seconds."""

from datetime import date
import json
from pathlib import Path
import time
from typing import Any

import pytest

from learning import agenda, capacity, progress

GOLDEN = Path(__file__).parent / "golden"
COST = json.loads((GOLDEN / "replay-cost.json").read_text(encoding="utf-8"))
COURSES = ("calculus", "linear-algebra", "probability", "real-analysis")


def best(read: Any) -> float:
    """The least CPU time of a few reads: the read's own cost, with the
    machine's other work left out as far as one process can."""
    spent = []
    for _ in range(3):
        start = time.process_time()
        read()
        spent.append(time.process_time() - start)
    return min(spent)


@pytest.mark.parametrize("world", sorted(COST["worlds"]))
def test_a_read_of_the_plan_costs_no_more_than_the_fix_reached(world: str) -> None:
    name, checkpoint, day_ = world.split()
    golden = json.loads((GOLDEN / f"{name}.json").read_text(encoding="utf-8"))
    day = date.fromisoformat(day_)
    records = {
        course: golden["checkpoints"][checkpoint].get(course)
        or golden["steady"][course]
        for course in COURSES
    }
    readable = capacity.final_reviews(records, day)
    stored = {
        course: progress.begun(record, day) for course, record in readable.items()
    }
    ratio = best(lambda: agenda.replay(stored, day, agenda.MAX_DAYS)) / best(
        lambda: agenda.afresh(readable, day, agenda.MAX_DAYS)
    )
    seen = COST["worlds"][world]
    line = (seen["reached"] + seen["after"]) / 2
    assert ratio <= line, (
        f"{world}: a read costs {ratio:.1f} fresh plans, past {line:.1f}, halfway "
        f"back to 64a55b02's {seen['after']} from the {seen['reached']} its fix "
        f"reached (before it: {seen['pre']})"
    )
