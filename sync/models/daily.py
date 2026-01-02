"""
Daily data aggregate model for the journal sync system.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from .study import DailyStudyData
from .sleep import DailySleepData
from .training import DailyTrainingData


@dataclass
class DailyData:
    """Aggregate of all data from a single daily note."""

    date: datetime.date
    study: DailyStudyData
    sleep: DailySleepData
    training: DailyTrainingData
    mood: float | None
    workout: bool
    stretch: bool
