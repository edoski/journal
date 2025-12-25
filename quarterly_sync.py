#!/usr/bin/env python3
import argparse
import datetime
import os

from sync_utils import (
    JOURNAL_DIR,
    QUARTERLY_TEMPLATE_PATH,
    DEFAULT_QUARTERLY_DIR,
    MONTH_ABBR,
    locked_note,
    parse_daily_note,
    daterange,
    month_range,
    quarter_range,
    quarter_months,
    quarter_of_date,
    format_minutes,
    compute_percent_change,
    format_percent_change,
    render_monthly_chart,
    wrap_code_block,
    ensure_note,
    replace_metrics_block,
    round_half_up,
    format_training_ratio,
    parse_goal_tasks,
    render_goal_lines,
    goals_section_bounds,
    extract_subsection_tasks,
    build_goals_block,
    trim_blank_lines,
    ensure_goal_ids,
    render_summary_table,
)


def quarter_id(year, quarter_num):
    return f"{year}-Q{quarter_num}"


def compute_quarter_metrics(dates, daily_data):
    """
    Compute aggregated metrics for a quarter.
    Returns a dict mirroring monthly metrics keys used in summary tables.
    """
    today = datetime.date.today()
    dates_up_to_today = [d for d in dates if d <= today]
    days_up_to_today = len(dates_up_to_today)

    study_minutes = [daily_data.get(d, {}).get("study_minutes") for d in dates]
    sleep_minutes = [daily_data.get(d, {}).get("sleep_minutes") for d in dates]
    mood_vals = [daily_data.get(d, {}).get("mood") for d in dates]

    study_total = sum((m for m in study_minutes if m is not None), 0)
    sleep_vals = [m for m in sleep_minutes if m is not None]
    sleep_avg = sum(sleep_vals) / len(sleep_vals) if sleep_vals else None
    mood_vals_clean = [m for m in mood_vals if m is not None]
    mood_avg = sum(mood_vals_clean) / len(mood_vals_clean) if mood_vals_clean else None

    workout_count = sum(1 for d in dates if daily_data.get(d, {}).get("workout"))
    stretch_count = sum(1 for d in dates if daily_data.get(d, {}).get("stretch"))

    return {
        "study_total_minutes": study_total,
        "sleep_avg_minutes": sleep_avg,
        "mood_avg": mood_avg,
        "workout_count": workout_count,
        "stretch_count": stretch_count,
        "total_days": len(dates),
        "days_up_to_today": days_up_to_today,
    }


def _ensure_quarter_task_ids(tasks, quarter_key):
    ensure_goal_ids(tasks, "quarterly", quarter_key)


def _load_daily_data(start_date, end_date):
    data = {}
    for day in daterange(start_date, end_date):
        path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
        if not os.path.exists(path):
            continue
        parsed = parse_daily_note(path)
        if parsed:
            data[day] = parsed
    return data


def render_quarterly_study_chart(labels, values, value_labels, delta_labels=None):
    """
    Quarter study chart: 3 bars, 7-char width, 8-char spacing, 4-char leading indent.
    Cap at 240h per month (y_max=240), height=12 rows.
    Value labels are left-aligned with bars.
    """
    bar_char = "█"
    height = 12
    y_max = 240
    bar_width = 7
    col_spacing = 11  # 3-letter label + 8 spaces
    left_pad = 2
    label_prefix = "     "  # 5 spaces before first label (align labels under bars)

    scale = height / y_max if y_max > 0 else 1
    bar_heights = []
    for val in values:
        if val is None or val == 0:
            bar_heights.append(0)
        else:
            bar_heights.append(min(height, max(0, round_half_up(val * scale))))

    lines = []
    has_max_value = any(bar_h == height and bar_h > 0 for bar_h in bar_heights)
    if has_max_value:
        overflow_row = label_prefix
        for bar_h, label in zip(bar_heights, value_labels):
            if bar_h == height:
                label_str = str(label).strip('`') if label else ""
                overflow_row += " " * left_pad + label_str + " " * (col_spacing - left_pad - len(label_str))
            else:
                overflow_row += " " * col_spacing
        lines.append(overflow_row.rstrip())

    for level in range(height, -1, -1):
        if level == 0:
            row = "└" + "─" * (col_spacing * len(labels) + len(label_prefix) - 6)
        else:
            row = "│"
            for bar_h, label in zip(bar_heights, value_labels):
                label_str = str(label).strip('`') if label else ""
                if bar_h == 0 and level == 1:
                    row += " " * left_pad + label_str + " " * (col_spacing - left_pad - len(label_str))
                elif bar_h == height and level <= height:
                    row += " " * left_pad + bar_char * bar_width + " " * (col_spacing - left_pad - bar_width)
                elif bar_h > 0 and bar_h < height and level == bar_h + 1:
                    row += " " * left_pad + label_str + " " * (col_spacing - left_pad - len(label_str))
                elif bar_h > 0 and level <= bar_h:
                    row += " " * left_pad + bar_char * bar_width + " " * (col_spacing - left_pad - bar_width)
                else:
                    row += " " * col_spacing
        lines.append(row.rstrip())

    label_row = label_prefix
    for label in labels:
        label_str = str(label)
        label_row += label_str + " " * (col_spacing - len(label_str))
    lines.append(label_row.rstrip())

    if delta_labels:
        delta_row = label_prefix
        for idx, delta in enumerate(delta_labels):
            delta_str = str(delta) if delta is not None else ""
            label_len = len(str(labels[idx])) if idx < len(labels) else col_spacing
            left_pad = max((label_len - len(delta_str)) // 2, 0)
            remaining = col_spacing - left_pad - len(delta_str)
            if remaining < 0:
                remaining = 0
            delta_row += " " * left_pad + delta_str + " " * remaining
        lines.append(delta_row.rstrip())
    return lines


def render_quarterly_training_bars(month_ranges, daily_data, activity_key, delta_labels):
    """
    Render per-month rows for workout/stretch with dense bars, counts, and deltas.
    Spacing mirrors the requested layout (no symbol spacing; counts aligned).
    """
    lines = []
    bars = []
    counts = []
    max_bar_len = 0
    max_count_len = 0

    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        days = list(daterange(start, end))
        total_days = len(days)
        done = sum(1 for d in days if daily_data.get(d, {}).get(activity_key))
        bar = "■" * done + "·" * (total_days - done)
        bars.append((label, bar, done, total_days))
        count_str = f"({done:02d}/{total_days})"
        counts.append(count_str)
        max_bar_len = max(max_bar_len, len(bar))
        max_count_len = max(max_count_len, len(count_str))

    for idx, ((label, bar, done, total_days), count_str) in enumerate(zip(bars, counts)):
        pad_between_bar_and_count = (max_bar_len - len(bar)) + 1  # base 1-space plus padding to align counts
        delta_str = delta_labels[idx] if delta_labels and idx < len(delta_labels) else ""
        # Right-pad delta to 4 chars for consistent column; prefix single space
        delta_formatted = delta_str.rjust(4) if delta_str else ""
        line = (
            f"│ {label} {bar}"
            f"{' ' * pad_between_bar_and_count}"
            f"{count_str.rjust(max_count_len)}"
        )
        if delta_formatted:
            line += f" {delta_formatted}"
        lines.append(line)
    return lines


def build_quarterly_metrics(quarter_start, quarter_end, month_ranges, daily_data, prev_daily_data, prev_year, prev_quarter):
    today = datetime.date.today()
    sections = []

    dates = list(daterange(quarter_start, quarter_end))
    prev_dates = list(prev_daily_data.keys())

    # Summary (Variant B)
    current_metrics = compute_quarter_metrics(dates, daily_data)
    prev_metrics = compute_quarter_metrics(prev_dates, prev_daily_data) if prev_daily_data else {
        "study_total_minutes": 0,
        "sleep_avg_minutes": None,
        "mood_avg": None,
        "workout_count": 0,
        "stretch_count": 0,
        "total_days": len(prev_dates),
        "days_up_to_today": len(prev_dates),
    }
    prev_label = f"[[{quarter_id(prev_year, prev_quarter)}\\|LAST QUARTER]]"
    summary_lines = render_summary_table(
        current_metrics,
        prev_metrics,
        "THIS QUARTER",
        prev_label,
    )
    sections.append(trim_blank_lines(summary_lines))

    # STUDY
    study_lines = ["### **STUDY**"]
    month_labels = []
    study_chart_vals = []
    study_value_labels = []
    study_totals_minutes = []
    activity_totals = {}
    interrupt_totals = []
    overrun_totals = []

    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        month_labels.append(label)
        days = list(daterange(start, end))
        total_min = 0
        for d in days:
            daily = daily_data.get(d, {})
            for activity, mins in daily.get("activity_totals", {}).items():
                activity_totals[activity] = activity_totals.get(activity, 0) + mins
                total_min += mins
            interrupt_totals.append(daily.get("interrupt_minutes", 0))
            overrun_totals.append(daily.get("overrun_minutes", 0))
        hours = total_min / 60
        study_chart_vals.append(hours)
        study_totals_minutes.append(total_min)
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(format_minutes(total_min) if total_min > 0 else "0h00m")

    study_delta_labels = []
    for idx, start in enumerate([m[0] for m in month_ranges]):
        if start > today:
            study_delta_labels.append("")
            continue
        if idx == 0:
            study_delta_labels.append("—")
            continue
        curr = study_totals_minutes[idx]
        prev = study_totals_minutes[idx - 1]
        delta = compute_percent_change(curr, prev)
        study_delta_labels.append(format_percent_change(delta))

    chart_lines = render_quarterly_study_chart(
        month_labels,
        study_chart_vals,
        study_value_labels,
        delta_labels=study_delta_labels,
    )
    study_lines.extend(wrap_code_block(chart_lines))
    study_lines.append(f"**`SUM: {format_minutes(sum(activity_totals.values()), always_show_both=True)}`**")
    study_lines.append("")

    total_activity = sum(activity_totals.values())
    study_lines.append("| ACTIVITY | TIME | SHARE |")
    study_lines.append("| -------- | ---- | ----- |")
    if activity_totals:
        for activity, mins in sorted(activity_totals.items(), key=lambda x: x[1], reverse=True):
            share = f"{int(round((mins / total_activity) * 100))}%" if total_activity else "0%"
            study_lines.append(f"| **{activity}** | `{format_minutes(mins)}` | `{share}` |")
    else:
        study_lines.append("|  |  |  |")
    study_lines.append("")

    total_interrupts = sum(interrupt_totals)
    total_overruns = sum(overrun_totals)
    days_elapsed = current_metrics.get("days_up_to_today", len(dates))
    avg_interrupts = total_interrupts / max(1, days_elapsed)
    avg_overruns = total_overruns / max(1, days_elapsed)
    study_daily_avg = (sum(activity_totals.values()) / max(1, days_elapsed))

    interrupt_pct_str = "-"
    if study_daily_avg > 0 and total_interrupts > 0:
        interrupt_pct = (total_interrupts / max(1, sum(activity_totals.values()))) * 100
        interrupt_pct_str = f"{int(round(interrupt_pct))}%"

    overrun_pct_str = "-"
    if study_daily_avg > 0 and avg_overruns > 0:
        overrun_pct = (avg_overruns / study_daily_avg) * 100
        overrun_pct_str = f"{int(round(overrun_pct))}%"

    study_lines.append("| METRIC | AVERAGE | % OF STUDY |")
    study_lines.append("| ------ | ------- | ---------- |")
    study_lines.append(f"| **INTERRUPTS/DAY** | `{format_minutes(avg_interrupts, always_show_both=True)}` | `{interrupt_pct_str}` |")
    study_lines.append(f"| **OVERRUNS/DAY**   | `{format_minutes(avg_overruns, always_show_both=True)}` | `{overrun_pct_str}` |")
    study_lines.append("")
    sections.append(trim_blank_lines(study_lines))

    # TRAINING
    training_lines = ["### **TRAINING**"]

    # Per-month counts + deltas (compare each month to previous; first month vs last month of previous quarter)
    month_labels = [MONTH_ABBR[m[0].month - 1] for m in month_ranges]
    prev_month_ranges = quarter_months(prev_year, prev_quarter)
    prev_last_month_range = prev_month_ranges[-1] if prev_month_ranges else None

    def _month_count(range_tuple, key, source_data):
        start, end = range_tuple
        days = list(daterange(start, end))
        return sum(1 for d in days if source_data.get(d, {}).get(key)), len(days), start

    workout_counts = [_month_count(rng, "workout", daily_data) for rng in month_ranges]
    stretch_counts = [_month_count(rng, "stretch", daily_data) for rng in month_ranges]
    if prev_last_month_range:
        prev_workout_baseline = _month_count(prev_last_month_range, "workout", prev_daily_data)[0]
        prev_stretch_baseline = _month_count(prev_last_month_range, "stretch", prev_daily_data)[0]
    else:
        prev_workout_baseline = None
        prev_stretch_baseline = None

    def _compute_deltas(counts, baseline):
        deltas = []
        for idx, (done, _, start) in enumerate(counts):
            if start > today:
                deltas.append("")
                continue
            if idx == 0:
                prev_val = baseline
            else:
                prev_val = counts[idx - 1][0]
            delta = compute_percent_change(done, prev_val)
            deltas.append(format_percent_change(delta))
        return deltas

    workout_delta_labels = _compute_deltas(workout_counts, prev_workout_baseline)
    stretch_delta_labels = _compute_deltas(stretch_counts, prev_stretch_baseline)

    training_block = ["│ WORKOUT", "│"]
    training_block.extend(render_quarterly_training_bars(month_ranges, daily_data, "workout", workout_delta_labels))
    training_block.append("")  # blank line between workout and stretch inside same block
    training_block.append("│ STRETCH")
    training_block.append("│")
    training_block.extend(render_quarterly_training_bars(month_ranges, daily_data, "stretch", stretch_delta_labels))
    training_lines.extend(wrap_code_block(training_block))
    training_lines.append("")

    workout_days = current_metrics.get("workout_count", 0)
    stretch_days = current_metrics.get("stretch_count", 0)
    quarter_days = current_metrics.get("total_days", len(dates))
    training_lines.append("| ACTIVITY | COUNT | % DONE | % MISSED |")
    training_lines.append("| -------- | ----- | ------ | -------- |")
    if quarter_days > 0:
        workout_ratio = format_training_ratio(workout_days, quarter_days)
        stretch_ratio = format_training_ratio(stretch_days, quarter_days)
        workout_done_pct = min(100, max(0, round_half_up((workout_days / quarter_days) * 100)))
        workout_missed_pct = max(0, 100 - workout_done_pct)
        stretch_done_pct = min(100, max(0, round_half_up((stretch_days / quarter_days) * 100)))
        stretch_missed_pct = max(0, 100 - stretch_done_pct)
        training_lines.append(f"| **WORKOUT** | `{workout_ratio}` | `{workout_done_pct}%` | `{workout_missed_pct}%` |")
        training_lines.append(f"| **STRETCH** | `{stretch_ratio}` | `{stretch_done_pct}%` | `{stretch_missed_pct}%` |")
    else:
        training_lines.append("| **WORKOUT** | `-` | `-` | `-` |")
        training_lines.append("| **STRETCH** | `-` | `-` | `-` |")
    training_lines.append("")
    sections.append(trim_blank_lines(training_lines))

    # SLEEP
    sleep_lines = ["### **SLEEP**"]
    sleep_labels = []
    sleep_chart_vals = []
    sleep_avgs_minutes = []
    sleep_value_labels = []
    awake_vals = []
    awakenings_vals = []
    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        sleep_labels.append(label)
        days = list(daterange(start, end))
        mins = [daily_data.get(d, {}).get("sleep_minutes") for d in days if daily_data.get(d)]
        mins_clean = [m for m in mins if m is not None]
        if mins_clean:
            avg_min = sum(mins_clean) / len(mins_clean)
            sleep_chart_vals.append(avg_min / 60)
            sleep_avgs_minutes.append(avg_min)
            sleep_value_labels.append(format_minutes(avg_min))
        else:
            sleep_chart_vals.append(0)
            sleep_avgs_minutes.append(0)
            sleep_value_labels.append("0h00m" if start <= today else "")

        awake_vals.extend([daily_data.get(d, {}).get("awake_minutes") for d in days if daily_data.get(d)])
        awakenings_vals.extend([daily_data.get(d, {}).get("awakenings") for d in days if daily_data.get(d)])

    sleep_delta_labels = []
    for idx, start in enumerate([m[0] for m in month_ranges]):
        if start > today:
            sleep_delta_labels.append("")
            continue
        if idx == 0:
            sleep_delta_labels.append("—")
            continue
        curr = sleep_avgs_minutes[idx]
        prev = sleep_avgs_minutes[idx - 1]
        delta = compute_percent_change(curr, prev)
        sleep_delta_labels.append(format_percent_change(delta))

    sleep_chart = render_monthly_chart(
        sleep_labels,
        sleep_chart_vals,
        sleep_value_labels,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=12,
        delta_labels=sleep_delta_labels,
    )
    # Add extra left padding (4 spaces total) on x-axis labels for alignment and trim one dash
    if sleep_chart:
        # label row is second from bottom when delta row present
        sleep_chart[-2] = "   " + sleep_chart[-2]
        sleep_chart[-1] = "   " + sleep_chart[-1]
        sleep_chart[-3] = sleep_chart[-3][:-1] if len(sleep_chart[-3]) > 1 else sleep_chart[-3]
    sleep_lines.extend(wrap_code_block(sleep_chart))
    sleep_lines.append("")

    awake_vals = [v for v in awake_vals if v is not None]
    awakenings_vals = [v for v in awakenings_vals if v is not None]
    sleep_avg = current_metrics.get("sleep_avg_minutes")
    avg_awake = sum(awake_vals) / len(awake_vals) if awake_vals else None
    avg_awakenings = sum(awakenings_vals) / len(awakenings_vals) if awakenings_vals else None

    sleep_lines.append("| ACTIVITY | AVERAGE |")
    sleep_lines.append("| -------- | ------- |")
    sleep_lines.append(f"| **SLEEP**      | `{format_minutes(sleep_avg)}` |" if sleep_avg is not None else "| **SLEEP**      | |")
    sleep_lines.append(f"| **AWAKE**      | `{format_minutes(avg_awake)}` |" if avg_awake is not None else "| **AWAKE**      | |")
    if avg_awakenings is not None:
        awaken_val = f"{avg_awakenings:.1f}" if abs(avg_awakenings - round(avg_awakenings)) >= 0.05 else str(int(round(avg_awakenings)))
        sleep_lines.append(f"| **AWAKENINGS** | `{awaken_val}` |")
    else:
        sleep_lines.append("| **AWAKENINGS** | |")
    sleep_lines.append("")
    sections.append(trim_blank_lines(sleep_lines))

    # MOOD
    mood_lines = ["### **MOOD**"]
    mood_labels = []
    mood_chart_vals = []
    mood_value_labels = []
    mood_avgs = []
    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        mood_labels.append(label)
        days = list(daterange(start, end))
        vals = [daily_data.get(d, {}).get("mood") for d in days if daily_data.get(d)]
        vals_clean = [v for v in vals if v is not None]
        if vals_clean:
            avg_val = sum(vals_clean) / len(vals_clean)
            mood_chart_vals.append(avg_val)
            mood_avgs.append(avg_val)
            mood_value_labels.append(f"{avg_val:.1f}")
        else:
            mood_chart_vals.append(0)
            mood_avgs.append(0)
            mood_value_labels.append("0.0" if start <= today else "")

    mood_delta_labels = []
    for idx, start in enumerate([m[0] for m in month_ranges]):
        if start > today:
            mood_delta_labels.append("")
            continue
        if idx == 0:
            mood_delta_labels.append("—")
            continue
        curr = mood_avgs[idx]
        prev = mood_avgs[idx - 1]
        delta = compute_percent_change(curr, prev)
        mood_delta_labels.append(format_percent_change(delta))

    mood_chart = render_monthly_chart(
        mood_labels,
        mood_chart_vals,
        mood_value_labels,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=12,
        center_labels_on_bars=True,
        delta_labels=mood_delta_labels,
    )
    if mood_chart:
        mood_chart[-2] = "   " + mood_chart[-2]
        mood_chart[-1] = "   " + mood_chart[-1]
        mood_chart[-3] = mood_chart[-3][:-1] if len(mood_chart[-3]) > 1 else mood_chart[-3]
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    combined = []
    for sec in sections:
        combined.extend(sec)
        combined.append("")
    return trim_blank_lines(combined)


def main():
    parser = argparse.ArgumentParser(description="Generate quarterly metrics from daily notes.")
    parser.add_argument("--file", help="Path to quarterly note")
    parser.add_argument("--quarter", help="Quarter (YYYY-Qn, e.g., 2025-Q4)")
    parser.add_argument("--quarterly-dir", help="Directory for quarterly notes")
    args = parser.parse_args()

    if args.quarter:
        parts = args.quarter.upper().split("-Q")
        if len(parts) != 2:
            raise ValueError("Quarter must be in format YYYY-Qn")
        year = int(parts[0])
        quarter_num = int(parts[1])
    else:
        today = datetime.date.today()
        year, quarter_num = quarter_of_date(today)

    quarter_start, quarter_end = quarter_range(year, quarter_num)
    filename = f"{quarter_id(year, quarter_num)}.md"

    quarterly_dir = args.quarterly_dir or DEFAULT_QUARTERLY_DIR
    note_path = args.file or os.path.join(quarterly_dir, filename)

    if quarter_num == 1:
        prev_year = year - 1
        prev_quarter = 4
    else:
        prev_year = year
        prev_quarter = quarter_num - 1
    prev_start, prev_end = quarter_range(prev_year, prev_quarter)

    with locked_note(note_path):
        ensure_note(note_path, QUARTERLY_TEMPLATE_PATH)

        try:
            with open(note_path, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            lines = []

        g_start, g_end = goals_section_bounds(lines)
        quarterly_tasks = extract_subsection_tasks(lines, g_start, g_end, "QUARTERLY")
        _ensure_quarter_task_ids(quarterly_tasks, quarter_id(year, quarter_num))

        prev_note_path = os.path.join(quarterly_dir, f"{quarter_id(prev_year, prev_quarter)}.md")
        prev_tasks = []
        try:
            with open(prev_note_path, "r") as pf:
                prev_lines = pf.read().splitlines()
            p_start, p_end = goals_section_bounds(prev_lines)
            p_body = extract_subsection_tasks(prev_lines, p_start, p_end, "QUARTERLY")
            _ensure_quarter_task_ids(p_body, quarter_id(prev_year, prev_quarter))
            prev_tasks = p_body
        except Exception:
            prev_tasks = []

        open_prev = [t for t in prev_tasks if not t.get("done")]
        existing_ids = {t.get("id") for t in quarterly_tasks if t.get("id")}
        for t in open_prev:
            if t.get("id") in existing_ids:
                continue
            quarterly_tasks.append({**t, "done": False})
            existing_ids.add(t.get("id"))

        yearly_tasks = []
        yearly_path = os.path.join(quarterly_dir, f"{year}.md")
        try:
            with open(yearly_path, "r") as yf:
                yearly_lines = yf.read().splitlines()
            y_start, y_end = goals_section_bounds(yearly_lines)
            yearly_tasks = extract_subsection_tasks(yearly_lines, y_start, y_end, "YEARLY")
        except Exception:
            yearly_tasks = []

        new_goals_block = build_goals_block([
            ("YEARLY", render_goal_lines(yearly_tasks)),
            ("QUARTERLY", render_goal_lines(quarterly_tasks)),
        ])
        if g_start == -1:
            lines = new_goals_block + ([""] if lines and lines[0].strip() else []) + lines
        else:
            lines[g_start:g_end] = new_goals_block

        daily_data = _load_daily_data(quarter_start, quarter_end)
        prev_daily_data = _load_daily_data(prev_start, prev_end)
        month_ranges = quarter_months(year, quarter_num)

        metrics_block = build_quarterly_metrics(
            quarter_start,
            quarter_end,
            month_ranges,
            daily_data,
            prev_daily_data,
            prev_year,
            prev_quarter,
        )

        updated_lines = replace_metrics_block(lines, metrics_block)

        tmp_path = note_path + ".tmp"
        with open(tmp_path, "w") as f:
            f.write("\n".join(updated_lines).rstrip() + "\n")
        os.replace(tmp_path, note_path)


if __name__ == "__main__":
    main()
