"""Waterfall chart renderer."""

from __future__ import annotations

from sync.formatting import format_minutes

from ..specs import WaterfallSpec


def render_waterfall(spec: WaterfallSpec) -> list[str]:
    """Render screen-time waterfall chart body."""
    app_totals = spec.app_totals
    profile = spec.profile

    if not app_totals:
        return []

    sorted_apps = sorted(app_totals.items(), key=lambda item: item[1], reverse=True)
    total_minutes = sum(app_totals.values())
    if total_minutes == 0:
        return []

    lines: list[str] = [profile.header_prefix]

    max_name_len = max(len(app) for app, _ in sorted_apps)
    max_name_len = max(max_name_len, 5)

    exact_pcts = [(minutes / total_minutes * 100) for _, minutes in sorted_apps]
    floored = [int(pct) for pct in exact_pcts]
    remainders = [(idx, pct - floored[idx]) for idx, pct in enumerate(exact_pcts)]
    remainder_needed = 100 - sum(floored)

    remainders.sort(key=lambda item: item[1], reverse=True)
    for idx in range(min(remainder_needed, len(remainders))):
        floored[remainders[idx][0]] += 1

    bar_rows: list[tuple[str, str, str, str]] = []
    offset = 0
    for idx, (app, minutes) in enumerate(sorted_apps):
        bar_len = round(minutes / total_minutes * profile.bar_width)
        bar_len = max(1, min(profile.bar_width - offset, bar_len))
        pct = floored[idx]
        bar = " " * offset + profile.fill_char * bar_len
        duration_str = format_minutes(minutes)
        pct_str = f"({pct}%)"
        bar_rows.append((app, bar, duration_str, pct_str))
        offset += bar_len

    total_width = offset
    for app, bar, duration_str, pct_str in bar_rows:
        bar_padded = bar.ljust(total_width)
        line = f"{profile.row_prefix}{app.ljust(max_name_len)} {bar_padded} {duration_str.rjust(6)} {pct_str.rjust(5)}"
        lines.append(line)

    separator = "━" * total_width
    lines.append(f"{profile.row_prefix}{' ' * max_name_len} {separator}")
    total_str = format_minutes(total_minutes)
    total_bar = profile.fill_char * total_width
    lines.append(
        f"{profile.footer_prefix}{'TOTAL'.ljust(max_name_len)} {total_bar} {total_str.rjust(6)}"
    )

    return lines
