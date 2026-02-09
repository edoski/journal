"""Canonical runtime models for shortcut status payloads."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CanonicalSleepPayload:
    """Validated sleep payload used by daily sync internals."""

    date: str
    start: str
    end: str
    sleep_min: float
    awake_min: float
    awake_count: int


@dataclass(frozen=True)
class CanonicalTrainingEntry:
    """Validated training entry used by daily sync internals."""

    date: str
    start: str
    end: str
    duration: float
    type: str


@dataclass(frozen=True)
class CanonicalTrainingStatus:
    """Normalized training payload set keyed by source file."""

    workout_entries: tuple[CanonicalTrainingEntry, ...] = ()
    stretch_entries: tuple[CanonicalTrainingEntry, ...] = ()
    meditation_entries: tuple[CanonicalTrainingEntry, ...] = ()

    @property
    def workout_done(self) -> bool:
        return bool(self.workout_entries)

    @property
    def stretch_done(self) -> bool:
        return bool(self.stretch_entries)

    @property
    def meditate_done(self) -> bool:
        return bool(self.meditation_entries)


@dataclass(frozen=True)
class CanonicalActivityPayload:
    """Validated screen-time payload used by daily sync internals."""

    date: str
    activity_ipad: str
    activity_iphone: str


@dataclass(frozen=True)
class StatusIngestionIssue:
    """Structured status ingestion issue for diagnostics."""

    source: str
    message: str
    level: str = "error"
