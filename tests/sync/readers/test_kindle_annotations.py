from __future__ import annotations

from sync.readers.kindle_annotations import parse_kindle_notebook_html


def _wrap_body(*chunks: str) -> str:
    body = "".join(chunks)
    return f"<html><body>{body}</body></html>"


def test_parse_prefers_page_over_location() -> None:
    html = _wrap_body(
        '<div class="bookTitle">Memories Dreams Reflections</div>',
        '<div class="noteHeading">Highlight - Page 293 · Location 3835</div>',
        '<div class="noteText">A quote</div>',
    )

    export = parse_kindle_notebook_html(html)

    assert export.book_title == "Memories Dreams Reflections"
    assert len(export.annotations) == 1
    row = export.annotations[0]
    assert row.locator_kind == "page"
    assert row.locator == "293"
    assert row.quote == "A quote"


def test_parse_falls_back_to_location_when_page_is_missing() -> None:
    html = _wrap_body(
        '<div class="noteHeading">Highlight - Location 778</div>',
        '<div class="noteText">Fallback quote</div>',
    )

    export = parse_kindle_notebook_html(html)

    assert len(export.annotations) == 1
    row = export.annotations[0]
    assert row.locator_kind == "loc"
    assert row.locator == "778"
    assert row.quote == "Fallback quote"


def test_parse_skips_bookmark_rows_without_quote_text() -> None:
    html = _wrap_body(
        '<div class="noteHeading">Bookmark - Page 226 · Location 2959</div>',
        '<div class="noteHeading">Highlight - Page 227 · Location 2965</div>',
        '<div class="noteText">Keep this quote</div>',
    )

    export = parse_kindle_notebook_html(html)

    assert len(export.annotations) == 1
    assert export.annotations[0].locator == "227"
    assert export.annotations[0].quote == "Keep this quote"


def test_parse_handles_nested_heading_fragments() -> None:
    html = _wrap_body(
        '<div class="noteHeading">',
        'Highlight(<span class="highlight_yellow">yellow</span>) - ',
        "II. AMERICA > Page 306 · Location 4026",
        "</div>",
        '<div class="noteText">',
        "Out of sheer envy we are obliged to smile.",
        "</div>",
    )

    export = parse_kindle_notebook_html(html)

    assert len(export.annotations) == 1
    assert export.annotations[0].locator_kind == "page"
    assert export.annotations[0].locator == "306"


def test_parse_preserves_deterministic_source_order() -> None:
    html = _wrap_body(
        '<div class="noteHeading">Highlight - Page 19 · Location 214</div>',
        '<div class="noteText">First</div>',
        '<div class="noteHeading">Highlight - Location 900</div>',
        '<div class="noteText">Second</div>',
        '<div class="noteHeading">Highlight - Page 62 · Location 778</div>',
        '<div class="noteText">Third</div>',
    )

    export = parse_kindle_notebook_html(html)

    ordered = [
        (item.locator_kind, item.locator, item.quote) for item in export.annotations
    ]
    assert ordered == [
        ("page", "19", "First"),
        ("loc", "900", "Second"),
        ("page", "62", "Third"),
    ]
