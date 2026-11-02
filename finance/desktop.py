"""Google Chrome and macOS notifications, for renewing a bank's consent.

`connect` and the fetch's renewal use them through `Browser` and `Notifier`;
tests pass fakes. `Chrome` opens a link with `open -a` (no permission needed)
and reads or closes tabs with AppleScript through `osascript`. macOS asks once
whether Journal may control Google Chrome (the Automation permission): Journal.app
runs `--finance` commands as a process responsible for itself, so the
permission is Journal's whether the command runs from launchd or a terminal.
Tab reading never launches Chrome: with Chrome closed there are no tabs.
"""

from __future__ import annotations

import subprocess
import sys
from typing import Protocol

CHROME = "Google Chrome"
OPEN = "/usr/bin/open"
OSASCRIPT = "/usr/bin/osascript"
# The first tab read waits here while macOS asks for the Automation permission.
APPLESCRIPT_TIMEOUT_SECONDS = 120
# errAEEventNotPermitted: the Automation permission was denied.
NOT_PERMITTED = "-1743"
NOTIFICATION_TITLE = "Journal"

_TAB_URLS = """
on run
    if application "Google Chrome" is not running then return ""
    tell application "Google Chrome"
        set found to {}
        repeat with aWindow in windows
            repeat with aTab in tabs of aWindow
                set end of found to URL of aTab
            end repeat
        end repeat
    end tell
    set AppleScript's text item delimiters to linefeed
    return found as text
end run
"""

_CLOSE_TAB = """
on run argv
    if application "Google Chrome" is not running then return
    tell application "Google Chrome"
        repeat with aWindow in (get windows)
            repeat with aTab in (get tabs of aWindow)
                if URL of aTab is (item 1 of argv) then
                    close aTab
                    return
                end if
            end repeat
        end repeat
    end tell
end run
"""

_NOTIFY = """
on run argv
    display notification (item 2 of argv) with title (item 1 of argv)
end run
"""


class BrowserUnavailable(RuntimeError):
    """Chrome cannot be opened or read; the message says why."""


class Browser(Protocol):
    def open(self, url: str) -> None:
        """Open `url` in a new tab; raise BrowserUnavailable if it cannot."""

    def tab_urls(self) -> list[str]:
        """Every open tab's address; raise BrowserUnavailable if they cannot be read."""

    def close_tab(self, url: str) -> None:
        """Close the first tab showing `url`; never raises."""


class Notifier(Protocol):
    def notify(self, message: str) -> None:
        """Post a notification; never raises."""


def _osascript(script: str, *args: str) -> str:
    try:
        done = subprocess.run(
            [OSASCRIPT, "-", *args],
            input=script,
            capture_output=True,
            text=True,
            timeout=APPLESCRIPT_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise BrowserUnavailable(
            f"{CHROME} did not answer within {APPLESCRIPT_TIMEOUT_SECONDS} seconds"
        ) from None
    except OSError as exc:
        raise BrowserUnavailable(f"osascript cannot run: {exc}") from exc
    if done.returncode != 0:
        detail = done.stderr.strip() or f"exit {done.returncode}"
        if NOT_PERMITTED in detail:
            raise BrowserUnavailable(
                f"Journal may not control {CHROME}: allow it in System Settings > "
                "Privacy & Security > Automation > Journal"
            )
        raise BrowserUnavailable(f"osascript failed: {detail}")
    return done.stdout


class Chrome:
    """Google Chrome, driven by `open` and AppleScript."""

    def open(self, url: str) -> None:
        try:
            done = subprocess.run(
                [OPEN, "-a", CHROME, url],
                capture_output=True,
                text=True,
                timeout=APPLESCRIPT_TIMEOUT_SECONDS,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise BrowserUnavailable(f"{CHROME} cannot be opened: {exc}") from exc
        if done.returncode != 0:
            raise BrowserUnavailable(
                f"{CHROME} cannot be opened (is it installed?): "
                f"{done.stderr.strip() or f'exit {done.returncode}'}"
            )

    def tab_urls(self) -> list[str]:
        return [line for line in _osascript(_TAB_URLS).splitlines() if line]

    def close_tab(self, url: str) -> None:
        try:
            _osascript(_CLOSE_TAB, url)
        except BrowserUnavailable as exc:
            print(f"finance: the Chrome tab was not closed: {exc}", file=sys.stderr)


class MacNotifier:
    """Notifications through `osascript display notification`."""

    def notify(self, message: str) -> None:
        try:
            _osascript(_NOTIFY, NOTIFICATION_TITLE, message)
        except BrowserUnavailable as exc:
            print(f"finance: notification not shown: {exc}", file=sys.stderr)
