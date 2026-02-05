"""
Writer modules for the journal sync system.

This package provides rendering functions that convert typed dataclass models
into markdown content.
"""

from __future__ import annotations

from .tables import (
    render_sleep_stats_table,
    render_activity_table,
    render_interrupts_table,
    render_summary_table,
)
from .goals import (
    render_goal_lines,
    build_goals_block,
    format_countdown,
)
from .media import (
    render_media_table,
)

__all__ = [
    # Tables
    "render_sleep_stats_table",
    "render_activity_table",
    "render_interrupts_table",
    "render_summary_table",
    # Goals
    "render_goal_lines",
    "build_goals_block",
    "format_countdown",
    # Media
    "render_media_table",
]
