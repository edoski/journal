"""Four courses at once, on the learning engine's own functions, in memory.

Each course has 30 topics and its exam on day 49, 56, 70 or 84; the run goes
on 90 days past the last exam. Learners differ in how much they get through on
a study day and on which weekdays they study (``LEARNERS``). Each study day the
learner asks the engine for the day's plan, does it as far as his own capacity
allows, then, with capacity left, does more: further due reviews and the next
topic of the nearest exam. Memory is FSRS-6 (``semester_sim.Memory``), an
outside model, never the engine's scheduler.

An engine with ``agenda.plan`` plans the four courses together; one with only
``agenda.plan_days`` plans each course alone at its default budget, with his
study weekdays as its Journal's. The same learners run on both:

    git archive <base> learning sync | tar -x -C /tmp/base
    python tools/semester_sim4.py --engine /tmp/base --name before --out before.json
    python tools/semester_sim4.py --name after --out after.json
    python tools/semester_sim4.py --report before.json after.json --figure load.png
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import date, timedelta
import importlib
import json
from multiprocessing import Pool
from pathlib import Path
import random
import statistics
import sys
from types import ModuleType
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import semester_sim as sim  # noqa: E402

START = date(2026, 1, 5)  # a Monday
EXAMS = (49, 56, 70, 84)
TOPICS = 30
AFTER = 90
END = max(EXAMS) + AFTER


@dataclass(frozen=True)
class Learner:
    """How much he gets through on a study day, and when he studies."""

    name: str
    reviews: int
    new: int
    weekdays: frozenset[int]
    skip: float = 0.05


LEARNERS = (
    Learner("evenings", 10, 2, frozenset({0, 1, 2, 3, 6})),
    Learner("light", 6, 1, frozenset({0, 2, 5})),
    Learner("steady", 14, 3, frozenset(range(6))),
    Learner("eager", 24, 4, frozenset(range(7))),
)


def day(n: int) -> date:
    return START + timedelta(days=n)


def load_engine(root: str | None) -> dict[str, ModuleType]:
    sys.path.insert(0, str(Path(root or Path(__file__).resolve().parents[1]).resolve()))
    names = ("schema", "progress", "agenda")
    engine = {name: importlib.import_module(f"learning.{name}") for name in names}
    if hasattr(engine["agenda"], "plan") and not hasattr(engine["agenda"], "plan_days"):
        engine["capacity"] = importlib.import_module("learning.capacity")
    return engine


@dataclass
class Course:
    name: str
    exam: int
    record: dict[str, Any]
    memory: dict[str, sim.Memory] = field(default_factory=dict)


@dataclass
class Day:
    planned_reviews: int = 0
    planned_new: int = 0
    done_reviews: int = 0
    done_new: int = 0
    study: bool = False
    reviews_on_exam_day: int = 0


class Run:
    def __init__(self, engine: dict[str, ModuleType], learner: Learner, seed: int):
        self.schema, self.progress = engine["schema"], engine["progress"]
        self.agenda, self.capacity = engine["agenda"], engine.get("capacity")
        self.learner = learner
        self.rng = random.Random(f"{learner.name}/{seed}")
        # Days off from their own stream, so every engine meets the same days.
        self.days_off = random.Random(f"{learner.name}/{seed}/days off")
        self.ease = {
            f"c{c}/t{i:02d}": self.rng.lognormvariate(0, 0.5)
            for c in range(len(EXAMS))
            for i in range(TOPICS)
        }
        self.courses = [self._course(index, exam) for index, exam in enumerate(EXAMS)]
        self.days: list[Day] = []
        self.recall: dict[str, dict[str, float]] = {}
        self.never: dict[str, int] = {}
        self.estimates: list[dict[str, Any]] = []

    def _course(self, index: int, exam: int) -> Course:
        handles = [f"t{i:02d}" for i in range(TOPICS)]
        patch = {
            "topics": {key: {} for key in handles},
            "path": {"order": handles},
            "exam": {"date": day(exam).isoformat()},
        }
        course = Course(f"c{index}", exam, self.schema.empty())
        self.save(course, patch, 0)
        return course

    def save(self, course: Course, patch: dict[str, Any], n: int) -> None:
        now = f"{day(n).isoformat()}T20:00:00+00:00"
        patched, outcome = self.schema.apply_patch(
            course.record, patch, today=day(n), now=now
        )
        planned, _ = self.progress.schedule(patched, outcome, day(n))
        course.record = self.schema.validate_record(planned)

    def plan(self, n: int) -> dict[str, tuple[list[str], list[str]]]:
        if hasattr(self.agenda, "plan_days"):
            result = {}
            for course in self.courses:
                settings = self.agenda.settings(course.record["preferences"])
                entry = self.agenda.plan_days(
                    course.record,
                    day(n),
                    settings,
                    1,
                    study_day=lambda when: when.weekday() in self.learner.weekdays,
                )[0]
                result[course.name] = (list(entry["reviews"]), list(entry["new"]))
            return result
        records = {course.name: course.record for course in self.courses}
        together = self.agenda.plan(records, day(n), 1)
        return {
            name: (list(days[0]["reviews"]), list(days[0]["new"]))
            for name, days in together.days.items()
        }

    def by_exam(self, n: int) -> list[Course]:
        """Courses with their exam ahead, nearest first, then those past it."""
        return sorted(self.courses, key=lambda course: (course.exam < n, course.exam))

    def study(self, n: int) -> Day:
        record = Day(study=True)
        plan = self.plan(n)
        record.planned_reviews = sum(len(r) for r, _ in plan.values())
        record.planned_new = sum(len(new) for _, new in plan.values())
        for course in self.courses:
            if course.exam == n:
                record.reviews_on_exam_day += len(plan[course.name][0])
        reviews: dict[str, list[str]] = {course.name: [] for course in self.courses}
        new: dict[str, list[str]] = {course.name: [] for course in self.courses}
        room_reviews, room_new = self.learner.reviews, self.learner.new
        for course in self.by_exam(n):
            if course.exam == n:
                continue
            for topic in plan[course.name][0]:
                if room_reviews > 0:
                    reviews[course.name].append(topic)
                    room_reviews -= 1
            for topic in plan[course.name][1]:
                if room_new > 0:
                    new[course.name].append(topic)
                    room_new -= 1
        for course in self.by_exam(n):
            if course.exam == n:
                continue
            for item in self.progress.due(course.record, day(n), limit=0):
                if room_reviews <= 0:
                    break
                if item["topic"] not in reviews[course.name]:
                    reviews[course.name].append(item["topic"])
                    room_reviews -= 1
        for course in self.by_exam(n):
            if course.exam <= n:
                continue
            for topic in self.untaught(course):
                if room_new <= 0:
                    break
                if topic not in new[course.name]:
                    new[course.name].append(topic)
                    room_new -= 1
        for course in self.courses:
            self.learn(course, n, reviews[course.name], new[course.name])
        record.done_reviews = sum(len(r) for r in reviews.values())
        record.done_new = sum(len(t) for t in new.values())
        return record

    def untaught(self, course: Course) -> list[str]:
        return [
            key
            for key in self.progress.path_order(course.record)
            if key not in course.memory
        ]

    def learn(self, course: Course, n: int, reviews: list[str], new: list[str]) -> None:
        observations = []
        for topic in reviews:
            memory = course.memory.get(topic)
            if memory is None:
                continue
            recalled = self.rng.random() < memory.recall(n)
            memory.review(n, sim.GOOD if recalled else sim.AGAIN)
            if not recalled:
                memory.review(n, sim.GOOD)
            observations.append(sim.attempt(topic, recalled))
        for topic in new:
            ease = self.ease[f"{course.name}/{topic}"]
            course.memory[topic] = sim.Memory.learned(n, ease)
            observations.append(sim.attempt(topic, True))
        patch: dict[str, Any] = {}
        if new:
            patch["topics"] = {topic: {"introduced": True} for topic in new}
        if observations:
            patch["observations"] = observations
        if patch:
            self.save(course, patch, n)

    def measure(self, n: int) -> None:
        for course in self.courses:
            if n in (course.exam, course.exam + AFTER):
                values = [
                    course.memory[f"t{i:02d}"].recall(n)
                    if f"t{i:02d}" in course.memory
                    else 0.0
                    for i in range(TOPICS)
                ]
                key = "exam" if n == course.exam else "after"
                self.recall.setdefault(course.name, {})[key] = statistics.mean(values)
            if n == course.exam:
                self.never[course.name] = TOPICS - len(course.memory)

    def run(self) -> dict[str, Any]:
        for n in range(END + 1):
            self.measure(n)
            if self.capacity is not None and n % 7 == 0:
                week = self.capacity.of([c.record for c in self.courses], day(n))
                rates = [week.weekdays[d] for d in sorted(self.learner.weekdays)]
                self.estimates.append(
                    {
                        "day": n,
                        "reviews": statistics.mean(_value(r.reviews) for r in rates),
                        "new": statistics.mean(_value(r.new) for r in rates),
                        "weekdays": sorted(week.study_weekdays),
                    }
                )
            off = day(n).weekday() not in self.learner.weekdays
            if off or self.days_off.random() < self.learner.skip:
                plan = self.plan(n)
                self.days.append(
                    Day(
                        planned_reviews=sum(len(r) for r, _ in plan.values()),
                        planned_new=sum(len(t) for _, t in plan.values()),
                    )
                )
                continue
            self.days.append(self.study(n))
        return {
            "days": [vars(d) for d in self.days],
            "recall": self.recall,
            "never": self.never,
            "estimates": self.estimates,
        }


def _value(rate: Any) -> float:
    """A weekday's rate: a number, or a limit with its value."""
    return float(getattr(rate, "value", rate))


_ENGINE: dict[str, ModuleType] = {}


def _init(root: str | None) -> None:
    _ENGINE.update(load_engine(root))


def _one(job: tuple[int, int]) -> dict[str, Any]:
    learner, seed = job
    result = Run(_ENGINE, LEARNERS[learner], seed).run()
    return {"learner": LEARNERS[learner].name, "seed": seed, **result}


def simulate(root: str | None, seeds: int) -> list[dict[str, Any]]:
    jobs = [
        (learner, seed) for learner in range(len(LEARNERS)) for seed in range(seeds)
    ]
    with Pool(initializer=_init, initargs=(root,)) as pool:
        return pool.map(_one, jobs)


# --- the report ---------------------------------------------------------------


def _learner(name: str) -> Learner:
    return next(learner for learner in LEARNERS if learner.name == name)


def figures(runs: list[dict[str, Any]]) -> dict[str, float]:
    """Means over runs: the planned load against the learner's own capacity."""
    rows = []
    for run in runs:
        learner = _learner(run["learner"])
        semester = run["days"][: max(EXAMS) + 1]
        weekdays = [day(n).weekday() in learner.weekdays for n in range(len(semester))]
        studied = [entry for entry, on in zip(semester, weekdays, strict=True) if on]
        loads = [entry["planned_reviews"] + entry["planned_new"] for entry in studied]
        capacity = learner.reviews + learner.new
        over = [
            entry["planned_reviews"] > learner.reviews
            or entry["planned_new"] > learner.new
            for entry in studied
        ]
        off = sum(
            entry["planned_reviews"] + entry["planned_new"]
            for entry, on in zip(semester, weekdays, strict=True)
            if not on
        )
        rows.append(
            {
                "median": statistics.median(loads) / capacity,
                "max": max(loads) / capacity,
                "over": sum(over) / len(over),
                "off": off,
                "exam_day": sum(entry["reviews_on_exam_day"] for entry in semester),
                "never": sum(run["never"].values()),
                "exam": statistics.mean(r["exam"] for r in run["recall"].values()),
                "after": statistics.mean(r["after"] for r in run["recall"].values()),
            }
        )
    return {key: statistics.mean(row[key] for row in rows) for key in rows[0]}


COLUMNS = (
    ("median", "Median day, share of his capacity", "{:.0%}"),
    ("max", "Busiest day, share of his capacity", "{:.0%}"),
    ("over", "Study days over his capacity", "{:.0%}"),
    ("off", "Items planned on his days off", "{:.0f}"),
    ("exam_day", "Reviews on an exam day", "{:.1f}"),
    ("never", "Topics never introduced", "{:.1f}"),
    ("exam", "Recall at the exam", "{:.1%}"),
    ("after", "Recall 90 days after", "{:.1%}"),
)


def table(results: dict[str, list[dict[str, Any]]]) -> list[str]:
    lines = [
        "| Learner | Engine | " + " | ".join(label for _, label, _ in COLUMNS) + " |",
        "| --- | --- |" + " ---: |" * len(COLUMNS),
    ]
    for learner in LEARNERS:
        for name, runs in results.items():
            mine = [run for run in runs if run["learner"] == learner.name]
            values = figures(mine)
            cells = " | ".join(form.format(values[key]) for key, _, form in COLUMNS)
            lines.append(f"| {learner.name} | {name} | {cells} |")
    return lines


def convergence(runs: list[dict[str, Any]]) -> list[str]:
    """The estimate of reviews and new topics per study day against what he
    completed on his study days in the four weeks before it."""
    lines = [
        "| Learner | His capacity | Week 4: done, estimate | Week 8 | Week 12 | Study weekdays found, week 8 |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for learner in LEARNERS:
        mine = [run for run in runs if run["learner"] == learner.name]
        if not mine or not mine[0]["estimates"]:
            continue

        def at(week: int) -> str:
            done_reviews, done_new = [], []
            for run in mine:
                days = run["days"][(week - 4) * 7 : week * 7]
                studied = [d for d in days if d["done_reviews"] or d["done_new"]]
                done_reviews.append(statistics.mean(d["done_reviews"] for d in studied))
                done_new.append(statistics.mean(d["done_new"] for d in studied))
            estimate = [run["estimates"][week] for run in mine]
            return (
                f"{statistics.mean(done_reviews):.1f} and {statistics.mean(done_new):.1f}; "
                f"{statistics.mean(e['reviews'] for e in estimate):.1f} and "
                f"{statistics.mean(e['new'] for e in estimate):.1f}"
            )

        found = sum(
            set(run["estimates"][8]["weekdays"]) == set(learner.weekdays)
            for run in mine
        )
        lines.append(
            f"| {learner.name} | {learner.reviews} and {learner.new} | {at(4)} | {at(8)} "
            f"| {at(12)} | {found} of {len(mine)} runs |"
        )
    return lines


def figure(results: dict[str, list[dict[str, Any]]], path: Path) -> None:
    """Planned items per day for the 'evenings' learner, first seed, both engines."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    learner = _learner("evenings")
    fig, axes = plt.subplots(
        len(results), 1, figsize=(10, 2.6 * len(results)), sharex=True, sharey=True
    )
    for axis, (name, runs) in zip(axes, results.items(), strict=True):
        run = next(r for r in runs if r["learner"] == learner.name)
        days = run["days"][: max(EXAMS) + 1]
        load = [d["planned_reviews"] + d["planned_new"] for d in days]
        off = [day(n).weekday() not in learner.weekdays for n in range(len(days))]
        axis.bar(
            range(len(days)),
            load,
            color=["#c0504d" if o else "#4f81bd" for o in off],
            width=0.8,
        )
        axis.axhline(learner.reviews + learner.new, color="#333333", linewidth=1)
        for exam in EXAMS:
            axis.axvline(exam, color="#999999", linestyle=":", linewidth=1)
        axis.set_title(f"{name}: items planned per day (red: his days off)", loc="left")
        axis.set_ylabel("items")
    axes[-1].set_xlabel(
        "day of the semester (dotted: exams; line: what he gets through)"
    )
    fig.tight_layout()
    fig.savefig(path, dpi=150)


def main() -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--engine", help="a checkout root whose learning/ to run")
    parser.add_argument("--name", default="engine")
    parser.add_argument("--seeds", type=int, default=4)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--report", nargs="+", type=Path)
    parser.add_argument("--figure", type=Path)
    args = parser.parse_args()
    if args.report:
        results = {}
        for path in args.report:
            content = json.loads(path.read_text(encoding="utf-8"))
            results[content["name"]] = content["runs"]
        lines = [
            f"Four courses of {TOPICS} topics, exams on days {', '.join(map(str, EXAMS))};"
            " means over seeds. Capacity is each learner's own reviews plus new topics"
            " on a study day.",
            "",
            *table(results),
        ]
        for name, runs in results.items():
            if runs[0]["estimates"]:
                lines += [
                    "",
                    f"The estimate of his pace ({name}):",
                    "",
                    *convergence(runs),
                ]
        print("\n".join(lines))
        if args.figure:
            figure(results, args.figure)
        return 0
    runs = simulate(args.engine, args.seeds)
    if args.out:
        args.out.write_text(
            json.dumps({"name": args.name, "runs": runs}), encoding="utf-8"
        )
    print(json.dumps({"name": args.name, **figures(runs)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
