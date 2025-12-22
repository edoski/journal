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


def format_minutes(total_minutes):
    if total_minutes is None:
        return ""
    total_minutes = max(0, float(total_minutes))
    total_minutes = int(round(total_minutes))
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours > 0:
        if minutes > 0:
            return f"{hours}h{minutes:02d}m"
        return f"{hours}h"
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
    return ["```text"] + lines + ["```"]


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

