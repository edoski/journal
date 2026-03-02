"""Typed contracts for media scanning."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Literal


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
class BookAnnotation:
    """A parsed Kindle annotation tied to a page or location."""

    locator_kind: Literal["page", "loc"]
    locator: str
    quote: str


@dataclass(frozen=True)
class KindleNotebookExport:
    """Annotations extracted from a Kindle Notebook HTML export."""

    book_title: str
    annotations: list[BookAnnotation]


@dataclass(frozen=True)
class MediaBundle:
    """Media items discovered for a date window."""

    books: list[Book]
    podcasts: list[Podcast]
