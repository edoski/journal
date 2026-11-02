from __future__ import annotations

import datetime
import subprocess
from pathlib import Path

import pytest

from finance.config import DEFAULT_BANK, Bank, Paths, Settings, settings_text
from finance.session import Session, SessionAccount, save_session


@pytest.fixture(scope="session")
def rsa_key(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A throwaway RSA key made for the tests (never the real one)."""
    path = tmp_path_factory.mktemp("key") / "throwaway.pem"
    subprocess.run(
        ["/usr/bin/openssl", "genrsa", "-out", str(path), "2048"],
        check=True,
        capture_output=True,
    )
    return path


@pytest.fixture
def paths(tmp_path: Path) -> Paths:
    return Paths(tmp_path / "finance")


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(application_id="test-app-id", key_path=tmp_path / "no-key.pem")


NOW = datetime.datetime(2026, 10, 20, 7, 30, tzinfo=datetime.UTC)
TODAY = datetime.date(2026, 10, 20)


def connected(
    paths: Paths,
    *accounts: SessionAccount,
    bank: Bank = DEFAULT_BANK,
    **changes: object,
) -> Session:
    """A stored session for `bank`, and a finance.toml when there is none yet."""
    if not paths.settings.exists():
        paths.root.mkdir(parents=True, exist_ok=True)
        paths.settings.write_text(settings_text("test-app-id", "/no-key.pem"))
    session = Session(
        session_id="session-1",
        valid_until=datetime.datetime(2027, 4, 11, 10, tzinfo=datetime.UTC),
        connected_at=NOW - datetime.timedelta(days=5),
        accounts=accounts
        or (
            SessionAccount(
                "uid-1", "hash-1", "IT00X0000000000000000000000", "ROSSI MARIO", "EUR"
            ),
        ),
    )
    for key, value in changes.items():
        object.__setattr__(session, key, value)
    save_session(paths.session(bank), session)
    return session
