"""A bank's consent: `session-<bank key>.json` (mode 600) in the finance folder.

It keeps the Enable Banking session id, the consent's `valid_until`, the
accounts with their per-session uid, `identification_hash` and IBAN, and two
pauses set by the fetch: `needs_reconsent` (only `connect` clears it) and
`rate_limited_until` (about 6 hours after a 429, per Enable Banking's FAQ).
"""

from __future__ import annotations

import datetime
import json
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

from finance.files import write_json

VERSION = 1


class SessionError(ValueError):
    """`session.json` exists but cannot be used."""


@dataclass(frozen=True)
class SessionAccount:
    uid: str
    identification_hash: str
    iban: str
    name: str
    currency: str


@dataclass(frozen=True)
class Session:
    session_id: str
    valid_until: datetime.datetime
    connected_at: datetime.datetime
    accounts: tuple[SessionAccount, ...]
    needs_reconsent: str | None = None
    needs_reconsent_since: datetime.datetime | None = None
    rate_limited_until: datetime.datetime | None = None
    aspsp: dict[str, str] = field(default_factory=dict)

    def expired(self, now: datetime.datetime) -> bool:
        return now >= self.valid_until

    def renewal_due(self, now: datetime.datetime) -> bool:
        """The consent has ended or ends today (local day): renewal is due, never
        earlier. A lapse loses nothing, the next fetch reaches back before the
        last booking."""
        return (
            self.needs_reconsent is not None
            or self.valid_until.astimezone().date() <= now.astimezone().date()
        )

    def paused(self, now: datetime.datetime) -> bool:
        return self.rate_limited_until is not None and now < self.rate_limited_until

    def flag_reconsent(self, reason: str, now: datetime.datetime) -> Session:
        return replace(self, needs_reconsent=reason, needs_reconsent_since=now)

    def pause(self, until: datetime.datetime) -> Session:
        return replace(self, rate_limited_until=until)

    def resume(self) -> Session:
        return replace(self, rate_limited_until=None)


def parse_instant(value: str) -> datetime.datetime:
    """An RFC 3339 instant; one without an offset is taken as UTC."""
    text = value.strip().replace("Z", "+00:00")
    instant = datetime.datetime.fromisoformat(text)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=datetime.UTC)
    return instant


def _instant_or_none(value: Any) -> datetime.datetime | None:
    return parse_instant(value) if isinstance(value, str) else None


def load_session(path: Path) -> Session | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SessionError(f"{path} cannot be read: {exc}") from exc
    try:
        if data.get("version") != VERSION:
            raise SessionError(f"{path}: unknown version {data.get('version')!r}")
        accounts = tuple(
            SessionAccount(
                uid=str(item["uid"]),
                identification_hash=str(item["identification_hash"]),
                iban=str(item.get("iban", "")),
                name=str(item.get("name", "")),
                currency=str(item.get("currency", "")),
            )
            for item in data["accounts"]
        )
        return Session(
            session_id=str(data["session_id"]),
            valid_until=parse_instant(data["valid_until"]),
            connected_at=parse_instant(data["connected_at"]),
            accounts=accounts,
            needs_reconsent=data.get("needs_reconsent"),
            needs_reconsent_since=_instant_or_none(data.get("needs_reconsent_since")),
            rate_limited_until=_instant_or_none(data.get("rate_limited_until")),
            aspsp=dict(data.get("aspsp", {})),
        )
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        if isinstance(exc, SessionError):
            raise
        raise SessionError(f"{path} is incomplete: {exc}") from exc


def save_session(path: Path, session: Session) -> None:
    def instant(value: datetime.datetime | None) -> str | None:
        return value.isoformat() if value else None

    write_json(
        path,
        {
            "version": VERSION,
            "session_id": session.session_id,
            "valid_until": session.valid_until.isoformat(),
            "connected_at": session.connected_at.isoformat(),
            "aspsp": session.aspsp,
            "accounts": [
                {
                    "uid": account.uid,
                    "identification_hash": account.identification_hash,
                    "iban": account.iban,
                    "name": account.name,
                    "currency": account.currency,
                }
                for account in session.accounts
            ],
            "needs_reconsent": session.needs_reconsent,
            "needs_reconsent_since": instant(session.needs_reconsent_since),
            "rate_limited_until": instant(session.rate_limited_until),
        },
    )
