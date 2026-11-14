"""What the learner gets through on a study day, learned from his own record.

Pure. Every course's record says, day by day, which topics he reviewed (a
probe day) and which he started (a learning day). From those days the engine
learns which weekdays he studies and, for reviews and for new topics, the limit
he has shown, if any.

Finishing the plan is a lower bound, not a measure. A day he did everything
owed shows only that he can do at least that much; a day he stopped while
something owed was left shows where he stops. Owed is what the plan proposes
whatever his pace: every review due that day (memory needs it), except within
a course's final review, which the plan spreads to the exam, and each exam
course's pace of new topics (those left over the study days left, as whole
topics a day (``pace``), as many as are ready). So the plan proposes
everything owed until he stops short of it, and a learner who does exactly
what the plan asks is never limited by it.

His limit for each kind is the recency-weighted mean of the days that say
something about it: every day he stopped short, and every finished day at or
above the limit itself. A finished day below it says only that he can do that
little, which the limit already allows. Once he has stopped short, the plan
proposes no more than the limit and keeps the rest owed; doing more than it
proposes raises it. Until then the same mean, over finished days only, is the
most he has shown he does: new topics are proposed at least at that pace, and
past each exam's pace when it needs more.

A day he answered no review at all says only that he did not review that
day, not how many he gets through when he does, so it never shows a review
limit: a limit of none would hold every review off the plan for good.

Which weekdays he studies is censored the same way: a day the plan held
nothing and he did nothing says nothing, since nothing was proposed. A weekday
is a study day while he is at least half as likely to study on it as on his
usual day; only skipped days the plan held work for turn it off, and a day off
stays off until he studies on it.

Before there is any evidence a prior stands in: he studies every day and
starts ``PRIOR_NEW`` new topics on a study day, each weighing as much as one
observed day. Recent weeks count more (each week half as much as the next
every ``HALF_LIFE_DAYS``), so a change of routine shows within a week or two;
the days of one week weigh alike, so no weekday counts more for being the most
recent. The evidence starts on his first recorded day. A weekday leans on his
overall rates as much as one day would, so a weekday seen once does not swing
the plan and a single skip does not turn it off.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Hashable, Iterable, Mapping
from dataclasses import dataclass
from datetime import date, timedelta
import math
from typing import Any, TypeVar

from learning import arc_rules, progress

# Two weeks: each weekday is seen at least twice at near-full weight, and a new
# routine outweighs the old one within a week.
HALF_LIFE_DAYS = 14
# The prior stands for one recorded day.
PRIOR_WEIGHT = 1.0
# Cold start: a course is begun one topic at a time.
PRIOR_NEW = 1.0
WEEK = 7

Name = TypeVar("Name", bound=Hashable)


@dataclass(frozen=True)
class Done:
    """What one day's record shows was completed, across every course, and
    whether he stopped with reviews or exam-paced new topics still owed."""

    reviews: int = 0
    new: int = 0
    reviews_short: bool = False
    new_short: bool = False


@dataclass(frozen=True)
class Limit:
    """One kind of work on a study day: the limit he has shown (``shown``) or,
    while he has shown none, the most he has shown he does."""

    value: float
    shown: bool = False


@dataclass(frozen=True)
class Weekday:
    """One weekday's estimate: the chance he studies, and on a study day his
    reviews and new topics."""

    study: float
    reviews: Limit
    new: Limit


@dataclass(frozen=True)
class Capacity:
    """His estimated week, Monday first, and the study days behind it."""

    weekdays: tuple[Weekday, ...]
    study_weekdays: frozenset[int]
    evidence: float

    def studies(self, day: date) -> bool:
        """Whether he studies on this weekday, as his recent weeks show."""
        return day.weekday() in self.study_weekdays

    def on(self, day: date) -> Weekday:
        return self.weekdays[day.weekday()]

    def share(self, day: date, last: date) -> float:
        """``day``'s part of the reviews he does from ``day`` to ``last``: by
        each study day's reviews, evenly while none are known."""
        if not self.studies(day):
            return 0.0
        days = [
            other
            for other in (day + timedelta(days=n) for n in range((last - day).days + 1))
            if self.studies(other)
        ]
        total = sum(self.on(other).reviews.value for other in days)
        if not total:
            return 1 / len(days)
        return self.on(day).reviews.value / total

    def summary(self) -> dict[str, Any]:
        names = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        study = sorted(self.study_weekdays)
        kinds = {
            kind: [getattr(weekday, kind) for weekday in self.weekdays]
            for kind in ("reviews", "new")
        }
        return {
            "study_days": [names[day] for day in study],
            **{
                f"{kind}_per_day": {
                    names[day]: round(limits[day].value, 1) for day in study
                }
                for kind, limits in kinds.items()
            },
            "limited": [
                kind
                for kind, limits in kinds.items()
                if any(limit.shown for limit in limits)
            ],
            "evidence_days": round(self.evidence, 1),
        }


def whole(day: date, rate: Callable[[date], float]) -> int:
    """A day's whole items from a fractional daily ``rate``: the rates of its
    calendar week through ``day``, summed and rounded, less the same through
    the day before. The fractions carry from day to day within the week, so a
    day never takes more than its own rate rounded up, and a date gets the
    same count whichever day the plan is made on: a plan made tomorrow keeps
    the days today's plan put things on."""
    monday = day - timedelta(days=day.weekday())

    def through(last: date) -> float:
        days = (monday + timedelta(days=n) for n in range((last - monday).days + 1))
        return sum(rate(other) for other in days)

    return math.floor(through(day) + 0.5) - math.floor(
        through(day - timedelta(days=1)) + 0.5
    )


def pace(rest: int, left: int, day: date, studies: Callable[[date], bool]) -> int:
    """The topics an exam's pace starts on ``day``: its ``rest`` over the
    ``left`` study days, today included, as whole topics (``whole``). A pace
    of half a topic a day starts one every other day, and leaves the days
    between to other courses, instead of one every day until its topics run
    out; its last study day takes all that is left, so the deadline holds."""
    return whole(day, lambda other: rest / left if studies(other) else 0.0)


# --- what each day shows ------------------------------------------------------


def _first_day(replayed: progress.Replay, topic: dict[str, Any]) -> date | None:
    started = topic.get("introduced")
    learning = [day for day, kind in replayed.days.items() if kind == progress.LEARNING]
    first = min([*learning, *([started] if started else [])], default=None)
    return date.fromisoformat(first) if first else None


def _solid_before(replayed: progress.Replay, day: date) -> bool:
    """Solid on ``day``'s morning: the last verdict before it was ``solid``."""
    before = [verdict for when, verdict in replayed.verdicts if when < day.isoformat()]
    return bool(before) and before[-1] == "solid"


def _reviews_left(
    replayed: progress.Replay, exam: progress.Exam | None, today: date
) -> set[date]:
    """Days this topic's review was still due at the day's end and owed: not
    the exam day, and not within the final review, which the plan spreads."""
    left: set[date] = set()
    steps = replayed.schedule
    ends = [base for base, _ in steps[1:]] + [today] if steps else []
    for (base, due), end in zip(steps, ends, strict=True):
        day = max(due, base + timedelta(days=1))
        while day < end:
            if exam is None or not exam.final <= day <= exam.day:
                left.add(day)
            day += timedelta(days=1)
    return left


def _opened(
    record: dict[str, Any],
    untaught: list[str],
    ready: list[str],
    pace: int,
    free: frozenset[str],
) -> list[str]:
    """Up to ``pace`` of ``ready`` as the plan takes them from its window
    (``progress.opens``), which each start moves on, in the order the plan
    takes them (``agenda._new``'s ``take``)."""
    left, taken = list(untaught), list[str]()
    while len(taken) < pace and left:
        front = left[0]
        window = progress.window(record, front, free)
        found = next(
            (
                key
                for key in ready
                if key not in taken and progress.opens(record, key, window, front)
            ),
            None,
        )
        if found is None:
            break
        taken.append(found)
        left.remove(found)
    return taken


def _new_short(
    record: dict[str, Any],
    replayed: Mapping[str, progress.Replay],
    days: Iterable[date],
    studies: frozenset[int],
) -> set[date]:
    """Of ``days``, those he started fewer of this course's topics than its
    exam pace owed: the topics the exam needed started that morning
    (``progress.exam_topics``) over the study days left, as many as were
    ready in the window the plan read them from (``progress.opens``), or
    beyond it on a day holding them would have raised the pace."""
    exam = progress.exam_plan(record)
    if exam is None:
        return set()
    starts = {
        key: first
        for key, replay in replayed.items()
        if (first := _first_day(replay, record["topics"][key])) is not None
    }
    order = progress.path_order(record)
    partners = progress.contrasts(record)
    asks = progress.asks(record)
    free = progress.free_arcs(record)
    short: set[date] = set()
    for day in days:
        if exam.day <= day:
            continue
        end = progress.new_end(exam, day)
        left = sum(
            (day + timedelta(days=n)).weekday() in studies
            for n in range((end - day).days + 1)
        )
        untaught = [key for key in order if starts.get(key, day) >= day]
        scope = progress.exam_topics(record, untaught)
        untaught = [key for key in untaught if scope is None or key in scope]
        if not left or not untaught:
            continue

        def solid(key: str, day: date = day) -> bool:
            if not asks:
                return starts.get(key, day) < day
            return _solid_before(replayed[key], day)

        ready = [
            key
            for key in untaught
            if all(solid(need) for need in progress.needs(record, key))
            and not any(
                starts.get(other, day) < day and not solid(other)
                for other in partners[key]
            )
        ]
        owed = pace(len(untaught), left, day, lambda other: other.weekday() in studies)
        opened = _opened(record, untaught, ready, owed, free)
        if len(opened) < owed and not progress.holding_raises(
            left, len(untaught) - len(opened), len(untaught)
        ):
            ready = opened
        owed = min(len(ready), owed)
        if sum(starts.get(key) == day for key in untaught) < owed:
            short.add(day)
    return short


def activity(records: Iterable[dict[str, Any]], today: date) -> dict[date, Done]:
    """Every day with recorded study, across the given courses: reviews
    answered on a review day, topics started, and, on a day before ``today``
    the plan held work for, whether he stopped with work owed.

    What was due on a past day is replayed without the exam: an exam set later
    would replay it earlier than it stood (no credit for late answers, and
    reviews pulled to the final review), and a review the plan never proposed
    is no sign he stopped."""
    records = list(records)
    reviews: dict[date, int] = defaultdict(int)
    new: dict[date, int] = defaultdict(int)
    replayed = [progress.replays(record) for record in records]
    for record, replays in zip(records, replayed, strict=True):
        for key, replay in replays.items():
            first = _first_day(replay, record["topics"][key])
            if first is not None:
                new[first] += 1
            for day, kind in replay.days.items():
                if kind == progress.PROBE:
                    reviews[date.fromisoformat(day)] += 1
                elif kind == progress.PRACTICE:
                    reviews.setdefault(date.fromisoformat(day), 0)
    studied = sorted({*reviews, *new})
    week = _study_weekdays(studied, today)
    left: set[date] = set()
    short: set[date] = set()
    for record, replays in zip(records, replayed, strict=True):
        if progress.asks(record):
            exam_of = progress.examining(record)
            for key, replay in progress.replays({**record, "exam": {}}).items():
                left |= _reviews_left(replay, exam_of(key), today)
        short |= _new_short(record, replays, week.planned, week.study)
    return {
        day: Done(
            reviews.get(day, 0),
            new.get(day, 0),
            day in left and day in week.planned and reviews.get(day, 0) > 0,
            day in short,
        )
        for day in studied
    }


# --- the estimate -------------------------------------------------------------


def _weight(day: date, today: date) -> float:
    """Whole weeks back from yesterday weigh alike, so no weekday counts more
    for being the most recent."""
    weeks_back = (today - day - timedelta(days=1)).days // WEEK
    return float(0.5 ** (weeks_back * WEEK / HALF_LIFE_DAYS))


@dataclass
class _Tally:
    """Recency-weighted sums over some days, and how many days they cover."""

    days: int = 0
    weight: float = 0.0
    total: float = 0.0

    def add(self, weight: float, value: float) -> None:
        self.days += 1
        self.weight += weight
        self.total += weight * value

    def toward(self, prior: float) -> float:
        """The recency-weighted mean, leaning on ``prior`` as much as one
        observed day would: recency decides the mean, the count of days how
        far it outweighs the prior."""
        if not self.days:
            return prior
        mean = self.total / self.weight
        return (self.days * mean + PRIOR_WEIGHT * prior) / (self.days + PRIOR_WEIGHT)


@dataclass(frozen=True)
class _Seen:
    """One study day of one kind: how many he did, and whether he stopped short."""

    day: date
    weight: float
    done: float
    short: bool


def _limit(seen: list[_Seen]) -> Limit:
    """The recency-weighted mean of the days he stopped short and the days he
    finished at or above that mean. Dropping a finished day below the mean only
    raises it, so the least such mean is found by dropping the lowest finished
    days until none is below."""
    if not seen:
        return Limit(0.0)
    levels = sorted({item.done for item in seen})
    for level in levels:
        counted = [item for item in seen if item.short or item.done >= level]
        mean = sum(item.weight * item.done for item in counted) / sum(
            item.weight for item in counted
        )
        if mean <= level or level == levels[-1]:
            break
    return Limit(min(mean, level), any(item.short for item in seen))


def _kind(
    days: dict[date, Done], today: date, done: str, short: str, prior: float | None
) -> list[Limit]:
    """One kind's limit on each weekday, leaning on his overall limit."""
    seen = [
        _Seen(day, _weight(day, today), getattr(item, done), getattr(item, short))
        for day, item in days.items()
    ]
    if prior is not None:
        seen.append(_Seen(today, PRIOR_WEIGHT, prior, False))
    overall = _limit(seen)
    weekdays = [_Tally() for _ in range(WEEK)]
    for item in seen:
        if item.day < today and (item.short or item.done >= overall.value):
            weekdays[item.day.weekday()].add(item.weight, item.done)
    return [Limit(tally.toward(overall.value), overall.shown) for tally in weekdays]


@dataclass(frozen=True)
class _Week:
    """Each weekday's chance he studies, the weekdays he studies, and the past
    days the plan held work for (a study weekday at the time)."""

    chance: list[float]
    study: frozenset[int]
    planned: frozenset[date]


def _study_weekdays(days: Iterable[date], today: date) -> _Week:
    """His study weekdays, replayed day by day from his first record: a day
    off the plan held nothing for, and he did nothing on, is not counted."""
    studied = {day for day in days if day < today}
    fade = 0.5 ** (WEEK / HALF_LIFE_DAYS)
    weight = [0.0] * WEEK
    total = [0.0] * WEEK
    planned: set[date] = set()

    def week() -> tuple[list[float], frozenset[int]]:
        usual = (sum(total) + PRIOR_WEIGHT) / (sum(weight) + PRIOR_WEIGHT)
        chance = [
            (total[day] + PRIOR_WEIGHT * usual) / (weight[day] + PRIOR_WEIGHT)
            for day in range(WEEK)
        ]
        return chance, frozenset(day for day in range(WEEK) if chance[day] >= usual / 2)

    first = min(studied, default=today)
    for offset in range((today - first).days):
        day = first + timedelta(days=offset)
        weekday = day.weekday()
        if weekday in week()[1]:
            planned.add(day)
        elif day not in studied:
            continue
        weight[weekday] = weight[weekday] * fade + 1
        total[weekday] = total[weekday] * fade + (day in studied)
    chance, study = week()
    return _Week(chance, study, frozenset(planned))


def estimate(days: dict[date, Done], today: date) -> Capacity:
    """His week from the days before ``today`` (today is still under way)."""
    past = {day: done for day, done in days.items() if day < today}
    week = _study_weekdays(past, today)
    reviews = _kind(past, today, "reviews", "reviews_short", None)
    new = _kind(past, today, "new", "new_short", PRIOR_NEW)
    weekdays = tuple(
        Weekday(week.chance[day], reviews[day], new[day]) for day in range(WEEK)
    )
    return Capacity(weekdays, week.study, float(len(past)))


def of(records: Iterable[dict[str, Any]], today: date) -> Capacity:
    return estimate(activity(records, today), today)


# --- the final review ---------------------------------------------------------


def final_reviews(
    records: Mapping[Name, dict[str, Any]], today: date
) -> dict[Name, dict[str, Any]]:
    """Every course read with the plan: each exam's final review from his pace
    as the record now shows it (``final_review_days``), nearest exam first,
    with the dates the engine set re-derived from it (``progress.redated``).
    A final review a course preference sets, or one that has begun
    (``progress.begun``), stands.

    His pace is read with the final reviews still to come holding none of the
    days he has studied: the reviews he does a day, and the days he studies,
    are what sizes them, so they must not hang on the lengths they size, and
    a final review not yet begun holds no day gone. An exam that has passed
    with no start on record had no answer in its final review (a save in it
    keeps its start), so its shortest form changes nothing.
    """
    unplanned = [name for name, record in records.items() if progress.unplanned(record)]
    if not unplanned:
        return dict(records)

    def exam_day(name: Name) -> date:
        return date.fromisoformat(records[name]["exam"]["date"])

    result = {
        name: progress.with_final_review(record, exam_day(name))
        if name in unplanned
        else record
        for name, record in records.items()
    }
    week = of(result.values(), today)
    for name in sorted(unplanned, key=exam_day):
        record = records[name]
        others = [other for key, other in result.items() if key != name]
        lead = final_review_days(record, others, week, today)
        assert lead is not None
        start = exam_day(name) - timedelta(days=lead)
        result[name] = progress.redated(
            progress.with_final_review(record, start), today
        )
    return result


def replanned(
    records: Mapping[Name, dict[str, Any]], name: Name, today: date
) -> dict[str, Any]:
    """Course ``name`` after a save moved its exam: its final review read
    again from his pace, its start kept before the move dropped. Its dates
    stand as they were, for the save to re-derive (``progress.schedule``)
    once it has recorded which reviews its answers were."""
    record = progress.with_final_review(records[name], None)
    start = final_reviews({**records, name: record}, today)[name]["exam"].get(
        "final_review"
    )
    return progress.with_final_review(
        record, date.fromisoformat(start) if start else None
    )


def _examined(record: dict[str, Any]) -> int:
    """How many path topics the next exam examines."""
    examined = arc_rules.examined(record)
    return sum(
        examined is None or key in examined for key in progress.path_order(record)
    )


def final_review_days(
    record: dict[str, Any],
    others: Iterable[dict[str, Any]],
    week: Capacity,
    today: date,
) -> int | None:
    """How many days before its exam a course's final review starts, from his
    pace: the fewest that hold one review of each topic it examines, at the
    reviews he does on each study day (``Weekday.reviews``), less what a
    nearer exam's final review takes of those days, and never fewer than the
    shortest final review (``progress.SHORTEST_FINAL_REVIEW``).

    The final review comes before every other review, nearest exam first, and
    spreads its topics over its days by what each holds, so this is the
    shortest one with room for every topic; a longer one would ask him to
    review topics further from the exam than his pace needs, and a shorter one
    leaves some with no review before it. It starts no earlier than today:
    days gone hold nothing. With no review on record yet the shortest stands.

    Until he has stopped short of the reviews owed, the reviews he does are
    the least he can do (the module's rule): a final review that holds every
    topic at that rate holds them at his, so it stands. One that cannot start
    late enough shows only that the least he can do is too little, never
    that he is behind, so the shortest stands: early in a course, when one
    review fell due a day, the least read as a review a day would start a far
    exam's final review today, and a save that day keeps a start once it has
    come (``progress.begun``). None without an exam date.
    """
    when = record.get("exam", {}).get("date")
    if not when:
        return None
    exam = date.fromisoformat(when)
    shortest = progress.SHORTEST_FINAL_REVIEW
    if not any(weekday.reviews.value for weekday in week.weekdays):
        return shortest
    limited = any(weekday.reviews.shown for weekday in week.weekdays)
    nearer = []
    for other in others:
        plan = progress.exam_plan(other)
        if plan is not None and today < plan.day < exam:
            days = [
                plan.final + timedelta(days=n)
                for n in range((plan.day - plan.final).days)
            ]
            total = sum(week.on(day).reviews.value for day in days if week.studies(day))
            nearer.append((plan, _examined(other), total))
    topics = _examined(record)
    room = 0.0
    lead = 0
    while room < topics or lead < shortest:
        lead += 1
        day = exam - timedelta(days=lead)
        if day < today:
            return max(lead - 1, shortest) if limited else shortest
        if not week.studies(day):
            continue
        rate = week.on(day).reviews.value
        taken = sum(
            count * rate / total
            for plan, count, total in nearer
            if total and plan.final <= day < plan.day
        )
        room += max(rate - taken, 0.0)
    return lead
