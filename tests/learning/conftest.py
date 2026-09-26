from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def private_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep per-user learning state, such as workspace links, out of the real home."""
    monkeypatch.setenv("HOME", str(tmp_path / "user-home"))
