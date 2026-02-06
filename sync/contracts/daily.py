"""Typed contracts for daily external status payloads."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TypedDict


class TrainingStatusEntry(TypedDict, total=False):
    """Training status payload produced by iCloud shortcuts."""

    date: str
    start: str
    end: str
    duration: float
    type: str


class SleepStatusPayload(TypedDict, total=False):
    """Sleep status payload produced by iCloud shortcuts."""

    date: str
    start: str
    end: str
    sleep_min: float
    awake_min: float
    awake_count: int
    SleepBegin: str
    SleepStart: str
    SleepEnd: str
    SleepMinutes: float
    AwakeMinutes: float
    AwakeCount: int


@dataclass(frozen=True)
class TrainingStatusBundle:
    """Raw training payloads consumed by the daily metrics builder."""

    workout_done: bool
    stretch_done: bool
    meditate_done: bool
    workout_payload: dict | list | None
    stretch_payload: dict | list | None
    meditate_payload: dict | list | None
