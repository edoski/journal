from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def private_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep per-user learning state, such as the workspace registry, out of the real home."""
    monkeypatch.setenv("HOME", str(tmp_path / "user-home"))
    for name in ("LEARNING_TODAY",):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def every_day(monkeypatch: pytest.MonkeyPatch) -> None:
    """No study history to learn a week from: the plan studies every day and
    holds every review due, so a test of what a verb lists is not a test of
    the learner's week."""
    from learning import capacity

    monkeypatch.setattr(
        capacity, "of", lambda records, today: capacity.estimate({}, today)
    )
