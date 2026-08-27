"""Flow skip/remind automation behavior."""

from __future__ import annotations

import datetime
import json
import os
import re
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypedDict
from typing import cast

from sync.config import PATHS, PathConfig
from sync.log import get_logger
from sync.study.constants import FLOW_APP_DEFAULTS_DOMAIN
from sync.study.repository import FlowSessionRepository

SKIP_LAUNCHD_LABEL = "com.edo.journal.skip"
SKIP_LAUNCHD_DOMAIN = f"gui/{os.geteuid()}"
SKIP_LAUNCHD_TARGET = f"{SKIP_LAUNCHD_DOMAIN}/{SKIP_LAUNCHD_LABEL}"
REMIND_LAUNCHD_LABEL = "com.edo.journal.remind"
REMIND_LAUNCHD_DOMAIN = f"gui/{os.geteuid()}"
REMIND_LAUNCHD_TARGET = f"{REMIND_LAUNCHD_DOMAIN}/{REMIND_LAUNCHD_LABEL}"
FLOW_REMINDER_STATE_FILENAME = "flow_reminder_state.json"
FLOW_REMINDER_COOLDOWN_SECONDS = 120
FLOW_REMINDER_STAGNANT_THRESHOLD = 1
FLOW_PAUSED_REMINDER_URL = "flowtitle://remind"

logger = get_logger(__name__)


class FlowReminderState(TypedDict, total=False):
    open_session_started_at: float | None
    remaining_time: str | None
    stagnant_checks: int
    last_reminded_epoch: float | None


@dataclass(frozen=True)
class FlowAutomationDeps:
    """Runtime dependencies for Flow skip/remind automation."""

    paths: PathConfig
    skip_launchd_label: str
    skip_launchd_domain: str
    skip_launchd_target: str
    remind_launchd_label: str
    remind_launchd_domain: str
    remind_launchd_target: str
    flow_reminder_state_filename: str
    flow_reminder_cooldown_seconds: int
    flow_reminder_stagnant_threshold: int
    repository: FlowSessionRepository
    run_launchctl: Callable[[list[str]], tuple[int, str, str]]
    run_applescript: Callable[[str], str | None]
    read_flow_duration_minutes: Callable[[], int | None]
    show_paused_reminder: Callable[[], bool]
    now: Callable[[], datetime.datetime]


def default_flow_automation_deps() -> FlowAutomationDeps:
    """Return the default runtime dependencies for Flow automation."""
    return FlowAutomationDeps(
        paths=PATHS,
        skip_launchd_label=SKIP_LAUNCHD_LABEL,
        skip_launchd_domain=SKIP_LAUNCHD_DOMAIN,
        skip_launchd_target=SKIP_LAUNCHD_TARGET,
        remind_launchd_label=REMIND_LAUNCHD_LABEL,
        remind_launchd_domain=REMIND_LAUNCHD_DOMAIN,
        remind_launchd_target=REMIND_LAUNCHD_TARGET,
        flow_reminder_state_filename=FLOW_REMINDER_STATE_FILENAME,
        flow_reminder_cooldown_seconds=FLOW_REMINDER_COOLDOWN_SECONDS,
        flow_reminder_stagnant_threshold=FLOW_REMINDER_STAGNANT_THRESHOLD,
        repository=FlowSessionRepository(),
        run_launchctl=_run_launchctl,
        run_applescript=_run_applescript,
        read_flow_duration_minutes=_read_flow_duration_minutes,
        show_paused_reminder=_show_flow_paused_reminder,
        now=_now,
    )


def _run_launchctl(args: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(
        ["launchctl", *args],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _skip_enabled_state(deps: FlowAutomationDeps | None = None) -> bool | None:
    resolved = deps or default_flow_automation_deps()
    code, stdout, stderr = resolved.run_launchctl(
        ["print-disabled", resolved.skip_launchd_domain]
    )
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.warning("Unable to read launchd skip state: %s", detail)
        return None

    match = re.search(
        rf'"{re.escape(resolved.skip_launchd_label)}"\s*=>\s*(true|false)',
        stdout,
    )
    if match is None:
        return True
    return match.group(1) == "false"


def _set_skip_enabled(
    enabled: bool,
    deps: FlowAutomationDeps | None = None,
) -> bool:
    resolved = deps or default_flow_automation_deps()
    command = "enable" if enabled else "disable"
    code, stdout, stderr = resolved.run_launchctl(
        [command, resolved.skip_launchd_target]
    )
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.error(
            "Failed to %s %s: %s",
            command,
            resolved.skip_launchd_target,
            detail,
        )
        return False
    return True


def _print_skip_status(enabled: bool) -> None:
    status = "ENABLED" if enabled else "DISABLED"
    print(f"Skip automation: {status}")


def _apply_skip_state(
    state: str,
    deps: FlowAutomationDeps | None = None,
) -> int:
    resolved = deps or default_flow_automation_deps()
    current = _skip_enabled_state(resolved)
    if current is None:
        print("Skip automation: UNKNOWN (launchd state unavailable)")
        return 1

    if state == "status":
        _print_skip_status(current)
        return 0

    if state != "toggle":
        raise ValueError(f"Unsupported skip state action: {state}")

    target = not current
    if not _set_skip_enabled(target, resolved):
        return 1

    updated = _skip_enabled_state(resolved)
    _print_skip_status(target if updated is None else updated)
    return 0


def _flow_reminder_state_path(deps: FlowAutomationDeps | None = None) -> str:
    resolved = deps or default_flow_automation_deps()
    return os.path.join(
        resolved.paths.state_dir,
        resolved.flow_reminder_state_filename,
    )


def _load_flow_reminder_state(
    deps: FlowAutomationDeps | None = None,
) -> FlowReminderState:
    path = _flow_reminder_state_path(deps)
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

    payload = cast(dict[str, object], raw)
    state: FlowReminderState = {}
    marker = payload.get("open_session_started_at")
    if isinstance(marker, (int, float)):
        state["open_session_started_at"] = float(marker)
    elif marker is None:
        state["open_session_started_at"] = None

    remaining = payload.get("remaining_time")
    if isinstance(remaining, str):
        state["remaining_time"] = remaining
    elif remaining is None:
        state["remaining_time"] = None

    stagnant = payload.get("stagnant_checks")
    if isinstance(stagnant, int):
        state["stagnant_checks"] = max(0, stagnant)

    reminded = payload.get("last_reminded_epoch")
    if isinstance(reminded, (int, float)):
        state["last_reminded_epoch"] = float(reminded)
    elif reminded is None:
        state["last_reminded_epoch"] = None
    return state


def _save_flow_reminder_state(
    state: FlowReminderState,
    deps: FlowAutomationDeps | None = None,
) -> None:
    path = _flow_reminder_state_path(deps)
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


def _clear_flow_reminder_state(deps: FlowAutomationDeps | None = None) -> None:
    path = _flow_reminder_state_path(deps)
    try:
        os.remove(path)
    except FileNotFoundError:
        return
    except (PermissionError, OSError) as exc:
        logger.warning("Failed to clear reminder state %s: %s", path, exc)


def _remind_enabled_state(deps: FlowAutomationDeps | None = None) -> bool | None:
    resolved = deps or default_flow_automation_deps()
    code, stdout, stderr = resolved.run_launchctl(
        ["print-disabled", resolved.remind_launchd_domain]
    )
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.warning("Unable to read launchd remind state: %s", detail)
        return None

    match = re.search(
        rf'"{re.escape(resolved.remind_launchd_label)}"\s*=>\s*(true|false)',
        stdout,
    )
    if match is None:
        return True
    return match.group(1) == "false"


def _set_remind_enabled(
    enabled: bool,
    deps: FlowAutomationDeps | None = None,
) -> bool:
    resolved = deps or default_flow_automation_deps()
    command = "enable" if enabled else "disable"
    code, stdout, stderr = resolved.run_launchctl(
        [command, resolved.remind_launchd_target]
    )
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.error(
            "Failed to %s %s: %s",
            command,
            resolved.remind_launchd_target,
            detail,
        )
        return False
    return True


def _print_remind_status(enabled: bool) -> None:
    status = "ENABLED" if enabled else "DISABLED"
    print(f"Remind automation: {status}")


def _apply_remind_state(
    state: str,
    deps: FlowAutomationDeps | None = None,
) -> int:
    resolved = deps or default_flow_automation_deps()
    current = _remind_enabled_state(resolved)
    if current is None:
        print("Remind automation: UNKNOWN (launchd state unavailable)")
        return 1

    if state == "status":
        _print_remind_status(current)
        return 0

    if state != "toggle":
        raise ValueError(f"Unsupported remind state action: {state}")

    target = not current
    if not _set_remind_enabled(target, resolved):
        return 1

    updated = _remind_enabled_state(resolved)
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


def _read_flow_duration_minutes() -> int | None:
    try:
        output = subprocess.check_output(
            [
                "defaults",
                "read",
                FLOW_APP_DEFAULTS_DOMAIN,
                "flow.durationInMinutes",
            ],
            text=True,
        )
        value = int(output.strip())
        return value if value > 0 else None
    except (
        subprocess.CalledProcessError,
        FileNotFoundError,
        PermissionError,
        OSError,
        ValueError,
    ):
        return None


def _show_flow_paused_reminder() -> bool:
    try:
        result = subprocess.run(
            ["/usr/bin/open", "-g", FLOW_PAUSED_REMINDER_URL],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        logger.error("Failed to open Flow paused reminder: %s", exc)
        return False

    if result.returncode == 0:
        return True

    detail = (
        result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
    )
    logger.error("Failed to open Flow paused reminder: %s", detail)
    return False


def _now() -> datetime.datetime:
    return datetime.datetime.now()


def _remaining_seconds(value: str) -> int | None:
    parts = value.strip().split(":")
    if len(parts) not in (2, 3):
        return None
    try:
        numbers = [int(part) for part in parts]
    except ValueError:
        return None
    if any(number < 0 for number in numbers):
        return None
    total = 0
    for number in numbers:
        total = total * 60 + number
    return total


def _live_flow_has_progress(
    remaining_time: str,
    deps: FlowAutomationDeps,
) -> bool:
    remaining = _remaining_seconds(remaining_time)
    duration_minutes = deps.read_flow_duration_minutes()
    if remaining is None or duration_minutes is None:
        return False
    return remaining < duration_minutes * 60


def run_session_skip(
    state: str | None = None,
    *,
    deps: FlowAutomationDeps | None = None,
) -> int:
    resolved = deps or default_flow_automation_deps()
    if state is not None:
        return _apply_skip_state(state, resolved)

    enabled = _skip_enabled_state(resolved)
    if enabled is None:
        logger.warning("Skip no-op: unable to resolve launchd skip state")
        return 0
    if not enabled:
        logger.info("Skip no-op: automation disabled")
        return 0

    phase = resolved.run_applescript('tell application "Flow" to getPhase')
    logger.info("Current phase: %s", phase)
    if phase != "Flow":
        logger.info("Skip no-op: current phase is not Flow")
        return 0

    try:
        open_started_at = resolved.repository.latest_open_flow_started_at()
    except Exception as exc:
        logger.warning("Failed to evaluate latest session row: %s", exc)
        open_started_at = None

    if open_started_at is None:
        remaining_time = resolved.run_applescript('tell application "Flow" to getTime')
        if remaining_time is None or not _live_flow_has_progress(
            remaining_time,
            resolved,
        ):
            logger.info("Skip no-op: no active Flow session")
            return 0
        logger.info("Open Flow row absent; using live timer progress")

    if resolved.run_applescript('tell application "Flow" to skip') is None:
        logger.warning("Skip no-op: Flow skip command failed")
        return 0
    if resolved.run_applescript('tell application "Flow" to start') is None:
        logger.warning("Skip no-op: Flow start command failed after skip")
        return 0
    if resolved.run_applescript('tell application "Flow" to show') is None:
        logger.warning("Skip no-op: Flow show command failed after skip/start")
        return 0

    logger.info("Skip executed")
    return 0


def run_session_remind(
    state: str | None = None,
    *,
    deps: FlowAutomationDeps | None = None,
) -> int:
    resolved = deps or default_flow_automation_deps()
    if state is not None:
        return _apply_remind_state(state, resolved)

    enabled = _remind_enabled_state(resolved)
    if enabled is None:
        logger.warning("Remind no-op: unable to resolve launchd remind state")
        return 0
    if not enabled:
        logger.info("Remind no-op: automation disabled")
        return 0

    phase = resolved.run_applescript('tell application "Flow" to getPhase')
    logger.info("Current phase: %s", phase)
    if phase != "Flow":
        logger.info("Remind no-op: current phase is not Flow")
        _clear_flow_reminder_state(resolved)
        return 0

    remaining_time = resolved.run_applescript('tell application "Flow" to getTime')
    if remaining_time is None:
        logger.warning("Remind no-op: failed to read Flow remaining time")
        return 0
    remaining_time = remaining_time.strip()
    if not remaining_time:
        logger.warning("Remind no-op: Flow remaining time was empty")
        return 0

    try:
        open_started_at = resolved.repository.latest_open_flow_started_at()
    except Exception as exc:
        logger.warning("Failed to evaluate latest session row: %s", exc)
        open_started_at = None

    if open_started_at is None and not _live_flow_has_progress(
        remaining_time,
        resolved,
    ):
        logger.info("Remind no-op: no active Flow session")
        _clear_flow_reminder_state(resolved)
        return 0
    elif open_started_at is None:
        logger.info("Open Flow row absent; using live timer progress")

    reminder_state = _load_flow_reminder_state(resolved)
    previous_started_at = reminder_state.get("open_session_started_at")
    previous_remaining = reminder_state.get("remaining_time")
    previous_stagnant = int(reminder_state.get("stagnant_checks", 0))
    previous_last_reminded = reminder_state.get("last_reminded_epoch")

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
        _save_flow_reminder_state(next_state, resolved)
        return 0

    if previous_remaining != remaining_time:
        logger.info(
            "Remind no-op: timer moved (%s -> %s)", previous_remaining, remaining_time
        )
        _save_flow_reminder_state(next_state, resolved)
        return 0

    stagnant_checks = max(0, previous_stagnant) + 1
    next_state["stagnant_checks"] = stagnant_checks

    if stagnant_checks < resolved.flow_reminder_stagnant_threshold:
        logger.info("Remind no-op: stagnant checks below threshold")
        _save_flow_reminder_state(next_state, resolved)
        return 0

    now_epoch = resolved.now().timestamp()
    last_reminded = next_state.get("last_reminded_epoch")
    if isinstance(last_reminded, (int, float)):
        elapsed = now_epoch - float(last_reminded)
        if elapsed < resolved.flow_reminder_cooldown_seconds:
            logger.info(
                "Remind no-op: cooldown active (%ss remaining)",
                int(resolved.flow_reminder_cooldown_seconds - elapsed),
            )
            _save_flow_reminder_state(next_state, resolved)
            return 0

    if not resolved.show_paused_reminder():
        logger.warning("Remind no-op: paused reminder failed")
        _save_flow_reminder_state(next_state, resolved)
        return 0

    next_state["last_reminded_epoch"] = now_epoch
    _save_flow_reminder_state(next_state, resolved)
    logger.info("Remind executed")
    return 0
