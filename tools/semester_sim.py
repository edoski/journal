"""Simulate a semester on the learning engine's own functions, in memory.

Runs ``schema.apply_patch`` and ``progress.schedule`` (the save path without
I/O) on synthetic records: 30 topics, an exam 8 weeks out, learners who skip
days and forget. Forgetting is FSRS-6 with its published default parameters,
an outside model of memory, never the engine's scheduler. Each policy reports
total reviews, the busiest day, reviews on the exam day, topics never
introduced by the exam and the recall FSRS predicts on the exam day.

``--engine ROOT`` imports ``learning`` from another checkout, so the same
learners run on the base commit's engine and on this one:

    git archive <base> learning sync | tar -x -C /tmp/base
    python tools/semester_sim.py --engine /tmp/base --name before --out before.json
    python tools/semester_sim.py --name after --out after.json
    python tools/semester_sim.py --report before.json after.json

An engine with ``agenda.plan_days`` is followed as its daily plan says. An
engine without one is run as the tutor's doctrine says: every due review, the
learner's own pace for new topics, and the run-up's pace in the last 21 days.
"""

from __future__ import annotations

import argparse
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, timedelta
import importlib
import json
import math
from multiprocessing import Pool
from pathlib import Path
import random
import sys
from types import ModuleType
from typing import Any

# FSRS-6 default parameters (open-spaced-repetition/py-fsrs, DEFAULT_PARAMETERS).
W = (
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
    0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
    0.1542,
)  # fmt: skip
DECAY = -W[20]
FACTOR = 0.9 ** (1 / DECAY) - 1
AGAIN, HARD, GOOD, EASY = 1, 2, 3, 4

START = date(2026, 1, 5)  # a Monday
EXAM_DAY = 56
LATE_SET_DAY = 35
TOPICS = 30
NOW = "2026-01-05T09:00:00+00:00"
# Share of days each learner skips, and the new topics a week they take on
# their own when no engine plan says how many.
SKIPS = {"steady": 0.05, "typical": 0.15, "patchy": 0.30}
OWN_PACE = {"steady": 5, "typical": 3, "patchy": 2}
RUNUP_DAYS = 21
EXAM_GAP_DAYS = 8
WEAK = 0.8


def retrievability(elapsed: float, stability: float) -> float:
    return float((1 + FACTOR * elapsed / stability) ** DECAY)


def _initial_difficulty(rating: int) -> float:
    return float(W[4] - math.exp(W[5] * (rating - 1)) + 1)


def _clamp(value: float) -> float:
    return min(10.0, max(1.0, value))


@dataclass
class Memory:
    """One topic's FSRS state: stability in days, difficulty from 1 to 10."""

    stability: float
    difficulty: float
    last: int

    @classmethod
    def learned(cls, day: int, ease: float) -> Memory:
        return cls(W[GOOD - 1] * ease, _clamp(_initial_difficulty(GOOD)), day)

    def recall(self, day: int) -> float:
        return retrievability(day - self.last, self.stability)

    def review(self, day: int, rating: int) -> None:
        s, d = self.stability, self.difficulty
        r = self.recall(day)
        if day == self.last:
            factor = math.exp(W[17] * (rating - 3 + W[18])) * s ** -W[19]
            self.stability = s * (max(factor, 1.0) if rating >= HARD else factor)
        elif rating == AGAIN:
            long_term = (
                W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * math.exp((1 - r) * W[14])
            )
            self.stability = min(long_term, s / math.exp(W[17] * W[18]))
        else:
            hard = W[15] if rating == HARD else 1.0
            growth = (
                math.exp(W[8])
                * (11 - d)
                * s ** -W[9]
                * (math.exp((1 - r) * W[10]) - 1)
                * hard
            )
            self.stability = s * (1 + growth)
        damped = d - W[6] * (rating - 3) * (10 - d) / 9
        self.difficulty = _clamp(W[7] * _initial_difficulty(EASY) + (1 - W[7]) * damped)
        self.stability = max(self.stability, 0.001)
        self.last = day


@dataclass(frozen=True)
class Scenario:
    learner: str
    late: bool
    seed: int


@dataclass
class Outcome:
    reviews: Counter[int] = field(default_factory=Counter)
    new: Counter[int] = field(default_factory=Counter)
    never: int = 0
    recall: float = 0.0
    weak: int = 0
    stranded: int = 0
    overdue: int = 0


def day(n: int) -> date:
    return START + timedelta(days=n)


def handle(index: int) -> str:
    return f"t{index:02d}"


def attempt(topic: str, correct: bool) -> dict[str, Any]:
    return {
        "topics": [topic],
        "text": f"question on {topic}",
        "help": "none",
        "result": "correct" if correct else "incorrect",
    }


class Run:
    """One learner's semester on one engine."""

    def __init__(
        self,
        engine: dict[str, ModuleType],
        scenario: Scenario,
        preferences: dict[str, str],
        ease: float = 1.0,
    ) -> None:
        self.engine = engine
        self.schema, self.progress = engine["schema"], engine["progress"]
        self.agenda = engine.get("agenda")
        self.scenario = scenario
        self.rng = random.Random(f"{scenario.learner}/{scenario.late}/{scenario.seed}")
        # Days off from their own stream, so every engine meets the same days.
        self.days_off = random.Random(
            f"{scenario.learner}/{scenario.late}/{scenario.seed}/days off"
        )
        self.ease = {
            handle(i): ease * self.rng.lognormvariate(0, 0.5) for i in range(TOPICS)
        }
        self.memory: dict[str, Memory] = {}
        self.outcome = Outcome()
        topics = {handle(i): {"title": f"Topic {i}"} for i in range(TOPICS)}
        patch: dict[str, Any] = {"topics": topics, "path": {"order": list(topics)}}
        if preferences:
            patch["preferences"] = preferences
        if not scenario.late:
            patch["exam"] = {"date": day(EXAM_DAY).isoformat()}
        self.record = self.schema.empty()
        self.save(patch, 0)

    def save(self, patch: dict[str, Any], n: int) -> None:
        self.record = saved(self.engine, {"c": self.record}, "c", patch, day(n), NOW)

    def read(self, n: int) -> dict[str, Any]:
        return read(self.engine, {"c": self.record}, day(n))["c"]

    def untaught(self) -> list[str]:
        return [
            key
            for key in self.progress.path_order(self.record)
            if key not in self.memory
        ]

    def doctrine(self, n: int) -> tuple[list[str], list[str]]:
        """An engine with no plan, run as the tutor's doctrine says."""
        due = [item["topic"] for item in self.progress.due(self.read(n), day(n))]
        untaught = self.untaught()
        exam = self.record.get("exam", {}).get("date")
        left = (date.fromisoformat(exam) - day(n)).days if exam else None
        if day(n).weekday() >= 5 or not untaught:
            return due, []
        if left is not None and 0 <= left <= RUNUP_DAYS:
            study_days = sum(
                (day(n) + timedelta(days=k)).weekday() < 5
                for k in range(left - EXAM_GAP_DAYS + 1)
            )
            pace = math.ceil(len(untaught) / study_days) if study_days > 0 else 0
            return due, untaught[:pace]
        own = OWN_PACE[self.scenario.learner]
        return due, untaught[:1] if day(n).weekday() < own else []

    def planned(self, n: int) -> tuple[list[str], list[str]]:
        assert self.agenda is not None
        if hasattr(self.agenda, "plan_days"):
            settings = self.agenda.settings(self.record["preferences"])
            today = self.agenda.plan_days(self.record, day(n), settings, 1)[0]
        else:
            today = self.agenda.plan({"c": self.read(n)}, day(n), 1).days["c"][0]
        return list(today["reviews"]), list(today["new"])

    def study(self, n: int, reviews: list[str], new: list[str]) -> None:
        observations = []
        for topic in reviews:
            memory = self.memory[topic]
            recalled = self.rng.random() < memory.recall(n)
            memory.review(n, GOOD if recalled else AGAIN)
            if not recalled:
                memory.review(n, GOOD)
            observations.append(attempt(topic, recalled))
        for topic in new:
            self.memory[topic] = Memory.learned(n, self.ease[topic])
            observations.append(attempt(topic, True))
        self.outcome.reviews[n] += len(reviews)
        self.outcome.new[n] += len(new)
        patch: dict[str, Any] = {}
        if new:
            patch["topics"] = {topic: {"introduced": True} for topic in new}
        if observations:
            patch["observations"] = observations
        if patch:
            self.save(patch, n)

    def run(self) -> Outcome:
        skip = SKIPS[self.scenario.learner]
        for n in range(EXAM_DAY + 1):
            if n == EXAM_DAY:
                self.sit_exam()
            if self.scenario.late and n == LATE_SET_DAY:
                self.save({"exam": {"date": day(EXAM_DAY).isoformat()}}, n)
            if n < EXAM_DAY and self.days_off.random() < skip:
                continue
            reviews, new = self.planned(n) if self.agenda else self.doctrine(n)
            self.study(n, reviews, new)
        return self.outcome

    def sit_exam(self) -> None:
        """Recall on the exam day's morning, before any review that day."""
        recall = [
            self.memory[handle(i)].recall(EXAM_DAY) if handle(i) in self.memory else 0.0
            for i in range(TOPICS)
        ]
        self.outcome.never = TOPICS - len(self.memory)
        self.outcome.recall = sum(recall) / TOPICS
        self.outcome.weak = sum(value < WEAK for value in recall)
        exam = day(EXAM_DAY).isoformat()
        dates = [
            topic["review"]["due"]
            for topic in self.read(EXAM_DAY)["topics"].values()
            if "due" in topic.get("review", {})
        ]
        self.outcome.stranded = sum(due > exam for due in dates)
        self.outcome.overdue = sum(due < exam for due in dates)


def read(
    engine: dict[str, ModuleType], records: dict[str, dict[str, Any]], today: date
) -> dict[str, dict[str, Any]]:
    """Every course as the app reads it: with the plan, which reads each
    exam's final review from his pace (``capacity.final_reviews``), on an
    engine that does; as stored on one that does not."""
    capacity = engine.get("capacity")
    if capacity is None or not hasattr(capacity, "final_reviews"):
        return dict(records)
    result: dict[str, dict[str, Any]] = capacity.final_reviews(records, today)
    return result


def saved(
    engine: dict[str, ModuleType],
    records: dict[str, dict[str, Any]],
    name: str,
    patch: dict[str, Any],
    today: date,
    now: str,
) -> dict[str, Any]:
    """Course ``name`` after one save, as the app's saves store it: the patch
    applied to the course read with the plan, its final review read again when
    the exam moves (``capacity.replanned``), and a final review's start kept
    only once it has begun (``progress.begun``)."""
    schema, progress = engine["schema"], engine["progress"]
    if not hasattr(progress, "begun"):
        patched, outcome = schema.apply_patch(
            records[name], patch, today=today, now=now
        )
        planned, _ = progress.schedule(patched, outcome, today)
        return dict(schema.validate_record(planned))
    seen = read(engine, records, today)[name]
    patched, outcome = schema.apply_patch(seen, patch, today=today, now=now)
    if outcome.exam_moved:
        patched = engine["capacity"].replanned({**records, name: patched}, name, today)
    planned, _ = progress.schedule(patched, outcome, today)
    return dict(schema.validate_record(progress.begun(planned, today)))


def load_engine(root: str | None) -> dict[str, ModuleType]:
    if root is not None:
        sys.path.insert(0, str(Path(root).resolve()))
    names = ("schema", "progress")
    modules = {name: importlib.import_module(f"learning.{name}") for name in names}
    for name in ("agenda", "capacity"):
        try:
            modules[name] = importlib.import_module(f"learning.{name}")
        except ModuleNotFoundError:
            pass
    return modules


_ENGINE: dict[str, ModuleType] = {}
_PREFERENCES: dict[str, str] = {}
_EASE: list[float] = []


def _init(root: str | None, preferences: dict[str, str], ease: float) -> None:
    _ENGINE.update(load_engine(root))
    _PREFERENCES.update(preferences)
    _EASE.append(ease)


def _one(scenario: Scenario) -> dict[str, Any]:
    outcome = Run(_ENGINE, scenario, _PREFERENCES, _EASE[0]).run()
    return {
        "learner": scenario.learner,
        "late": scenario.late,
        "seed": scenario.seed,
        "reviews": {str(k): v for k, v in sorted(outcome.reviews.items())},
        "new": {str(k): v for k, v in sorted(outcome.new.items())},
        "never": outcome.never,
        "recall": outcome.recall,
        "weak": outcome.weak,
        "stranded": outcome.stranded,
        "overdue": outcome.overdue,
    }


def scenarios(seeds: int) -> Iterator[Scenario]:
    for late in (False, True):
        for learner in SKIPS:
            for seed in range(seeds):
                yield Scenario(learner, late, seed)


def simulate(
    root: str | None, preferences: dict[str, str], seeds: int, ease: float = 1.0
) -> list[dict[str, Any]]:
    with Pool(initializer=_init, initargs=(root, preferences, ease)) as pool:
        return pool.map(_one, list(scenarios(seeds)))


# --- the report ---------------------------------------------------------------


def summary(runs: list[dict[str, Any]]) -> dict[str, float]:
    """Means over runs of each figure the report shows."""
    rows = []
    for run in runs:
        reviews = {int(k): v for k, v in run["reviews"].items()}
        rows.append(
            {
                "total": sum(reviews.values()),
                "busiest": max(reviews.values(), default=0),
                "exam_day": reviews.get(EXAM_DAY, 0),
                "never": run["never"],
                "recall": run["recall"],
                "weak": run["weak"],
                "stranded": run["stranded"],
                "overdue": run["overdue"],
            }
        )
    return {key: sum(row[key] for row in rows) / len(rows) for key in rows[0]}


def per_day(runs: list[dict[str, Any]], kind: str = "reviews") -> list[float]:
    """Mean reviews (or new topics) on each day of the semester."""
    totals = [0.0] * (EXAM_DAY + 1)
    for run in runs:
        for k, v in run[kind].items():
            totals[int(k)] += v
    return [total / len(runs) for total in totals]


COLUMNS = (
    ("total", "Reviews", "{:.0f}"),
    ("busiest", "Busiest day", "{:.1f}"),
    ("exam_day", "On the exam day", "{:.1f}"),
    ("never", "Never introduced", "{:.1f}"),
    ("recall", "Recall at the exam", "{:.0%}"),
    ("weak", "Topics under 80%", "{:.1f}"),
    ("stranded", "Due after the exam", "{:.1f}"),
    ("overdue", "Overdue at the exam", "{:.1f}"),
)


def rows(results: dict[str, list[dict[str, Any]]], late: bool) -> list[dict[str, str]]:
    table = []
    for name, runs in results.items():
        s = summary([run for run in runs if run["late"] is late])
        cells = {key: form.format(s[key]) for key, _, form in COLUMNS}
        table.append({"policy": name, **cells})
    return table


def markdown(results: dict[str, list[dict[str, Any]]], late: bool) -> list[str]:
    header = "| Policy | " + " | ".join(label for _, label, _ in COLUMNS) + " |"
    lines = [header, "| --- |" + " ---: |" * len(COLUMNS)]
    for row in rows(results, late):
        cells = " | ".join(row[key] for key, _, _ in COLUMNS)
        lines.append(f"| {row['policy']} | {cells} |")
    return lines


def load(paths: list[Path]) -> dict[str, list[dict[str, Any]]]:
    results = {}
    for path in paths:
        content = json.loads(path.read_text(encoding="utf-8"))
        results[content["name"]] = content["runs"]
    return results


def report(paths: list[Path]) -> str:
    results = load(paths)
    count = len(next(iter(results.values()))) // 2
    return "\n".join(
        [
            f"Means over {count} runs per row: learners who skip 5, 15 or 30% of days.",
            "",
            "Exam known from day 0, 8 weeks out:",
            "",
            *markdown(results, late=False),
            "",
            f"Exam date set on day {LATE_SET_DAY}, 3 weeks before it:",
            "",
            *markdown(results, late=True),
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--engine", help="a checkout root whose learning/ to run")
    parser.add_argument("--name", default="engine")
    parser.add_argument("--seeds", type=int, default=20)
    parser.add_argument(
        "--preference",
        action="append",
        default=[],
        metavar="NAME=VALUE",
        help="a course preference set in every run",
    )
    parser.add_argument(
        "--ease",
        type=float,
        default=1.0,
        help="the median topic's first stability as a share of FSRS's (harder: < 1)",
    )
    parser.add_argument("--out", type=Path)
    parser.add_argument("--report", nargs="+", type=Path)
    args = parser.parse_args()
    if args.report:
        print(report(args.report))
        return 0
    preferences = dict(item.split("=", 1) for item in args.preference)
    runs = simulate(args.engine, preferences, args.seeds, args.ease)
    if args.out:
        content = {"name": args.name, "preferences": preferences, "runs": runs}
        args.out.write_text(json.dumps(content), encoding="utf-8")
    print(json.dumps({"name": args.name, **summary(runs)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
