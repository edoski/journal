"""Parse Kindle Notebook HTML exports into typed annotations."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Literal

from sync.contracts.media import BookAnnotation, KindleNotebookExport

_PAGE_RE = re.compile(r"\bPage\s+([0-9][0-9,]*)\b", flags=re.IGNORECASE)
_LOCATION_RE = re.compile(
    r"\b(?:Location|Loc\.?)\s+([0-9][0-9,]*)\b",
    flags=re.IGNORECASE,
)
_WORK_TITLE_RE = re.compile(
    r"-\s*(.*?)\s*>\s*(?:Page|Location|Loc\.?)\b",
    flags=re.IGNORECASE,
)
_TRACKED_DIV_CLASSES = frozenset({"authors", "bookTitle", "noteHeading", "noteText"})
_TRACKED_DIV_ORDER = ("bookTitle", "authors", "noteHeading", "noteText")


def _normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def _extract_locator(heading: str) -> tuple[Literal["page", "loc"], str] | None:
    page_match = _PAGE_RE.search(heading)
    if page_match is not None:
        return "page", page_match.group(1).replace(",", "")

    loc_match = _LOCATION_RE.search(heading)
    if loc_match is not None:
        return "loc", loc_match.group(1).replace(",", "")

    return None


def _extract_work_title(heading: str) -> str | None:
    match = _WORK_TITLE_RE.search(heading)
    if match is None:
        return None
    value = _normalize_whitespace(match.group(1))
    return value or None


class _KindleNotebookHtmlParser(HTMLParser):
    """Collect Kindle note headings/text while preserving source order."""

    def __init__(self) -> None:
        super().__init__()
        self.book_title: str = ""
        self.author: str = ""
        self.heading_text_pairs: list[tuple[str, str]] = []
        self._last_heading: str | None = None
        self._capture_target: str | None = None
        self._capture_depth = 0
        self._capture_chunks: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if self._capture_target is not None:
            self._capture_depth += 1
            return

        if tag.lower() != "div":
            return

        attrs_dict = {name: value for name, value in attrs}
        class_raw = attrs_dict.get("class") or ""
        class_tokens = set(class_raw.split())
        if not _TRACKED_DIV_CLASSES.intersection(class_tokens):
            return

        target = next(
            (name for name in _TRACKED_DIV_ORDER if name in class_tokens),
            None,
        )
        if target is None:
            return

        self._capture_target = target
        self._capture_depth = 1
        self._capture_chunks = []

    def handle_endtag(self, _tag: str) -> None:
        if self._capture_target is None:
            return

        self._capture_depth -= 1
        if self._capture_depth > 0:
            return

        target = self._capture_target
        captured = _normalize_whitespace("".join(self._capture_chunks))

        if target == "bookTitle":
            if captured:
                self.book_title = captured
        elif target == "authors":
            if captured:
                self.author = captured
        elif target == "noteHeading":
            self._last_heading = captured or None
        elif target == "noteText":
            if captured and self._last_heading:
                self.heading_text_pairs.append((self._last_heading, captured))

        self._capture_target = None
        self._capture_depth = 0
        self._capture_chunks = []

    def handle_data(self, data: str) -> None:
        if self._capture_target is None:
            return
        self._capture_chunks.append(data)


def parse_kindle_notebook_html(html: str) -> KindleNotebookExport:
    """Parse Kindle Notebook HTML into page/location keyed quote rows."""
    parser = _KindleNotebookHtmlParser()
    parser.feed(html)
    parser.close()

    annotations: list[BookAnnotation] = []
    for heading, quote in parser.heading_text_pairs:
        locator = _extract_locator(heading)
        if locator is None:
            continue
        locator_kind, locator_value = locator
        annotations.append(
            BookAnnotation(
                locator_kind=locator_kind,
                locator=locator_value,
                quote=quote,
                work_title=_extract_work_title(heading),
            )
        )

    return KindleNotebookExport(
        book_title=parser.book_title,
        author=parser.author,
        annotations=annotations,
    )
