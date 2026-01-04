"""
Dataclass models for the journal sync system.

This package provides typed domain objects for study sessions, sleep entries,
training entries, goals, media, and aggregated metrics.
"""

from __future__ import annotations

from .study import StudySession, DailyStudyData
from .sleep import SleepEntry, DailySleepData
from .training import TrainingEntry, DailyTrainingData
from .screen_time import ScreenTimeEntry, DailyScreenTimeData
from .daily import DailyData
from .period import PeriodMetrics
from .goals import Goal
from .media import Book, Podcast

__all__ = [
    # Study
    "StudySession",
    "DailyStudyData",
    # Sleep
    "SleepEntry",
    "DailySleepData",
    # Training
    "TrainingEntry",
    "DailyTrainingData",
    # Screen time
    "ScreenTimeEntry",
    "DailyScreenTimeData",
    # Daily aggregate
    "DailyData",
    # Period metrics
    "PeriodMetrics",
    # Goals
    "Goal",
    # Media
    "Book",
    "Podcast",
]
