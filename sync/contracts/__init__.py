"""Domain contracts shared between ports, adapters, and application services."""

from .study import StudySessionRecord
from .daily import TrainingStatusBundle, TrainingStatusEntry, SleepStatusPayload
from .metrics import DailyAggregate, PeriodAggregate
from .goals import GoalSection
from .media import MediaBundle
from .notes import VaultFileRecord

__all__ = [
    "StudySessionRecord",
    "TrainingStatusBundle",
    "TrainingStatusEntry",
    "SleepStatusPayload",
    "DailyAggregate",
    "PeriodAggregate",
    "GoalSection",
    "MediaBundle",
    "VaultFileRecord",
]
