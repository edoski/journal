import datetime
import math
import os
import re
from collections import OrderedDict

JOURNAL_DIR = "/Users/edo/Documents/Obsidian/the-vault/journal"
VAULT_DIR = "/Users/edo/Documents/Obsidian/the-vault"

WEEKLY_TEMPLATE_PATH = "/Users/edo/Documents/Obsidian/the-vault/notes/templates/weekly.md"
MONTHLY_TEMPLATE_PATH = "/Users/edo/Documents/Obsidian/the-vault/notes/templates/monthly.md"

DEFAULT_WEEKLY_DIR = os.environ.get("WEEKLY_DIR", JOURNAL_DIR)
DEFAULT_MONTHLY_DIR = os.environ.get("MONTHLY_DIR", JOURNAL_DIR)

DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def parse_frontmatter(lines):
    data = OrderedDict()
    if not lines or lines[0].strip() != "---":
        return data
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return data
    for line in lines[1:end_idx]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def parse_duration_to_minutes(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().strip("`")
    if not s:
        return None
    hours = 0.0
    minutes = 0.0
    seconds = 0.0
    match_h = re.search(r"(\d+(?:\.\d+)?)h", s)
    match_m = re.search(r"(\d+(?:\.\d+)?)m", s)
    match_s = re.search(r"(\d+(?:\.\d+)?)s", s)
    if match_h:
        hours = float(match_h.group(1))
    if match_m:
        minutes = float(match_m.group(1))
    if match_s:
        seconds = float(match_s.group(1))
    total = hours * 60 + minutes + (seconds / 60)
    return total


def format_minutes(total_minutes, always_show_both=False):
    """
    Format minutes as XhYm string.
    Always uses two-digit minutes when hours > 0 (e.g., 7h00m, 7h05m).
    If always_show_both=True, always shows both h and m (e.g., 0h00m for 0 minutes).
    """
    if total_minutes is None:
        return ""
    total_minutes = max(0, float(total_minutes))
    total_minutes = round_half_up(total_minutes)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours > 0 or always_show_both:
        return f"{hours}h{minutes:02d}m"
    return f"{minutes}m"


def format_minutes_seconds(total_minutes_float: float) -> str:
    """
    Convert minute value (can be float) to XmYYs string.
    """
    if total_minutes_float is None:
        return ""
    mins = int(total_minutes_float)
    secs = round((total_minutes_float - mins) * 60)
    if secs == 60:
        mins += 1
        secs = 0
    if mins >= 60:
        hours = mins // 60
        rem_mins = mins % 60
        return f"{hours}h{rem_mins:02d}m" if secs == 0 else f"{hours}h{rem_mins:02d}m{secs:02d}s"
    if secs == 0:
        return f"{mins}m"
    return f"{mins}m{secs:02d}s"


def ceil_minutes(val: float) -> int:
    """
    Round minutes upward with a tiny tolerance to avoid float undercounts
    (e.g., 89.0000001 -> 90).
    """
    if val is None:
        return 0
    return int(math.ceil(val - 1e-6))


def round_half_up(val: float) -> int:
    """
    Round to nearest minute, half-up, with tiny tolerance to prevent float drift.
    """
    if val is None:
        return 0
    return int(math.floor(val + 0.5000001))


def format_hours_value(hours, suffix="h"):
    if hours is None:
        return ""
    if abs(hours - round(hours)) < 0.05:
        return f"{int(round(hours))}{suffix}"
    return f"{hours:.1f}{suffix}"


def format_mood_value(val):
    if val is None:
        return ""
    if abs(val - round(val)) < 0.05:
        return str(int(round(val)))
    return f"{val:.1f}"


def parse_bool(val):
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() == "true"


def extract_block(lines, header):
    header_lower = header.strip().lower()
    start = -1
    for idx, line in enumerate(lines):
        if line.strip().lower() == header_lower:
            start = idx
            break
    if start == -1:
        return []
    end = len(lines)
    for idx in range(start + 1, len(lines)):
        stripped = lines[idx].strip()
        if stripped.startswith("### ") or stripped.startswith("## "):
            end = idx
            break
    while end > start and lines[end - 1].strip() == "":
        end -= 1
    return lines[start:end]


def parse_study_table(lines):
    block = extract_block(lines, "### STUDY")
    if not block:
        return []
    header_idx = -1
    for i, line in enumerate(block):
        if re.search(r"\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*(DURATION|FOCUS)\s*\|", line, re.IGNORECASE):
            header_idx = i
            break
    if header_idx == -1:
        return []
    rows = []
    for line in block[header_idx + 2:]:
        if not line.strip().startswith("|"):
            break
        if re.search(r"no study sessions", line, re.IGNORECASE):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 6:
            continue
        activity = parts[2].strip("`")
        duration_min = parse_duration_to_minutes(parts[3])
        if activity and duration_min:
            rows.append((activity, duration_min))
    return rows


def parse_sleep_table(lines):
    block = extract_block(lines, "### SLEEP")
    if not block:
        return []
    header_idx = -1
    for i, line in enumerate(block):
        if re.search(r"\|\s*TIME\s*\|\s*DURATION\s*\|\s*AWAKE\s*\|\s*AWAKENINGS\s*\|", line, re.IGNORECASE):
            header_idx = i
            break
    if header_idx == -1:
        return []
    rows = []
    for line in block[header_idx + 2:]:
        if not line.strip().startswith("|"):
            break
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 5:
            continue
        duration_min = parse_duration_to_minutes(parts[2])
        awake_min = parse_duration_to_minutes(parts[3])
        awakenings = None
        if parts[4]:
            try:
                awakenings = int(re.sub(r"[^0-9]", "", parts[4]))
            except Exception:
                awakenings = None
        rows.append((duration_min, awake_min, awakenings))
    return rows


def parse_daily_note(path):
    try:
        text = open(path, "r").read()
    except Exception:
        return None
    lines = text.splitlines()
    fm = parse_frontmatter(lines)

    study_rows = parse_study_table(lines)
    sleep_rows = parse_sleep_table(lines)

    study_from_fm = parse_duration_to_minutes(fm.get("study"))
    sleep_from_fm = parse_duration_to_minutes(fm.get("sleep"))

    study_total = study_from_fm if study_from_fm is not None else sum((m for _, m in study_rows), 0)
    sleep_total = sleep_from_fm if sleep_from_fm is not None else sum((r[0] or 0 for r in sleep_rows), 0)

    mood_val = None
    if fm.get("mood") not in (None, ""):
        try:
            mood_val = float(re.sub(r"[^0-9.\-]", "", fm.get("mood")))
        except Exception:
            mood_val = None

    workout = parse_bool(fm.get("workout"))
    stretch = parse_bool(fm.get("stretch"))

    awake_total = sum((r[1] or 0 for r in sleep_rows), 0) if sleep_rows else None
    awakenings_total = None
    if sleep_rows:
        awak_counts = [r[2] for r in sleep_rows if r[2] is not None]
        if awak_counts:
            awakenings_total = sum(awak_counts)

    activity_totals = {}
    for activity, minutes in study_rows:
        activity_totals[activity] = activity_totals.get(activity, 0) + minutes

    return {
        "study_minutes": study_total,
        "sleep_minutes": sleep_total,
        "mood": mood_val,
        "workout": workout,
        "stretch": stretch,
        "awake_minutes": awake_total,
        "awakenings": awakenings_total,
        "activity_totals": activity_totals,
    }


def daterange(start_date, end_date):
    current = start_date
    while current <= end_date:
        yield current
        current += datetime.timedelta(days=1)


def iso_week_range(date_obj):
    start = date_obj - datetime.timedelta(days=date_obj.isoweekday() - 1)
    end = start + datetime.timedelta(days=6)
    return start, end


def month_range(year, month):
    start = datetime.date(year, month, 1)
    if month == 12:
        end = datetime.date(year + 1, 1, 1) - datetime.timedelta(days=1)
    else:
        end = datetime.date(year, month + 1, 1) - datetime.timedelta(days=1)
    return start, end


def month_week_ranges(year, month):
    month_start, month_end = month_range(year, month)
    weeks = OrderedDict()
    for day in daterange(month_start, month_end):
        week_start, week_end = iso_week_range(day)
        key = week_start
        if key not in weeks:
            weeks[key] = (week_start, week_end)
    ranges = []
    for week_start, week_end in weeks.values():
        start = max(week_start, month_start)
        end = min(week_end, month_end)
        ranges.append((start, end))
    return ranges


def format_week_label(start_date, end_date):
    month = MONTH_ABBR[start_date.month - 1]
    return f"{month} {start_date.day:02d}-{end_date.day:02d}"


def render_summary_block(label_values, max_values, bar_width=20):
    lines = ["### SUMMARY", ""]
    label_width = max((len(label) for label, _, _ in label_values), default=0)
    for label, value_str, numeric_val in label_values:
        max_val = max_values.get(label, 1) or 1
        bar_len = 0
        if numeric_val is not None:
            bar_len = int(round(min(bar_width, max(0, numeric_val / max_val * bar_width))))
        bar = "#" * bar_len
        lines.append(f"{label.ljust(label_width)} {value_str} | {bar}")
    lines.append("")
    return lines


def render_vertical_chart(labels, bar_values, value_labels, height=10, col_width=8):
    axis_width = len(f"{height:>2} |")
    left_pad = (col_width - 1) // 2
    bar_col = " " * left_pad + "#" + " " * (col_width - 1 - left_pad)
    blank_col = " " * col_width

    bars = []
    for val in bar_values:
        if val is None:
            bars.append(0)
            continue
        bars.append(int(round(min(height, max(0, val)))))

    lines = []
    for level in range(height, 0, -1):
        row = f"{level:>2} |"
        for bar in bars:
            row += bar_col if bar >= level else blank_col
        lines.append(row)

    label_row = " " * axis_width
    for label in labels:
        label_row += label.ljust(col_width)[:col_width]
    lines.append(label_row.rstrip())

    value_row = " " * axis_width
    for val in value_labels:
        value_row += str(val).ljust(col_width)[:col_width]
    lines.append(value_row.rstrip())
    return lines


def wrap_code_block(lines):
    return ["```"] + lines + ["```"]


def ensure_note(path, template_path):
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if template_path and os.path.exists(template_path):
        with open(template_path, "r") as tf:
            content = tf.read()
        with open(path, "w") as f:
            f.write(content)


def replace_metrics_block(lines, new_block_lines):
    metrics_idx = None
    for idx, line in enumerate(lines):
        if line.strip().lower() == "## metrics":
            metrics_idx = idx
            break
    if metrics_idx is None:
        return lines

    end_idx = len(lines)
    for idx in range(metrics_idx + 1, len(lines)):
        if lines[idx].strip().startswith("## ") and lines[idx].strip().lower() != "## metrics":
            end_idx = idx
            break

    new_lines = lines[:metrics_idx + 1]
    if metrics_idx + 1 < len(lines) and lines[metrics_idx + 1].strip() == "---":
        new_lines.append("---")
    else:
        new_lines.append("---")
    new_lines.extend(new_block_lines)
    new_lines.append("")
    new_lines.extend(lines[end_idx:])
    return new_lines


def compute_percent_change(current, previous):
    """
    Compute percentage change from previous to current.
    Returns None if previous is 0 or None.
    """
    if previous is None or previous == 0:
        return None
    if current is None:
        return None
    return ((current - previous) / previous) * 100


def format_percent_change(pct):
    """
    Format percentage change as +X% or -X%.
    """
    if pct is None:
        return "-"
    sign = "+" if pct >= 0 else ""
    return f"{sign}{round_half_up(pct)}%"


def format_study_avg(total_minutes, days):
    """
    Format study as daily average (e.g., "1h16m/day").
    """
    if days <= 0 or total_minutes is None:
        return "-"
    avg = total_minutes / days
    return f"{format_minutes(round_half_up(avg))}/day"


def format_training_ratio(count, total_days):
    """
    Format workout/stretch as count/total.
    Zero-pad count only for monthly notes (total_days > 7).
    """
    if total_days > 7:
        return f"{count:02d}/{total_days}"
    return f"{count}/{total_days}"


def format_mood_with_scale(val):
    """Format mood value with /10.0 suffix, always showing one decimal (e.g., 5.0/10.0)."""
    if val is None:
        return ""
    return f"{val:.1f}/10.0"


def render_summary_table(current_metrics, previous_metrics, current_label, previous_label):
    """
    Generate markdown summary table with averages, previous values, and % change.
    
    current_metrics and previous_metrics are dicts with keys:
    - study_avg_minutes: daily average study in minutes
    - study_total_minutes: total study in minutes
    - sleep_avg_minutes: average sleep in minutes
    - mood_avg: average mood
    - workout_count: number of workout days
    - stretch_count: number of stretch days
    - total_days: number of days in period
    
    previous_label should be a wiki link like "[[2025-W50\\|LAST WEEK]]"
    Order: STUDY → SLEEP → WORKOUT → STRETCH → MOOD
    """
    lines = ["### **SUMMARY**", ""]
    
    # Table header
    lines.append(f"| METRIC | {current_label} | {previous_label} | CHANGE |")
    lines.append("| ------ | ----------- | ----------------------- | ------ |")
    
    # STUDY row (daily average)
    curr_study_total = current_metrics.get("study_total_minutes") or 0
    prev_study_total = previous_metrics.get("study_total_minutes") or 0
    curr_total_days = current_metrics.get("total_days", 7)
    prev_total_days = previous_metrics.get("total_days", 7)
    
    # Always show study average, even if zero
    curr_study_avg_mins = curr_study_total / max(1, curr_total_days)
    curr_study_avg = format_minutes(curr_study_avg_mins, always_show_both=True) + "/day"
    
    prev_study_avg_mins = prev_study_total / max(1, prev_total_days)
    prev_study_avg = format_minutes(prev_study_avg_mins, always_show_both=True) + "/day"
    
    # Compute percentage change (show dash only if both are zero)
    if curr_study_avg_mins > 0 or prev_study_avg_mins > 0:
        study_pct = compute_percent_change(curr_study_avg_mins, prev_study_avg_mins)
        study_pct_str = format_percent_change(study_pct)
    else:
        study_pct_str = "-"
    
    lines.append(f"| **STUDY** | `{curr_study_avg}` | `{prev_study_avg}` | `{study_pct_str}` |")
    
    # SLEEP row (with /night suffix)
    curr_sleep_avg = current_metrics.get("sleep_avg_minutes") or 0
    prev_sleep_avg = previous_metrics.get("sleep_avg_minutes") or 0
    
    # Always show sleep average, even if zero
    curr_sleep = format_minutes(curr_sleep_avg, always_show_both=True) + "/night"
    prev_sleep = format_minutes(prev_sleep_avg, always_show_both=True) + "/night"
    
    # Compute percentage change (show dash only if both are zero)
    if curr_sleep_avg > 0 or prev_sleep_avg > 0:
        sleep_pct = compute_percent_change(curr_sleep_avg, prev_sleep_avg)
        sleep_pct_str = format_percent_change(sleep_pct)
    else:
        sleep_pct_str = "-"
    
    lines.append(f"| **SLEEP** | `{curr_sleep}` | `{prev_sleep}` | `{sleep_pct_str}` |")
    
    # WORKOUT row
    curr_workout_count = current_metrics.get("workout_count", 0)
    prev_workout_count = previous_metrics.get("workout_count", 0)
    
    # Always show workout ratio, even if zero
    curr_workout = format_training_ratio(curr_workout_count, curr_total_days)
    prev_workout = format_training_ratio(prev_workout_count, prev_total_days)
    
    # Compute percentage change (show dash only if both are zero)
    if curr_workout_count > 0 or prev_workout_count > 0:
        workout_pct = compute_percent_change(curr_workout_count, prev_workout_count)
        workout_pct_str = format_percent_change(workout_pct)
    else:
        workout_pct_str = "-"
    
    lines.append(f"| **WORKOUT** | `{curr_workout}` | `{prev_workout}` | `{workout_pct_str}` |")
    
    # STRETCH row
    curr_stretch_count = current_metrics.get("stretch_count", 0)
    prev_stretch_count = previous_metrics.get("stretch_count", 0)
    
    # Always show stretch ratio, even if zero
    curr_stretch = format_training_ratio(curr_stretch_count, curr_total_days)
    prev_stretch = format_training_ratio(prev_stretch_count, prev_total_days)
    
    # Compute percentage change (show dash only if both are zero)
    if curr_stretch_count > 0 or prev_stretch_count > 0:
        stretch_pct = compute_percent_change(curr_stretch_count, prev_stretch_count)
        stretch_pct_str = format_percent_change(stretch_pct)
    else:
        stretch_pct_str = "-"
    
    lines.append(f"| **STRETCH** | `{curr_stretch}` | `{prev_stretch}` | `{stretch_pct_str}` |")
    
    # MOOD row (with /10.0 suffix)
    curr_mood_avg = current_metrics.get("mood_avg") or 0
    prev_mood_avg = previous_metrics.get("mood_avg") or 0
    
    # Always show mood value, even if zero
    curr_mood = format_mood_with_scale(curr_mood_avg)
    prev_mood = format_mood_with_scale(prev_mood_avg)
    
    # Compute percentage change (show dash only if both are zero)
    if curr_mood_avg > 0 or prev_mood_avg > 0:
        mood_pct = compute_percent_change(curr_mood_avg, prev_mood_avg)
        mood_pct_str = format_percent_change(mood_pct)
    else:
        mood_pct_str = "-"
    
    lines.append(f"| **MOOD** | `{curr_mood}` | `{prev_mood}` | `{mood_pct_str}` |")
    
    lines.append("")
    return lines


def render_monthly_chart(labels, values, value_labels, height=10, y_max=None, bar_width=5, col_spacing=12, left_pad=2, center_labels_on_bars=False):
    """
    Render a monthly bar chart with values on top of bars.
    
    labels: list of x-axis labels (e.g., ["DEC 01-07", "DEC 08-14", ...])
    values: list of numeric values for bar heights
    value_labels: list of formatted value strings to show on top of bars
    height: number of visual rows for bars (default 10)
    y_max: maximum value on Y-axis (default same as height)
    bar_width: number of █ characters per bar (default 5)
    col_spacing: spacing between columns (default 12)
    left_pad: number of spaces before bars in each column (default 2)
    center_labels_on_bars: if True, center labels on bars by adding 1 space (default False)
    
    Format:
    - Labels appear at the level of bar_height (blocks fill levels 1 to bar_height-1)
    - For values at y_max, label goes on overflow line above chart, blocks fill all levels
    - For zero values, label appears at level 1 with no blocks
    """
    bar_char = "█"
    
    if y_max is None:
        y_max = height
    
    # Scale values to visual height
    scale = height / y_max if y_max > 0 else 1
    bar_heights = []
    for val in values:
        if val is None or val == 0:
            bar_heights.append(0)
        else:
            bar_heights.append(min(height, max(1, round_half_up(val * scale))))
    
    lines = []
    
    # Check if any value is at max (needs overflow line for label)
    has_max_value = any(bar_h == height and bar_h > 0 for bar_h in bar_heights)
    if has_max_value:
        # Add overflow line for labels at max height
        overflow_row = " "
        for i, (bar_h, label) in enumerate(zip(bar_heights, value_labels)):
            if bar_h == height:
                label_str = str(label).strip('`') if label else ""
                label_left_pad = left_pad + 1 if center_labels_on_bars else left_pad
                overflow_row += " " * label_left_pad + label_str + " " * (col_spacing - label_left_pad - len(label_str))
            else:
                overflow_row += " " * col_spacing
        lines.append(overflow_row.rstrip())
    
    # Y-axis and bars with value labels on top
    for level in range(height, -1, -1):
        if level == 0:
            # Bottom line with axis (trimmed by 3 characters)
            row = "└" + "─" * (col_spacing * len(labels) - 3)
        else:
            row = "│"
            for i, (bar_h, label) in enumerate(zip(bar_heights, value_labels)):
                label_str = str(label).strip('`') if label else ""
                label_left_pad = left_pad + 1 if center_labels_on_bars else left_pad
                
                if bar_h == 0 and level == 1:
                    # Zero value - show label at level 1, no blocks
                    row += " " * label_left_pad + label_str + " " * (col_spacing - label_left_pad - len(label_str))
                elif bar_h == height and level <= height:
                    # Max value - blocks fill all levels (label on overflow line)
                    row += " " * left_pad + bar_char * bar_width + " " * (col_spacing - left_pad - bar_width)
                elif bar_h > 0 and bar_h < height and level == bar_h + 1:
                    # One level above top of bar (non-max) - show label
                    row += " " * label_left_pad + label_str + " " * (col_spacing - label_left_pad - len(label_str))
                elif bar_h > 0 and level <= bar_h:
                    # Bar level - show block
                    row += " " * left_pad + bar_char * bar_width + " " * (col_spacing - left_pad - bar_width)
                else:
                    # Empty space
                    row += " " * col_spacing
        lines.append(row.rstrip())
    
    # X-axis labels row with single space (left-aligned)
    label_row = " "
    for label in labels:
        label_str = str(label)
        label_row += label_str + " " * (col_spacing - len(label_str))
    lines.append(label_row.rstrip())
    
    return lines


def render_weekly_chart(labels, values, value_labels, height=10, y_max=None, bar_width=3, col_spacing=8, center_labels_on_bars=False):
    """
    Render a weekly bar chart with values on top of bars.
    
    labels: list of x-axis labels (e.g., ["MON", "TUE", ...])
    values: list of numeric values for bar heights
    value_labels: list of formatted value strings to show on top of bars
    height: number of visual rows for bars (default 10)
    y_max: maximum value on Y-axis (default same as height)
    bar_width: number of █ characters per bar (default 3)
    col_spacing: spacing between columns (default 8)
    center_labels_on_bars: if True, center labels on bars instead of column (default False)
    
    Format:
    - Labels appear at the level of bar_height (blocks fill levels 1 to bar_height-1)
    - For values at y_max, label goes on overflow line above chart, blocks fill all levels
    - For zero values, label appears at level 1 with no blocks
    """
    bar_char = "█"
    
    if y_max is None:
        y_max = height
    
    # Scale values to visual height
    scale = height / y_max if y_max > 0 else 1
    bar_heights = []
    for val in values:
        if val is None or val == 0:
            bar_heights.append(0)
        else:
            bar_heights.append(min(height, max(1, round_half_up(val * scale))))
    
    lines = []
    
    # Check if any value is at max (needs overflow line for label)
    has_max_value = any(bar_h == height and bar_h > 0 for bar_h in bar_heights)
    if has_max_value:
        # Add overflow line for labels at max height
        overflow_row = "   "
        for i, (bar_h, label) in enumerate(zip(bar_heights, value_labels)):
            if bar_h == height:
                label_str = str(label).strip('`') if label else ""
                if center_labels_on_bars:
                    bar_left_pad = (col_spacing - bar_width) // 2
                    left_pad = bar_left_pad + (bar_width - len(label_str)) // 2
                else:
                    left_pad = (col_spacing - len(label_str)) // 2
                overflow_row += " " * left_pad + label_str + " " * (col_spacing - left_pad - len(label_str))
            else:
                overflow_row += " " * col_spacing
        lines.append(overflow_row.rstrip())
    
    # Y-axis and bars with value labels on top
    for level in range(height, -1, -1):
        if level == 0:
            # Bottom line with axis (trimmed by 2 characters for weekly)
            row = "└" + "─" * (col_spacing * len(labels) - 2)
        else:
            row = "│"
            for i, (bar_h, label) in enumerate(zip(bar_heights, value_labels)):
                label_str = str(label).strip('`') if label else ""
                bar_left_pad = (col_spacing - bar_width) // 2
                if center_labels_on_bars:
                    # Center label on bar (for 5-char blocks)
                    left_pad = bar_left_pad + (bar_width - len(label_str)) // 2
                else:
                    # Center label in column
                    left_pad = (col_spacing - len(label_str)) // 2
                
                if bar_h == 0 and level == 1:
                    # Zero value - show label at level 1, no blocks
                    row += " " * left_pad + label_str + " " * (col_spacing - left_pad - len(label_str))
                elif bar_h == height and level <= height:
                    # Max value - blocks fill all levels (label on overflow line)
                    row += " " * bar_left_pad + bar_char * bar_width + " " * (col_spacing - bar_left_pad - bar_width)
                elif bar_h > 0 and bar_h < height and level == bar_h + 1:
                    # One level above top of bar (non-max) - show label
                    row += " " * left_pad + label_str + " " * (col_spacing - left_pad - len(label_str))
                elif bar_h > 0 and level <= bar_h:
                    # Bar level - show block
                    row += " " * bar_left_pad + bar_char * bar_width + " " * (col_spacing - bar_left_pad - bar_width)
                else:
                    # Empty space
                    row += " " * col_spacing
        lines.append(row.rstrip())
    
    # X-axis labels row with 3 spaces indent (left-aligned, not centered)
    label_row = "   "
    for label in labels:
        label_str = str(label)
        label_row += label_str + " " * (col_spacing - len(label_str))
    lines.append(label_row.rstrip())
    
    return lines


def render_training_frequency_grid(week_ranges, daily_data, workout_count, stretch_count, days_in_period):
    """
    Render a compact frequency grid showing workout/stretch activity for the entire month.
    
    week_ranges: list of (start_date, end_date) tuples for each week in the month
    daily_data: dict mapping date -> parsed daily note data
    workout_count: total number of workout days
    stretch_count: total number of stretch days
    days_in_period: total days in the month
    
    Returns list of lines for the frequency grid visualization.
    
    Format:
    WORKOUT:  ■ ■ · ■ ■ · ■   ■ ■ ■ · ■ · ■   ...   (14/31)
    STRETCH:  ■ · ■ · · ■ ■   ■ ■ ■ ■ ■ ■ ·   ...   (15/31)
              ─────────────   ─────────────   ...
              DEC 01-07       DEC 08-14       ...
    """
    lines = []
    
    # Build workout and stretch rows
    workout_symbols = []
    stretch_symbols = []
    week_labels = []
    week_day_counts = []
    
    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        week_day_counts.append(len(week_days))
        week_labels.append(format_week_label(start, end))
        
        for day in week_days:
            entry = daily_data.get(day, {})
            has_workout = entry.get("workout", False)
            has_stretch = entry.get("stretch", False)
            
            workout_symbols.append("■" if has_workout else "·")
            stretch_symbols.append("■" if has_stretch else "·")
    
    # Build the two main rows with spacing between weeks
    workout_row = "│ WORKOUT:  "
    stretch_row = "│ STRETCH:  "
    
    symbol_idx = 0
    for i, day_count in enumerate(week_day_counts):
        # Add symbols for this week
        week_workout = " ".join(workout_symbols[symbol_idx:symbol_idx + day_count])
        week_stretch = " ".join(stretch_symbols[symbol_idx:symbol_idx + day_count])
        
        workout_row += week_workout
        stretch_row += week_stretch
        
        symbol_idx += day_count
        
        # Add spacing between weeks (3 spaces)
        if i < len(week_day_counts) - 1:
            workout_row += "   "
            stretch_row += "   "
    
    # Add counts at the end (zero-padded for alignment)
    workout_row += f"   ({workout_count:02d}/{days_in_period})"
    stretch_row += f"   ({stretch_count:02d}/{days_in_period})"
    
    lines.append(workout_row)
    lines.append(stretch_row)
    
    # Build separator row (dashes under each week)
    separator_row = "│           "  # "│ " + 10 spaces to align with "│ WORKOUT:  "
    for i, day_count in enumerate(week_day_counts):
        # Each day takes 2 chars (symbol + space), minus last space
        dash_count = day_count * 2 - 1
        separator_row += "─" * dash_count
        
        # Add spacing between weeks (3 spaces)
        if i < len(week_day_counts) - 1:
            separator_row += "   "
    
    lines.append(separator_row)
    
    # Build label row
    label_row = "│           "  # "│ " + 10 spaces to align
    for i, (label, day_count) in enumerate(zip(week_labels, week_day_counts)):
        label_row += label
        
        # Add spacing to next label (if not last)
        if i < len(week_day_counts) - 1:
            # Calculate spacing: week width minus label length, plus inter-week spacing
            week_width = day_count * 2 - 1  # Each day is 2 chars (symbol + space), minus last space
            spacing = week_width - len(label) + 3  # +3 for inter-week gap
            label_row += " " * spacing
    
    lines.append(label_row)
    
    return lines


def render_weekly_training_grid(dates, daily_data, workout_count, stretch_count):
    """
    Render a compact frequency grid showing workout/stretch activity for a single week.
    
    dates: list of 7 date objects (Monday-Sunday)
    daily_data: dict mapping date -> parsed daily note data
    workout_count: total number of workout days
    stretch_count: total number of stretch days
    
    Returns list of lines for the frequency grid visualization.
    
    Format:
    │ WORKOUT:  ███ ░░░ ███ ███ ░░░ ███ ███   (5/7)
    │ STRETCH:  ░░░ ███ ███ ░░░ ███ ░░░ ███   (4/7)
    │           ─── ─── ─── ─── ─── ─── ───
    │           MON TUE WED THU FRI SAT SUN
    """
    lines = []
    
    # Build workout and stretch symbols
    workout_symbols = []
    stretch_symbols = []
    
    for day in dates:
        entry = daily_data.get(day, {})
        has_workout = entry.get("workout", False)
        has_stretch = entry.get("stretch", False)
        
        workout_symbols.append("███" if has_workout else "░░░")
        stretch_symbols.append("███" if has_stretch else "░░░")
    
    # Build the two main rows (each day takes 4 chars: 3-char block + 1 space)
    workout_row = "│ WORKOUT:  " + " ".join(workout_symbols) + f"   ({workout_count}/7)"
    stretch_row = "│ STRETCH:  " + " ".join(stretch_symbols) + f"   ({stretch_count}/7)"
    
    lines.append(workout_row)
    lines.append(stretch_row)
    
    # Build separator row (3 dashes per day)
    separator_row = "│           " + " ".join(["───"] * 7)
    lines.append(separator_row)
    
    # Build label row with day names
    label_row = "│           " + " ".join(DAYS)
    lines.append(label_row)
    
    return lines

