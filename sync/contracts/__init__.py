"""Domain contracts shared between ports, adapters, and application services."""

from .targets import (
    PeriodType,
    SummaryTargets,
    TrainingTargetBucket,
    TrainingTargets,
)

__all__ = [
    "PeriodType",
    "SummaryTargets",
    "TrainingTargetBucket",
    "TrainingTargets",
]
