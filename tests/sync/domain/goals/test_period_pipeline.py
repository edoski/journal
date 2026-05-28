"""Tests for shared period goal orchestration helpers."""

from __future__ import annotations

import datetime
from contextlib import contextmanager

from sync.goals.period_pipeline import (
    PiercingSource,
    PiercingSyncConfig,
    sync_pierced_sources,
)


class _StubReconcileCacheStore:
    @contextmanager
    def locked_state(self):
        payload = {"goals": {}}
        yield payload


def test_sync_pierced_sources_renders_empty_placeholder() -> None:
    result = sync_pierced_sources(
        existing_tasks=[],
        sources=[PiercingSource("QUARTERLY", "quarterly.md", [])],
        config=PiercingSyncConfig(
            source_section="MONTHLY",
            note_path="monthly.md",
            proximity_days=90,
        ),
        today=datetime.date(2026, 2, 1),
        reconcile_cache_store=_StubReconcileCacheStore(),
    )

    assert result.source_lines == ["", "_No monthly goals have been defined yet._"]
