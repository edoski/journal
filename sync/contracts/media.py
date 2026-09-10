"""Typed contracts for media scanning."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class Book:
    """A parsed book note."""

    title: str
    author: str
    completed: datetime.date


@dataclass(frozen=True)
class Podcast:
    """A parsed podcast note."""

    title: str
    host: str
    date: datetime.date
    link: str | None
    visible: bool


@dataclass(frozen=True)
class MediaItem:
    """One period-ready media row."""

    kind: Literal["BOOK", "PODCAST"]
    author: str
    title: str
    date: datetime.date


@dataclass(frozen=True)
class SeriesIndex:
    """The hand-edited frontmatter of a podcast series' index note."""

    visible: bool
    host: str


@dataclass(frozen=True)
class BookAnnotation:
    """A parsed Kindle annotation tied to a page or location."""

    locator_kind: Literal["page", "loc"]
    locator: str
    quote: str
    work_title: str | None = None


@dataclass(frozen=True)
class KindleNotebookExport:
    """Annotations extracted from a Kindle Notebook HTML export."""

    book_title: str
    author: str
    annotations: list[BookAnnotation]


@dataclass(frozen=True)
class MediaBundle:
    """Media items discovered for a date window."""

    items: tuple[MediaItem, ...]
