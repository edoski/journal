"""Session automation commands for skip/remind behaviors."""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sqlite3
import subprocess
from typing import TypedDict

from sync.config import PATHS
from sync.log import get_logger
from sync.run.commands.session import get_connection

SKIP_LAUNCHD_LABEL = "com.edo.skip"
SKIP_LAUNCHD_DOMAIN = f"gui/{os.geteuid()}"
SKIP_LAUNCHD_TARGET = f"{SKIP_LAUNCHD_DOMAIN}/{SKIP_LAUNCHD_LABEL}"
REMIND_LAUNCHD_LABEL = "com.edo.remind"
REMIND_LAUNCHD_DOMAIN = f"gui/{os.geteuid()}"
REMIND_LAUNCHD_TARGET = f"{REMIND_LAUNCHD_DOMAIN}/{REMIND_LAUNCHD_LABEL}"
FLOW_REMINDER_STATE_FILENAME = "flow_reminder_state.json"
FLOW_REMINDER_COOLDOWN_SECONDS = 120
FLOW_REMINDER_STAGNANT_THRESHOLD = 1

logger = get_logger(__name__)


class FlowReminderState(TypedDict, total=False):
    open_session_started_at: float | None
    remaining_time: str | None
    stagnant_checks: int
    last_reminded_epoch: float | None


def _run_launchctl(args: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(
        ["launchctl", *args],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _skip_enabled_state() -> bool | None:
    code, stdout, stderr = _run_launchctl(["print-disabled", SKIP_LAUNCHD_DOMAIN])
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.warning("Unable to read launchd skip state: %s", detail)
        return None

    match = re.search(
        rf'"{re.escape(SKIP_LAUNCHD_LABEL)}"\s*=>\s*(true|false)',
        stdout,
    )
    if match is None:
        return True
    return match.group(1) == "false"


def _set_skip_enabled(enabled: bool) -> bool:
    command = "enable" if enabled else "disable"
    code, stdout, stderr = _run_launchctl([command, SKIP_LAUNCHD_TARGET])
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.error("Failed to %s %s: %s", command, SKIP_LAUNCHD_TARGET, detail)
        return False
    return True


def _print_skip_status(enabled: bool) -> None:
    status = "ENABLED" if enabled else "DISABLED"
    print(f"Skip automation: {status}")


def _apply_skip_state(state: str) -> int:
    current = _skip_enabled_state()
    if current is None:
        print("Skip automation: UNKNOWN (launchd state unavailable)")
        return 1

    if state == "status":
        _print_skip_status(current)
        return 0

    if state != "toggle":
        raise ValueError(f"Unsupported skip state action: {state}")

    target = not current
    if not _set_skip_enabled(target):
        return 1

    updated = _skip_enabled_state()
    _print_skip_status(target if updated is None else updated)
    return 0


def _flow_reminder_state_path() -> str:
    return os.path.join(PATHS.journal_cache_dir, FLOW_REMINDER_STATE_FILENAME)


def _load_flow_reminder_state() -> FlowReminderState:
    path = _flow_reminder_state_path()
    try:
        with open(path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as exc:
        logger.warning("Invalid reminder state JSON at %s: %s", path, exc)
        return {}
    except (PermissionError, OSError) as exc:
        logger.warning("Failed to read reminder state %s: %s", path, exc)
        return {}

    if not isinstance(raw, dict):
        logger.warning("Invalid reminder state payload at %s: expected object", path)
        return {}

    state: FlowReminderState = {}
    marker = raw.get("open_session_started_at")
    if isinstance(marker, (int, float)):
        state["open_session_started_at"] = float(marker)
    elif marker is None:
        state["open_session_started_at"] = None

    remaining = raw.get("remaining_time")
    if isinstance(remaining, str):
        state["remaining_time"] = remaining
    elif remaining is None:
        state["remaining_time"] = None

    stagnant = raw.get("stagnant_checks")
    if isinstance(stagnant, int):
        state["stagnant_checks"] = max(0, stagnant)

    reminded = raw.get("last_reminded_epoch")
    if isinstance(reminded, (int, float)):
        state["last_reminded_epoch"] = float(reminded)
    elif reminded is None:
        state["last_reminded_epoch"] = None
    return state


def _save_flow_reminder_state(state: FlowReminderState) -> None:
    path = _flow_reminder_state_path()
    payload = {
        "open_session_started_at": state.get("open_session_started_at"),
        "remaining_time": state.get("remaining_time"),
        "stagnant_checks": max(0, int(state.get("stagnant_checks", 0))),
        "last_reminded_epoch": state.get("last_reminded_epoch"),
    }

    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
        os.replace(tmp_path, path)
    except (PermissionError, OSError) as exc:
        logger.warning("Failed to write reminder state %s: %s", path, exc)


def _clear_flow_reminder_state() -> None:
    path = _flow_reminder_state_path()
    try:
        os.remove(path)
    except FileNotFoundError:
        return
    except (PermissionError, OSError) as exc:
        logger.warning("Failed to clear reminder state %s: %s", path, exc)


def _remind_enabled_state() -> bool | None:
    code, stdout, stderr = _run_launchctl(["print-disabled", REMIND_LAUNCHD_DOMAIN])
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.warning("Unable to read launchd remind state: %s", detail)
        return None

    match = re.search(
        rf'"{re.escape(REMIND_LAUNCHD_LABEL)}"\s*=>\s*(true|false)',
        stdout,
    )
    if match is None:
        return True
    return match.group(1) == "false"


def _set_remind_enabled(enabled: bool) -> bool:
    command = "enable" if enabled else "disable"
    code, stdout, stderr = _run_launchctl([command, REMIND_LAUNCHD_TARGET])
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.error("Failed to %s %s: %s", command, REMIND_LAUNCHD_TARGET, detail)
        return False
    return True


def _print_remind_status(enabled: bool) -> None:
    status = "ENABLED" if enabled else "DISABLED"
    print(f"Remind automation: {status}")


def _apply_remind_state(state: str) -> int:
    current = _remind_enabled_state()
    if current is None:
        print("Remind automation: UNKNOWN (launchd state unavailable)")
        return 1

    if state == "status":
        _print_remind_status(current)
        return 0

    if state != "toggle":
        raise ValueError(f"Unsupported remind state action: {state}")

    target = not current
    if not _set_remind_enabled(target):
        return 1

    updated = _remind_enabled_state()
    _print_remind_status(target if updated is None else updated)
    return 0


def _run_applescript(script: str) -> str | None:
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() if exc.stderr else str(exc)
        logger.error("AppleScript error: %s", detail)
        return None


def _latest_row_is_open_flow(conn: sqlite3.Connection) -> bool:
    return _latest_open_flow_started_at(conn) is not None


def _latest_open_flow_started_at(conn: sqlite3.Connection) -> float | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT ZPHASE, ZCOMPLETEDAT, ZSTARTEDAT
        FROM ZSESSION
        ORDER BY ZSTARTEDAT DESC
        LIMIT 1
        """
    )
    row = cur.fetchone()
    if not row:
        return None
    phase, completed_at, started_at = row
    if phase != "flow" or completed_at is not None:
        return None
    if started_at is None:
        return None
    try:
        return float(started_at)
    except (TypeError, ValueError):
        return None


def _now() -> datetime.datetime:
    return datetime.datetime.now()


def cmd_session_skip(args: argparse.Namespace) -> int:
    if args.state is not None:
        return _apply_skip_state(args.state)

    enabled = _skip_enabled_state()
    if enabled is None:
        logger.warning("Skip no-op: unable to resolve launchd skip state")
        return 0
    if not enabled:
        logger.info("Skip no-op: automation disabled")
        return 0

    phase = _run_applescript('tell application "Flow" to getPhase')
    logger.info("Current phase: %s", phase)
    if phase != "Flow":
        logger.info("Skip no-op: current phase is not Flow")
        return 0

    try:
        conn = get_connection(readonly=True)
    except Exception as exc:
        logger.warning("Skip no-op: failed to read Flow DB state: %s", exc)
        return 0

    try:
        if not _latest_row_is_open_flow(conn):
            logger.info("Skip no-op: latest session is not an open flow row")
            return 0
    except Exception as exc:
        logger.warning("Skip no-op: failed to evaluate latest session row: %s", exc)
        return 0
    finally:
        conn.close()

    if _run_applescript('tell application "Flow" to skip') is None:
        logger.warning("Skip no-op: Flow skip command failed")
        return 0
    if _run_applescript('tell application "Flow" to start') is None:
        logger.warning("Skip no-op: Flow start command failed after skip")
        return 0
    if _run_applescript('tell application "Flow" to show') is None:
        logger.warning("Skip no-op: Flow show command failed after skip/start")
        return 0

    logger.info("Skip executed")
    return 0


def cmd_session_remind(args: argparse.Namespace) -> int:
    if args.state is not None:
        return _apply_remind_state(args.state)

    enabled = _remind_enabled_state()
    if enabled is None:
        logger.warning("Remind no-op: unable to resolve launchd remind state")
        return 0
    if not enabled:
        logger.info("Remind no-op: automation disabled")
        return 0

    phase = _run_applescript('tell application "Flow" to getPhase')
    logger.info("Current phase: %s", phase)
    if phase != "Flow":
        logger.info("Remind no-op: current phase is not Flow")
        _clear_flow_reminder_state()
        return 0

    try:
        conn = get_connection(readonly=True)
    except Exception as exc:
        logger.warning("Remind no-op: failed to read Flow DB state: %s", exc)
        return 0

    try:
        open_started_at = _latest_open_flow_started_at(conn)
    except Exception as exc:
        logger.warning("Remind no-op: failed to evaluate latest session row: %s", exc)
        return 0
    finally:
        conn.close()

    if open_started_at is None:
        logger.info("Remind no-op: latest session is not an open flow row")
        _clear_flow_reminder_state()
        return 0

    remaining_time = _run_applescript('tell application "Flow" to getTime')
    if remaining_time is None:
        logger.warning("Remind no-op: failed to read Flow remaining time")
        return 0
    remaining_time = remaining_time.strip()
    if not remaining_time:
        logger.warning("Remind no-op: Flow remaining time was empty")
        return 0

    state = _load_flow_reminder_state()
    previous_started_at = state.get("open_session_started_at")
    previous_remaining = state.get("remaining_time")
    previous_stagnant = int(state.get("stagnant_checks", 0))
    previous_last_reminded = state.get("last_reminded_epoch")

    next_state: FlowReminderState = {
        "open_session_started_at": open_started_at,
        "remaining_time": remaining_time,
        "stagnant_checks": 0,
        "last_reminded_epoch": (
            float(previous_last_reminded)
            if isinstance(previous_last_reminded, (int, float))
            else None
        ),
    }

    if previous_started_at != open_started_at:
        logger.info("Remind no-op: baseline reset for new/open Flow session")
        _save_flow_reminder_state(next_state)
        return 0

    if previous_remaining != remaining_time:
        logger.info(
            "Remind no-op: timer moved (%s -> %s)", previous_remaining, remaining_time
        )
        _save_flow_reminder_state(next_state)
        return 0

    stagnant_checks = max(0, previous_stagnant) + 1
    next_state["stagnant_checks"] = stagnant_checks

    if stagnant_checks < FLOW_REMINDER_STAGNANT_THRESHOLD:
        logger.info("Remind no-op: stagnant checks below threshold")
        _save_flow_reminder_state(next_state)
        return 0

    now_epoch = _now().timestamp()
    last_reminded = next_state.get("last_reminded_epoch")
    if isinstance(last_reminded, (int, float)):
        elapsed = now_epoch - float(last_reminded)
        if elapsed < FLOW_REMINDER_COOLDOWN_SECONDS:
            logger.info(
                "Remind no-op: cooldown active (%ss remaining)",
                int(FLOW_REMINDER_COOLDOWN_SECONDS - elapsed),
            )
            _save_flow_reminder_state(next_state)
            return 0

    if _run_applescript('tell application "Flow" to show') is None:
        logger.warning("Remind no-op: Flow show command failed")
        _save_flow_reminder_state(next_state)
        return 0

    next_state["last_reminded_epoch"] = now_epoch
    _save_flow_reminder_state(next_state)
    logger.info("Remind executed")
    return 0
