"""Unified markdown table specs and renderer API."""

from __future__ import annotations

from .api import render_table
from .specs import (
    DailyProcrastinationTableSpec,
    ScreenTrendMode,
    ScreenTrendTableSpec,
    SimpleGridTableSpec,
    SummaryMetricsTableSpec,
    TableSpec,
)

__all__ = [
    "render_table",
    "TableSpec",
    "SimpleGridTableSpec",
    "SummaryMetricsTableSpec",
    "ScreenTrendMode",
    "ScreenTrendTableSpec",
    "DailyProcrastinationTableSpec",
]
