"""Unified markdown table specs and renderer API."""

from __future__ import annotations

from .api import render_table
from .specs import (
    DailyProcrastinationTableSpec,
    ScreenTrendMode,
    ScreenTrendTableSpec,
    SimpleGridTableSpec,
    SummaryMetricsTableSpec,
    TableKind,
    TableSpec,
)

__all__ = [
    "render_table",
    "TableKind",
    "TableSpec",
    "SimpleGridTableSpec",
    "SummaryMetricsTableSpec",
    "ScreenTrendMode",
    "ScreenTrendTableSpec",
    "DailyProcrastinationTableSpec",
]
