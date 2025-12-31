"""
Journal sync utilities.

This package provides utility functions for the journal synchronization system,
organized into focused sub-modules. All exports are re-exported here for
backward compatibility with existing imports.
"""
from __future__ import annotations

# Constants
from .constants import (
    JOURNAL_DIR,
    VAULT_DIR,
    BOOKS_DIR,
    PODCASTS_DIR,
    WEEKLY_TEMPLATE_PATH,
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
    YEARLY_TEMPLATE_PATH,
    DEFAULT_WEEKLY_DIR,
    DEFAULT_MONTHLY_DIR,
    DEFAULT_QUARTERLY_DIR,
    DEFAULT_YEARLY_DIR,
    LOCK_DIR,
    CARRIED_GOALS_PATH,
    DAYS,
    MONTH_ABBR,
    STUDY_TARGET_MIN,
    STUDY_SYMBOL_DEEP,
    STUDY_SYMBOL_NONE,
    STUDY_LEGEND_LINE,
    YEARLY_STUDY_LEGEND_LINE,
    CHART_HEIGHT_DEFAULT,
    CHART_HEIGHT_QUARTERLY,
    CHART_HEIGHT_YEARLY,
    CHART_Y_MAX_WEEKLY_STUDY,
    CHART_Y_MAX_MONTHLY_STUDY,
    CHART_Y_MAX_QUARTERLY_STUDY,
    CHART_Y_MAX_YEARLY_STUDY,
)

# Date utilities
from .dates import (
    daterange,
    iso_week_range,
    month_range,
    quarter_range,
    quarter_months,
    quarter_of_date,
    year_range,
    year_quarters,
    month_week_ranges,
    format_week_label,
    quarter_id,
)

# Parsing utilities
from .parsing import (
    parse_frontmatter,
    parse_duration_to_minutes,
    format_minutes,
    format_minutes_seconds,
    ceil_minutes,
    round_half_up,
    parse_bool,
    compute_percent_change,
    format_percent_change,
    format_training_ratio,
    format_mood_with_scale,
    format_ma_training_ratio,
)

# Goal utilities
from .goals import (
    canonical_goal,
    parse_goal_tasks,
    render_goal_lines,
    find_subheader_idx,
    build_goals_block,
    generate_goal_id,
    generate_goal_id_for,
    extract_goal_id,
    ensure_goal_ids,
    filter_by_proximity,
)

# Metrics utilities
from .metrics import (
    load_daily_data,
    compute_period_metrics,
    compute_moving_average,
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
    compute_period_deltas,
)

# Chart/rendering utilities
from .charts import (
    wrap_code_block,
    render_sleep_stats_table,
    render_activity_table,
    render_interrupts_table,
    render_summary_table,
    render_bar_chart,
    render_training_quarter_block,
    render_training_frequency_grid,
    render_weekly_training_grid,
    study_intensity_symbol,
    render_weekly_study_grid,
    render_monthly_study_grid,
    _compress_symbols,
    _compress_days_time_order,
    compress_activity_time_order,
    render_quarterly_study_coverage,
    render_yearly_study_coverage,
)

# Note I/O utilities
from .notes import (
    locked_note,
    find_header_idx,
    section_bounds,
    subsection_bounds,
    extract_block,
    ensure_section_with_divider,
    goals_section_bounds,
    extract_subsection_tasks,
    trim_blank_lines,
    join_sections,
    parse_study_table,
    parse_sleep_table,
    parse_daily_note,
    ensure_note,
    replace_metrics_block,
)

# For backward compatibility with code that uses _normalize_header
from .goals import _normalize_header

# Media utilities
from .media import (
    scan_books,
    scan_podcasts,
    render_media_table,
    build_media_section,
)

__all__ = [
    # Constants
    "JOURNAL_DIR",
    "VAULT_DIR",
    "BOOKS_DIR",
    "PODCASTS_DIR",
    "WEEKLY_TEMPLATE_PATH",
    "MONTHLY_TEMPLATE_PATH",
    "QUARTERLY_TEMPLATE_PATH",
    "YEARLY_TEMPLATE_PATH",
    "DEFAULT_WEEKLY_DIR",
    "DEFAULT_MONTHLY_DIR",
    "DEFAULT_QUARTERLY_DIR",
    "DEFAULT_YEARLY_DIR",
    "LOCK_DIR",
    "CARRIED_GOALS_PATH",
    "DAYS",
    "MONTH_ABBR",
    "STUDY_TARGET_MIN",
    "STUDY_SYMBOL_DEEP",
    "STUDY_SYMBOL_NONE",
    "STUDY_LEGEND_LINE",
    "YEARLY_STUDY_LEGEND_LINE",
    "CHART_HEIGHT_DEFAULT",
    "CHART_HEIGHT_QUARTERLY",
    "CHART_HEIGHT_YEARLY",
    "CHART_Y_MAX_WEEKLY_STUDY",
    "CHART_Y_MAX_MONTHLY_STUDY",
    "CHART_Y_MAX_QUARTERLY_STUDY",
    "CHART_Y_MAX_YEARLY_STUDY",
    # Dates
    "daterange",
    "iso_week_range",
    "month_range",
    "quarter_range",
    "quarter_months",
    "quarter_of_date",
    "year_range",
    "year_quarters",
    "month_week_ranges",
    "format_week_label",
    "quarter_id",
    # Parsing
    "parse_frontmatter",
    "parse_duration_to_minutes",
    "format_minutes",
    "format_minutes_seconds",
    "ceil_minutes",
    "round_half_up",
    "parse_bool",
    "compute_percent_change",
    "format_percent_change",
    "format_training_ratio",
    "format_mood_with_scale",
    "format_ma_training_ratio",
    # Goals
    "canonical_goal",
    "parse_goal_tasks",
    "render_goal_lines",
    "find_subheader_idx",
    "build_goals_block",
    "generate_goal_id",
    "generate_goal_id_for",
    "extract_goal_id",
    "ensure_goal_ids",
    "filter_by_proximity",
    # Metrics
    "load_daily_data",
    "compute_period_metrics",
    "compute_moving_average",
    "aggregate_activity_totals",
    "aggregate_interrupt_overrun",
    "compute_period_deltas",
    # Charts
    "wrap_code_block",
    "render_sleep_stats_table",
    "render_activity_table",
    "render_interrupts_table",
    "render_summary_table",
    "render_bar_chart",
    "render_training_quarter_block",
    "render_training_frequency_grid",
    "render_weekly_training_grid",
    "study_intensity_symbol",
    "render_weekly_study_grid",
    "render_monthly_study_grid",
    "_compress_symbols",
    "_compress_days_time_order",
    "compress_activity_time_order",
    "render_quarterly_study_coverage",
    "render_yearly_study_coverage",
    # Notes
    "locked_note",
    "find_header_idx",
    "section_bounds",
    "subsection_bounds",
    "extract_block",
    "ensure_section_with_divider",
    "goals_section_bounds",
    "extract_subsection_tasks",
    "trim_blank_lines",
    "join_sections",
    "parse_study_table",
    "parse_sleep_table",
    "parse_daily_note",
    "ensure_note",
    "replace_metrics_block",
    "_normalize_header",
    # Media
    "scan_books",
    "scan_podcasts",
    "render_media_table",
    "build_media_section",
]
