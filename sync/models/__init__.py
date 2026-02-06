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
from .deviation import DailyDeviationData
from .daily import DailyData
from .period import PeriodMetrics
from .goals import Goal
from .media import Book, Podcast
from .reminders import ReminderRule, ScheduleKind

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
    # Deviation
    "DailyDeviationData",
    # Daily aggregate
    "DailyData",
    # Period metrics
    "PeriodMetrics",
    # Goals
    "Goal",
    # Reminder rules
    "ReminderRule",
    "ScheduleKind",
    # Media
    "Book",
    "Podcast",
]
