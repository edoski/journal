"""Domain contracts shared between ports, adapters, and application services."""

from .deviation import DailyDeviationData
from .goals import Goal, GoalSection
from .grades import (
    GradeEntry,
    GradesComputation,
    GradesDocument,
    OverallInput,
    YearGradeStats,
    YearGradeTable,
)
from .media import Book, MediaBundle, Podcast
from .reminders import (
    DailySchedule,
    MonthlyLastDaySchedule,
    ReminderRule,
    ReminderSchedule,
    Weekday as ReminderWeekday,
    WeeklyEvenSchedule,
    WeeklyOddSchedule,
    WeeklySchedule,
    YearlySchedule,
    format_schedule,
    parse_schedule,
)
from .targets import (
    PeriodType,
    SummaryTargets,
    TrainingTargetBucket,
    TrainingTargets,
)
from .schedule import DayScheduleProfile, Weekday
from .screen_time import DailyScreenTimeData, ScreenTimeEntry
from .sleep import DailySleepData, SleepEntry
from .status import (
    ActivityPayload,
    SleepPayload,
    StatusIngestionIssue,
    TrainingEntryPayload,
    TrainingStatus,
)
from .study import DailyStudyData, StudySession, StudySessionRecord
from .training import DailyTrainingData, TrainingEntry

__all__ = [
    "Goal",
    "GoalSection",
    "GradeEntry",
    "YearGradeTable",
    "OverallInput",
    "GradesDocument",
    "YearGradeStats",
    "GradesComputation",
    "ReminderRule",
    "ReminderSchedule",
    "DailySchedule",
    "WeeklySchedule",
    "WeeklyOddSchedule",
    "WeeklyEvenSchedule",
    "MonthlyLastDaySchedule",
    "YearlySchedule",
    "ReminderWeekday",
    "parse_schedule",
    "format_schedule",
    "Book",
    "Podcast",
    "MediaBundle",
    "DailyDeviationData",
    "SleepPayload",
    "TrainingEntryPayload",
    "TrainingStatus",
    "ActivityPayload",
    "StatusIngestionIssue",
    "ScreenTimeEntry",
    "DailyScreenTimeData",
    "SleepEntry",
    "DailySleepData",
    "TrainingEntry",
    "DailyTrainingData",
    "StudySession",
    "DailyStudyData",
    "StudySessionRecord",
    "PeriodType",
    "SummaryTargets",
    "TrainingTargetBucket",
    "TrainingTargets",
    "DayScheduleProfile",
    "Weekday",
]
