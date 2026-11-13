"""What the learner gets through on a study day, learned from his own record.

Pure. Every course's record says, day by day, which topics he reviewed (a
probe day) and which he started (a learning day). From those days, weighted
toward the recent ones, the engine estimates for each weekday how likely he is
to study and, when he does, how many reviews and new topics he completes. The
daily plan proposes that much and no more, and only on the weekdays he studies.

Before there is any evidence a prior stands in for it: he studies every day,
and on a study day completes ``PRIOR_REVIEWS`` reviews and ``PRIOR_NEW`` new
topics. It weighs as much as one observed day (for which days he studies, one
day spread over the week), so after ten recorded days it is a tenth of the
estimate. Recent weeks count more toward the mean (each week half as much as the next
every ``HALF_LIFE_DAYS``), so a change of routine shows within a week or two;
the days of one week weigh alike, so no weekday counts more for being the most
recent. The evidence starts on his first recorded day. A weekday's own rates lean on his overall rates the same way, so a
weekday seen once does not swing the plan.

Doing more than the plan proposes (more reviews from the due list, the next
topic) is recorded like any other day, so the estimate rises toward his real
pace; doing less lowers it.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from learning import progress

# Two weeks: each weekday is seen at least twice at near-full weight, and a new
# routine outweighs the old one within a week.
HALF_LIFE_DAYS = 14
# The prior stands for one recorded day.
PRIOR_WEIGHT = 1.0
# Cold start: today's review, as the engine sizes it, and one new topic.
PRIOR_REVIEWS = float(progress.DUE_LIMIT)
PRIOR_NEW = 1.0
WEEK = 7


@dataclass(frozen=True)
class Done:
    """What one day's record shows was completed, across every course."""

    reviews: int = 0
    new: int = 0


@dataclass(frozen=True)
class Weekday:
    """One weekday's estimate: the chance he studies, and on a study day the
    reviews and new topics he completes."""

    study: float
    reviews: float
    new: float


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
        """``day``'s part of the reviews he completes from ``day`` to ``last``."""
        if not self.studies(day):
            return 0.0
        total = sum(
            self.on(other).reviews
            for other in (day + timedelta(days=n) for n in range((last - day).days + 1))
            if self.studies(other)
        )
        return self.on(day).reviews / total if total else 0.0

    def summary(self) -> dict[str, Any]:
        names = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        return {
            "study_days": [names[day] for day in sorted(self.study_weekdays)],
            "reviews_per_day": {
                names[day]: round(self.weekdays[day].reviews, 1)
                for day in sorted(self.study_weekdays)
            },
            "new_per_day": {
                names[day]: round(self.weekdays[day].new, 1)
                for day in sorted(self.study_weekdays)
            },
            "evidence_days": round(self.evidence, 1),
        }


def activity(records: Iterable[dict[str, Any]]) -> dict[date, Done]:
    """Every day with recorded study: reviews answered on a review day and
    topics started, across the given courses."""
    reviews: dict[date, int] = defaultdict(int)
    new: dict[date, int] = defaultdict(int)
    for record in records:
        for key, replayed in progress.replays(record).items():
            started = record["topics"][key].get("introduced")
            learning = [
                day for day, kind in replayed.days.items() if kind == progress.LEARNING
            ]
            first = min([*learning, *([started] if started else [])], default=None)
            if first is not None:
                new[date.fromisoformat(first)] += 1
            for day, kind in replayed.days.items():
                if kind == progress.PROBE:
                    reviews[date.fromisoformat(day)] += 1
                elif kind == progress.PRACTICE:
                    reviews.setdefault(date.fromisoformat(day), 0)
    return {
        day: Done(reviews.get(day, 0), new.get(day, 0))
        for day in sorted({*reviews, *new})
    }


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

    def toward(self, prior: float, prior_days: float = PRIOR_WEIGHT) -> float:
        """The recency-weighted mean, leaning on ``prior`` as much as
        ``prior_days`` observed days would: recency decides the mean, the count
        of days how far it outweighs the prior."""
        if not self.days:
            return prior
        mean = self.total / self.weight
        return (self.days * mean + prior_days * prior) / (self.days + prior_days)


def estimate(days: dict[date, Done], today: date) -> Capacity:
    """His week from the days before ``today`` (today is still under way)."""
    past = {day: done for day, done in days.items() if day < today}
    seen = [_Tally() for _ in range(WEEK)]
    reviews = [_Tally() for _ in range(WEEK)]
    new = [_Tally() for _ in range(WEEK)]
    every_seen, every_reviews, every_new = _Tally(), _Tally(), _Tally()
    first = min(past, default=today)
    for offset in range((today - first).days):
        day = first + timedelta(days=offset)
        weight, weekday = _weight(day, today), day.weekday()
        done = past.get(day)
        seen[weekday].add(weight, done is not None)
        every_seen.add(weight, done is not None)
        if done is not None:
            reviews[weekday].add(weight, done.reviews)
            new[weekday].add(weight, done.new)
            every_reviews.add(weight, done.reviews)
            every_new.add(weight, done.new)
    usual_reviews = every_reviews.toward(PRIOR_REVIEWS)
    usual_new = every_new.toward(PRIOR_NEW)
    weekdays = tuple(
        Weekday(
            study=seen[day].toward(1.0, PRIOR_WEIGHT / WEEK),
            reviews=reviews[day].toward(usual_reviews),
            new=new[day].toward(usual_new),
        )
        for day in range(WEEK)
    )
    count = max(1, round(WEEK * every_seen.toward(1.0)))
    ranked = sorted(range(WEEK), key=lambda day: (-weekdays[day].study, day))
    return Capacity(weekdays, frozenset(ranked[:count]), float(every_reviews.days))


def of(records: Iterable[dict[str, Any]], today: date) -> Capacity:
    return estimate(activity(records), today)
