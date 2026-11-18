"""What he was told: the plan as each day he studies ends, kept so the next
day's read begins from it (``agenda.Ended``) instead of replaying every day
before it.

The replay makes today's plan from the plan the last day he studied ended,
which it made from the day before that, back to the last day that began
afresh (``agenda.replay``). A learner who finishes every day never begins
afresh, so each read remade the plan once for every save of every day he
had studied: 2.5 s a read after 56 study days and 50 s after 400 (18 Nov
2026). Every read keeps the plan as it leaves today, with the history it
was made from (``key``: every answer, start, lesson and deletion through
that day), and a later day's reads begin from it while that history is
unchanged. An earlier day changed (an answer edited, a course deleted), or
an entry missing or unreadable, replays from the records as before, and the
read keeps what it made. Nothing is timed: an entry holds while its key
does, and the records stay the one source of what he did.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
import hashlib
import json
from pathlib import Path
from typing import Any

from learning import agenda, capacity, storage, workspace


def path() -> Path:
    return workspace.support_directory() / "told.json"


_ENGINE = hashlib.sha256(
    b"".join(
        source.read_bytes() for source in sorted(Path(__file__).parent.glob("*.py"))
    )
).hexdigest()
"""The engine's own code: a plan kept by another engine is made again, so a
change to the rules reaches the days he was told."""


def key(records: Mapping[str, dict[str, Any]], day: date) -> str:
    """What the plan as ``day`` ended was made from: the engine, and every
    answer, prediction and other observation dated by then, each start and
    lesson by then, and each deleted course's deletion."""
    when = day.isoformat()
    facts: dict[str, Any] = {"engine": _ENGINE}
    facts |= {
        name: found
        for name, record in sorted(records.items())
        if any(found := _facts(record, when))
    }
    return hashlib.sha256(json.dumps(facts).encode()).hexdigest()


def _facts(record: dict[str, Any], when: str) -> list[Any]:
    """A course's dated history through ``when``: none for a course made
    since, which the plan then holds as it never held it (``agenda.Ended``)."""
    return [
        sorted(
            (k, json.dumps(item, sort_keys=True))
            for k, item in record["observations"].items()
            if item["date"] <= when
        ),
        sorted(
            (k, str(topic["introduced"]))
            for k, topic in record["topics"].items()
            if topic.get("introduced") and str(topic["introduced"]) <= when
        ),
        sorted(
            (k, str(task.get("created")), _updated(task, when))
            for k, task in record["tasks"].items()
            if str(task.get("created", "")) <= when
        ),
        record.get(capacity.FORGOTTEN),
    ]


def _updated(task: dict[str, Any], when: str) -> str:
    """A task's last move by ``when``: one moved later reads as made then,
    as the record as of that day has it (``agenda.as_of``)."""
    updated = str(task.get("updated", ""))
    return updated if updated and updated <= when else str(task.get("created"))


def load(
    records: Mapping[str, dict[str, Any]], today: date, days: int
) -> agenda.Ended | None:
    """The kept plan of the last day he studied before today, while the
    history and the engine it was made with stand; none from a file that
    is missing or cannot be read as one, which the read then makes again."""
    studied = agenda.last_studied(records, today)
    if studied is None:
        return None
    try:
        stored = storage.load(path())
        for entry in (stored or {})["ended"]:
            if (
                entry["day"] == studied.isoformat()
                and entry["days"] == days
                and entry["key"] == key(records, studied)
            ):
                return _ended(entry)
    except (storage.Unreadable, KeyError, TypeError, ValueError, AttributeError):
        return None
    return None


def keep(
    records: Mapping[str, dict[str, Any]],
    today: date,
    days: int,
    replay: agenda.Replay,
) -> None:
    """Keep the plan as today leaves it, and the plan as the last day he
    studied ended (``agenda.Replay.ended``), which today's reads begin from."""
    now = {name: agenda.structure(record) for name, record in records.items()}
    entries = [
        _entry(records, today, days, replay.now, replay.since, replay.finals, now)
    ]
    if replay.ended is not None:
        ended = replay.ended
        entries.append(
            _entry(
                records,
                ended.day,
                days,
                ended.plan,
                ended.since,
                ended.finals,
                ended.known,
            )
        )
    content = storage.encode({"ended": entries})
    target = path()
    try:
        if target.is_file() and target.read_text(encoding="utf-8") == content:
            return
        with storage.lock(storage.lock_path(target)):
            storage.publish_text(target, content)
    except OSError:
        return


def _entry(
    records: Mapping[str, dict[str, Any]],
    day: date,
    days: int,
    plan: agenda.Plan,
    since: date | None,
    finals: Mapping[str, tuple[str, str]],
    known: Mapping[str, Mapping[str, str]],
) -> dict[str, Any]:
    """A kept plan, with ``known``, the structure it was made with."""
    return {
        "day": day.isoformat(),
        "days": days,
        "key": key(records, day),
        "plan": _plan(plan),
        "since": since.isoformat() if since else None,
        "finals": {name: list(pair) for name, pair in finals.items()},
        "known": known,
    }


def _plan(plan: agenda.Plan) -> dict[str, Any]:
    return {
        "days": plan.days,
        "does_not_fit": plan.does_not_fit,
        "held": plan.held,
        "unreviewed": plan.unreviewed,
        "starts_after": plan.starts_after,
        "why": plan.why,
        "reasons": plan.reasons,
        "finals": {name: day.isoformat() for name, day in plan.finals.items()},
    }


def _ended(entry: dict[str, Any]) -> agenda.Ended:
    found = entry["plan"]
    plan = agenda.Plan(
        found["days"],
        found["does_not_fit"],
        found["held"],
        found["unreviewed"],
        found["starts_after"],
        found["why"],
        found["reasons"],
        {name: date.fromisoformat(day) for name, day in found["finals"].items()},
    )
    return agenda.Ended(
        date.fromisoformat(entry["day"]),
        plan,
        date.fromisoformat(entry["since"]) if entry["since"] else None,
        {name: (pair[0], pair[1]) for name, pair in entry["finals"].items()},
        entry["known"],
    )
