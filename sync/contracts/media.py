"""Typed contracts for media scanning."""

from __future__ import annotations

import datetime
from dataclasses import dataclass


@dataclass(frozen=True)
class Book:
    """A completed book from the books directory."""

    title: str
    author: str
    started: datetime.date | None
    completed: datetime.date
    rating: float | None


@dataclass(frozen=True)
class Podcast:
    """A listened podcast from the podcasts directory."""

    title: str
    host: str
    date: datetime.date
    rating: float | None
    link: str | None


@dataclass(frozen=True)
class MediaBundle:
    """Media items discovered for a date window."""

    books: list[Book]
    podcasts: list[Podcast]
