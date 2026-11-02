"""Fake Chrome, notifications and clock for tests: no osascript, no waiting."""

from __future__ import annotations

from dataclasses import dataclass, field

from finance.desktop import BrowserUnavailable


@dataclass
class FakeChrome:
    """Scripted tab lists, one per read; the last one repeats."""

    reads: list[list[str]] = field(default_factory=list)
    # When set, open() or tab_urls() raises BrowserUnavailable with it.
    cannot_open: str | None = None
    cannot_read: str | None = None
    opened: list[str] = field(default_factory=list)
    closed: list[str] = field(default_factory=list)
    read_count: int = 0

    def open(self, url: str) -> None:
        if self.cannot_open is not None:
            raise BrowserUnavailable(self.cannot_open)
        self.opened.append(url)

    def tab_urls(self) -> list[str]:
        if self.cannot_read is not None:
            raise BrowserUnavailable(self.cannot_read)
        self.read_count += 1
        if not self.reads:
            return []
        return self.reads.pop(0) if len(self.reads) > 1 else self.reads[0]

    def close_tab(self, url: str) -> None:
        self.closed.append(url)


NO_CHROME = "Google Chrome cannot be opened (is it installed?)"


def no_chrome() -> FakeChrome:
    return FakeChrome(cannot_open=NO_CHROME)


@dataclass
class FakeNotifier:
    messages: list[str] = field(default_factory=list)

    def notify(self, message: str) -> None:
        self.messages.append(message)


@dataclass
class FakeClock:
    """A monotonic clock that sleeping advances."""

    seconds: float = 0.0
    sleeps: int = 0

    def monotonic(self) -> float:
        return self.seconds

    def sleep(self, seconds: float) -> None:
        self.sleeps += 1
        self.seconds += seconds
