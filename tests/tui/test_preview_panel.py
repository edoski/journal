from __future__ import annotations

import curses

from tui.views import preview


class _FakeWindow:
    def __init__(self, height: int, width: int) -> None:
        self.height = height
        self.width = width
        self.calls: list[tuple[int, int, str, int]] = []

    def getmaxyx(self) -> tuple[int, int]:
        return self.height, self.width

    def addstr(self, row: int, col: int, text: str, attr: int = 0) -> None:
        if row < 0 or row >= self.height:
            raise curses.error("row out of bounds")
        if col < 0 or col >= self.width:
            raise curses.error("col out of bounds")
        if len(text) > (self.width - col):
            raise curses.error("text overflow")
        self.calls.append((row, col, text, attr))


def test_build_unified_diff_contains_headers_and_plus_minus_lines():
    diff = preview.build_unified_diff(
        ["line-a", "line-b"],
        ["line-a", "line-c"],
        "before.md",
        "after.md",
    )
    assert diff[0].startswith("--- before.md")
    assert diff[1].startswith("+++ after.md")
    assert any(line.startswith("-line-b") for line in diff)
    assert any(line.startswith("+line-c") for line in diff)


def test_fit_lines_truncates_to_panel_bounds():
    fitted = preview.fit_lines(
        ["0123456789", "abcdefghij", "tail"],
        max_rows=2,
        max_cols=6,
    )
    assert len(fitted) == 2
    assert fitted[0] == "012..."
    assert fitted[1].endswith("...")


def test_draw_lines_is_safe_for_small_window_bounds():
    fake = _FakeWindow(height=3, width=10)
    preview.draw_lines(
        fake,  # type: ignore[arg-type]
        start_row=0,
        start_col=0,
        width=20,
        height=5,
        lines=["x" * 40, "y" * 40, "z" * 40, "ignored"],
    )

    assert len(fake.calls) == 3
    assert all(len(call[2]) <= 9 for call in fake.calls)


def test_compute_editor_layout_uses_split_only_when_wide_enough():
    wide = preview.compute_editor_layout(140)
    narrow = preview.compute_editor_layout(70)
    assert wide.split is True
    assert narrow.split is False
