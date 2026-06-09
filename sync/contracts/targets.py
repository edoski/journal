"""Typed target contracts shared across rendering, querying, and tests."""

from __future__ import annotations

from typing import Literal

PeriodType = Literal["day", "week", "month", "quarter", "year"]
TrainingTargetBucket = Literal["meditation", "workout", "stretch"]
