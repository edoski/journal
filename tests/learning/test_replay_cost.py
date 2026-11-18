"""One read of the daily plan stays cheap: L1's replay (64a55b02) made
``resume`` and ``plan`` about four times slower, and every tutor turn waits on
them (round 12, M4). The cost is counted in plans made afresh on the same
records: the Python calls a read makes over the calls of one fresh plan, a
count no machine changes. CPU time did change with the machine: on 18 Nov 2026
CI's runner and a Mac's efficiency cores read 22 to 24 fresh plans where its
performance cores read 16 to 18, on the same code. The line is the cost this
fix reached, recorded beside the cost after 64a55b02
(``golden/replay-cost.json``)."""

from datetime import date
import json
from pathlib import Path
import sys
from typing import Any

import pytest

from learning import agenda, capacity, progress

GOLDEN = Path(__file__).parent / "golden"
COST = json.loads((GOLDEN / "replay-cost.json").read_text(encoding="utf-8"))
COURSES = ("calculus", "linear-algebra", "probability", "real-analysis")


def calls(read: Any) -> int:
    """The Python functions one read starts: its own work, the same on any
    machine and under any load."""
    started = 0

    def count(code: object, offset: int) -> None:
        nonlocal started
        started += 1

    tool = sys.monitoring.PROFILER_ID
    sys.monitoring.use_tool_id(tool, "replay-cost")
    sys.monitoring.register_callback(tool, sys.monitoring.events.PY_START, count)
    sys.monitoring.set_events(tool, sys.monitoring.events.PY_START)
    try:
        read()
    finally:
        sys.monitoring.set_events(tool, 0)
        sys.monitoring.free_tool_id(tool)
    return started


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
    ratio = calls(lambda: agenda.replay(stored, day, agenda.MAX_DAYS)) / calls(
        lambda: agenda.afresh(readable, day, agenda.MAX_DAYS)
    )
    seen = COST["worlds"][world]
    line = (seen["reached"] + seen["after"]) / 2
    assert ratio <= line, (
        f"{world}: a read costs {ratio:.1f} fresh plans, past {line:.1f}, halfway "
        f"back to 64a55b02's {seen['after']} from the {seen['reached']} its fix "
        "reached"
    )
