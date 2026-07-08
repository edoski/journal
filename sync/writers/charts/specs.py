"""Typed chart specifications for the unified chart renderer."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Sequence


class HAnchor(str, Enum):
    """Horizontal text anchoring mode."""

    START = "start"
    CENTER = "center"
    END = "end"


class AnchorRef(str, Enum):
    """Reference geometry for anchored placement."""

    COLUMN = "column"
    BAR = "bar"
    LABEL = "label"


@dataclass(frozen=True)
class GlyphSet:
    """Symbols used by a chart family."""

    axis_left: str = "└"
    axis_fill: str = "─"
    y_axis: str = "│"
    bar_fill: str = "█"
    bar_half: str = "▄"
    progress_fill: str = "■"
    progress_empty: str = "·"


@dataclass(frozen=True)
class ColumnTrack:
    """Horizontal track geometry for column-oriented charts."""

    column_width: int
    bar_width: int
    bar_left_gutter: int
    x_label_prefix: str
    delta_label_prefix: str
    axis_trim: int = 2


@dataclass(frozen=True)
class SegmentTrack:
    """Segmented row geometry for grouped grid layouts."""

    row_prefix: str = "│ "
    segment_gap: str = "   "
    token_sep: str = " "


@dataclass(frozen=True)
class VerticalBarProfile:
    """Rendering policy for vertical-bar charts."""

    height: int
    y_max: float
    track: ColumnTrack
    glyphs: GlyphSet = field(default_factory=GlyphSet)
    value_anchor_ref: AnchorRef = AnchorRef.COLUMN
    value_anchor_h: HAnchor = HAnchor.CENTER
    x_label_anchor_h: HAnchor = HAnchor.START
    delta_anchor_ref: AnchorRef = AnchorRef.LABEL
    delta_anchor_h: HAnchor = HAnchor.CENTER


@dataclass(frozen=True)
class GroupedGridProfile:
    """Rendering policy for grouped symbol-grid charts."""

    track: SegmentTrack = field(default_factory=SegmentTrack)


@dataclass(frozen=True)
class ProgressRowsProfile:
    """Rendering policy for label+bar+count row charts."""

    row_prefix: str = "│ "
    header_prefix: str = "┌ "
    spacer_line: str = "│"
    footer_line: str = "└"


@dataclass(frozen=True)
class TrainingSection:
    """One titled section for multi-block training charts."""

    title: str
    total_done: int
    total_elapsed: int
    labels: Sequence[str]
    counts: Sequence[tuple[int, int]]
    delta_labels: Sequence[str] | None = None
    bars_override: Sequence[str] | None = None
    bar_width: int = 30
    fill_char: str = "■"
    empty_char: str = "·"


@dataclass(frozen=True)
class TrainingCalendarMonth:
    """One month row for a calendar-density training chart."""

    label: str
    symbols: str
    done: int
    elapsed: int


@dataclass(frozen=True)
class TrainingCalendarQuarter:
    """One quarter group for a calendar-density training chart."""

    label: str
    done: int
    elapsed: int
    months: Sequence[TrainingCalendarMonth]
    delta_label: str = ""


@dataclass(frozen=True)
class TrainingCalendarColumn:
    """One activity column for a calendar-density training chart."""

    title: str
    total_done: int
    total_elapsed: int
    quarters: Sequence[TrainingCalendarQuarter]


@dataclass(frozen=True)
class VerticalBarSpec:
    """Spec for a vertical bar chart."""

    labels: Sequence[str]
    values: Sequence[float | None]
    value_labels: Sequence[str]
    profile: VerticalBarProfile
    delta_labels: Sequence[str] | None = None


@dataclass(frozen=True)
class MonthlyTrainingGridSpec:
    """Spec for monthly training grouped grid chart."""

    week_labels: Sequence[str]
    week_day_counts: Sequence[int]
    workout_symbols: Sequence[str]
    stretch_symbols: Sequence[str]
    profile: GroupedGridProfile = field(default_factory=GroupedGridProfile)
    current_week_index: int | None = None
    current_day_index: int | None = None
    workout_delta_labels: Sequence[str] | None = None
    stretch_delta_labels: Sequence[str] | None = None
    legend_line: str | None = None


@dataclass(frozen=True)
class WeeklyTrainingGridSpec:
    """Spec for weekly training grouped grid chart."""

    workout_symbols: Sequence[str]
    stretch_symbols: Sequence[str]
    workout_count: int
    stretch_count: int
    profile: GroupedGridProfile = field(default_factory=GroupedGridProfile)
    current_index: int | None = None


@dataclass(frozen=True)
class TrainingBlockRowsSpec:
    """Spec for label+bar+count rows without section framing."""

    labels: Sequence[str]
    counts: Sequence[tuple[int, int]]
    delta_labels: Sequence[str] | None = None
    bar_width: int = 30
    bars_override: Sequence[str] | None = None
    fill_char: str = "■"
    empty_char: str = "·"
    profile: ProgressRowsProfile = field(default_factory=ProgressRowsProfile)


@dataclass(frozen=True)
class TrainingSectionsRowsSpec:
    """Spec for multiple titled training row sections."""

    sections: Sequence[TrainingSection]
    profile: ProgressRowsProfile = field(default_factory=ProgressRowsProfile)


@dataclass(frozen=True)
class TrainingCalendarColumnsSpec:
    """Spec for side-by-side calendar-density training columns."""

    columns: Sequence[TrainingCalendarColumn]
    month_width: int = 31
    column_gap: str = "    "
    rule_char: str = "─"


ChartSpec = (
    VerticalBarSpec
    | MonthlyTrainingGridSpec
    | WeeklyTrainingGridSpec
    | TrainingBlockRowsSpec
    | TrainingSectionsRowsSpec
    | TrainingCalendarColumnsSpec
)
