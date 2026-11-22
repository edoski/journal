import json
from collections.abc import Iterator
from pathlib import Path

import pytest

REAL_HOME = Path.home()


@pytest.fixture(autouse=True)
def private_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Keep per-user learning state, such as the workspace registry and the
    kept plan, out of the real home, for the whole test: a test that undid
    every patch (``monkeypatch.undo()``) read and wrote the real one."""
    home = tmp_path / "user-home"
    monkeypatch.setenv("HOME", str(home))
    for name in ("LEARNING_TODAY",):
        monkeypatch.delenv(name, raising=False)
    yield
    assert Path.home() != REAL_HOME, (
        "the test reached the real home: restore only your own patches "
        "(monkeypatch.context()), never monkeypatch.undo()"
    )


@pytest.fixture(scope="session", autouse=True)
def real_registry_untouched(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    """No test registers a course in his real registry, by any path: a
    subprocess given the real HOME, a patch undone, a home read before the
    fixture ran (round 19, carry-in 3: 8 pytest folders were registered in
    his real ``workspaces.json``)."""
    yield
    registry = REAL_HOME / "Library/Application Support/Learning/workspaces.json"
    base = tmp_path_factory.getbasetemp().parent
    try:
        listed = json.loads(registry.read_text(encoding="utf-8")).get("workspaces", {})
    except (OSError, ValueError, AttributeError):
        return
    strays = [w for w in listed if Path(w).is_relative_to(base)]
    assert not strays, (
        f"tests registered courses in the real registry {registry}: {strays}"
    )


@pytest.fixture
def every_day(monkeypatch: pytest.MonkeyPatch) -> None:
    """No study history to learn a week from: the plan studies every day and
    holds every review due, so a test of what a verb lists is not a test of
    the learner's week."""
    from learning import capacity

    monkeypatch.setattr(
        capacity, "of", lambda records, today: capacity.estimate({}, today)
    )
