"""Typed wire contracts for daily external status payloads."""

from __future__ import annotations

from typing import TypedDict


class RawTrainingEntry(TypedDict, total=False):
    """Training entry payload produced by iCloud shortcuts."""

    date: str
    start: str
    end: str
    duration: float
    type: str


class RawSleepPayload(TypedDict):
    """Sleep payload produced by iCloud shortcuts."""

    date: str
    start: str
    end: str
    sleep_min: float
    awake_min: float
    awake_count: int


class RawActivityPayload(TypedDict, total=False):
    """Screen-time payload produced by iCloud shortcuts."""

    date: str
    activity_ipad: str
    activity_iphone: str
