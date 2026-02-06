#!/usr/bin/env python3
"""Quarterly sync composition root."""

from __future__ import annotations

import argparse
import datetime

from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.period_sync_service import PeriodSyncService
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import build_quarter_window
from sync.dates import quarter_of_date


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate quarterly metrics from daily notes."
    )
    parser.add_argument("--file", help="Path to quarterly note")
    parser.add_argument("--quarter", help="Quarter (YYYY-Qn, e.g., 2025-Q4)")
    args = parser.parse_args()

    if args.quarter:
        parts = args.quarter.upper().split("-Q")
        if len(parts) != 2:
            raise ValueError("Quarter must be in format YYYY-Qn")
        year = int(parts[0])
        quarter_num = int(parts[1])
    else:
        today = datetime.date.today()
        year, quarter_num = quarter_of_date(today)

    window = build_quarter_window(year, quarter_num)
    note_path = resolve_note_path(window.filename, args.file)

    service = PeriodSyncService(
        note_store=MarkdownNoteStore(),
        aggregate_source=MarkdownDailyAggregateSource(),
        goal_store=MarkdownGoalStore(),
    )
    service.sync_quarter(window, note_path)


if __name__ == "__main__":
    main()
