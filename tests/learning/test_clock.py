from datetime import date, datetime, timezone
import time
from collections.abc import Iterator
from typing import Any

import pytest

from learning import clock


@pytest.fixture
def rome(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("TZ", "Europe/Rome")
    time.tzset()
    yield
    monkeypatch.undo()
    time.tzset()


class _Winter(datetime):
    @classmethod
    def now(cls, tz: Any = None) -> Any:
        return datetime(2026, 1, 15, 22, 30, tzinfo=timezone.utc)


@pytest.mark.usefixtures("rome")
@pytest.mark.parametrize(
    ("pinned", "expected"),
    [
        ("2026-07-15", datetime(2026, 7, 15, 21, 30, tzinfo=timezone.utc)),
        ("2026-01-20", datetime(2026, 1, 20, 22, 30, tzinfo=timezone.utc)),
    ],
)
def test_a_pinned_day_keeps_the_local_time_of_day(
    monkeypatch: pytest.MonkeyPatch, pinned: str, expected: datetime
) -> None:
    monkeypatch.setattr(clock, "datetime", _Winter)
    monkeypatch.setenv(clock.TODAY_VARIABLE, pinned)
    now = clock.now()
    assert now == expected
    assert clock.local_day(now.isoformat()) == date.fromisoformat(pinned)
    assert clock.today() == date.fromisoformat(pinned)


def test_unpinned_clock_is_the_real_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(clock.TODAY_VARIABLE, raising=False)
    assert clock.today() == date.today()
    assert clock.now().tzinfo is timezone.utc
    monkeypatch.setenv(clock.TODAY_VARIABLE, "10/04/2026")
    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        clock.today()
