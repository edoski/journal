"""Shared draw and formatting helpers for the curses TUI."""

from __future__ import annotations

import curses
import difflib

from tui.layout import Rect


def clip_text(text: str, width: int) -> str:
    """Clip text to width with ellipsis when needed."""
    if width <= 0:
        return ""
    if len(text) <= width:
        return text
    if width <= 3:
        return text[:width]
    return f"{text[: width - 3]}..."


def safe_addstr(
    stdscr: curses.window,
    y: int,
    x: int,
    text: str,
    attr: int = curses.A_NORMAL,
) -> None:
    """Write bounded text and ignore curses bounds errors."""
    max_y, max_x = stdscr.getmaxyx()
    if y < 0 or y >= max_y or x < 0 or x >= max_x:
        return
    available = max_x - x
    if available <= 0:
        return
    out = clip_text(text, available)
    if not out:
        return
    try:
        stdscr.addstr(y, x, out, attr)
    except curses.error:
        return


def draw_lines(
    stdscr: curses.window,
    rect: Rect,
    lines: list[str],
    attr: int = curses.A_NORMAL,
) -> None:
    """Draw clipped lines into a region."""
    for idx, line in enumerate(lines[: max(0, rect.h)]):
        safe_addstr(stdscr, rect.y + idx, rect.x, clip_text(line, rect.w), attr)


def draw_box(
    stdscr: curses.window,
    rect: Rect,
    *,
    title: str = "",
    border_attr: int = curses.A_NORMAL,
    title_attr: int = curses.A_BOLD,
) -> None:
    """Draw an ASCII border with optional title."""
    if rect.h < 2 or rect.w < 2:
        return

    top = "+" + "-" * max(0, rect.w - 2) + "+"
    bottom = top
    safe_addstr(stdscr, rect.y, rect.x, top, border_attr)
    for row in range(1, rect.h - 1):
        safe_addstr(
            stdscr, rect.y + row, rect.x, "|" + " " * (rect.w - 2) + "|", border_attr
        )
    safe_addstr(stdscr, rect.y + rect.h - 1, rect.x, bottom, border_attr)

    if title and rect.w > 4:
        label = f" {title} "
        safe_addstr(
            stdscr, rect.y, rect.x + 2, clip_text(label, rect.w - 4), title_attr
        )


def build_unified_diff(
    before_lines: list[str],
    after_lines: list[str],
    from_label: str,
    to_label: str,
) -> list[str]:
    """Build unified diff lines for preview panels."""
    diff = list(
        difflib.unified_diff(
            before_lines,
            after_lines,
            fromfile=from_label,
            tofile=to_label,
            lineterm="",
        )
    )
    return diff or ["(no text changes)"]


def format_metric_value(value: float | int | None, precision: int = 0) -> str:
    """Format numeric metric values consistently for shell panels."""
    if value is None:
        return "-"
    if isinstance(value, int):
        return str(value)
    return f"{float(value):.{precision}f}"


def format_delta(delta: float | None) -> str:
    """Format delta percentages for table and card chips."""
    if delta is None:
        return "-"
    sign = "+" if delta >= 0 else ""
    return f"{sign}{delta:.0f}%"


def sparkline(values: list[float | int | None], width: int) -> str:
    """Render a compact ASCII sparkline."""
    if width <= 0:
        return ""
    if not values:
        return "." * width

    cleaned = [float(value) for value in values if value is not None]
    if not cleaned:
        return "." * width
    lo = min(cleaned)
    hi = max(cleaned)
    ramp = " .:-=+*#%@"
    points: list[float | None]
    if len(values) <= width:
        points = list(values)
    else:
        start = len(values) - width
        points = list(values[start:])

    out = []
    for value in points:
        if value is None:
            out.append(".")
            continue
        if hi == lo:
            out.append(ramp[len(ramp) // 2])
            continue
        ratio = (float(value) - lo) / (hi - lo)
        idx = max(0, min(len(ramp) - 1, int(round(ratio * (len(ramp) - 1)))))
        out.append(ramp[idx])
    line = "".join(out)
    if len(line) < width:
        return line.rjust(width, ".")
    return line


def progress_bar(
    current: float | int | None, target: float | None, width: int = 16
) -> str:
    """Render a compact ASCII progress bar."""
    if width <= 0:
        return ""
    if current is None or target is None or target <= 0:
        return "[" + "-" * width + "]"
    ratio = max(0.0, float(current) / target)
    fill = min(width, int(round(ratio * width)))
    return "[" + ("#" * fill) + ("-" * (width - fill)) + "]"
