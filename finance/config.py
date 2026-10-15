"""Finance paths and settings.

Paths follow the Journal layout: the finance folder sits under the Journal
support folder (`JOURNAL_SUPPORT_DIR`) unless `FINANCE_DIR` names another one.
`sync/config.py` resolves the same folder for the period notes; finance does
not import sync, so the rule is written in both places and a test keeps them
equal.

Personal values (the Enable Banking application id and the key path) live in
`<finance dir>/finance.toml`, written by `python -m finance setup`, never in
the repository.
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path
from collections.abc import Mapping

# How the user runs this package: Journal.app bundles it (`python -m finance` in a checkout).
COMMAND = "/Applications/Journal.app/Contents/MacOS/Journal --finance"

API_ORIGIN = "https://api.enablebanking.com"
JWT_ISSUER = "enablebanking.com"
JWT_AUDIENCE = "api.enablebanking.com"
DEFAULT_ASPSP_NAME = "FinecoBank"
DEFAULT_ASPSP_COUNTRY = "IT"
DEFAULT_PSU_TYPE = "personal"
DEFAULT_REDIRECT_URL = "https://localhost/enablebanking/callback"

SETTINGS_FILE = "finance.toml"
STORE_FILE = "finance.sqlite3"
SESSION_FILE = "session.json"
RULES_FILE = "categories.toml"
LOCK_FILE = "fetch.lock"

_SETTINGS_KEYS = {
    "application_id",
    "key_path",
    "aspsp_name",
    "aspsp_country",
    "psu_type",
    "redirect_url",
}


class SettingsError(ValueError):
    """`finance.toml` is missing, unreadable or incomplete."""


def finance_dir(env: Mapping[str, str] | None = None) -> Path:
    """The finance folder, resolved from the environment at call time."""
    values = os.environ if env is None else env
    support = values.get("JOURNAL_SUPPORT_DIR", "~/Library/Application Support/Journal")
    default = os.path.join(support, "finance")
    return Path(os.path.expanduser(values.get("FINANCE_DIR", default)))


@dataclass(frozen=True)
class Paths:
    """Files inside one finance folder."""

    root: Path

    @property
    def settings(self) -> Path:
        return self.root / SETTINGS_FILE

    @property
    def store(self) -> Path:
        return self.root / STORE_FILE

    @property
    def session(self) -> Path:
        return self.root / SESSION_FILE

    @property
    def rules(self) -> Path:
        return self.root / RULES_FILE

    @property
    def lock(self) -> Path:
        return self.root / LOCK_FILE


@dataclass(frozen=True)
class Settings:
    """The Enable Banking application and the bank it reads."""

    application_id: str
    key_path: Path
    aspsp_name: str = DEFAULT_ASPSP_NAME
    aspsp_country: str = DEFAULT_ASPSP_COUNTRY
    psu_type: str = DEFAULT_PSU_TYPE
    redirect_url: str = DEFAULT_REDIRECT_URL


def load_settings(paths: Paths) -> Settings:
    """Read `finance.toml`, rejecting unknown or missing keys."""
    try:
        with paths.settings.open("rb") as handle:
            data = tomllib.load(handle)
    except FileNotFoundError:
        raise SettingsError(
            f"{paths.settings} is missing: run `{COMMAND} setup "
            "--application-id ID --key PATH` first"
        ) from None
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise SettingsError(f"{paths.settings}: {exc}") from exc
    unknown = sorted(set(data) - _SETTINGS_KEYS)
    if unknown:
        raise SettingsError(f"{paths.settings}: unknown keys {', '.join(unknown)}")
    values: dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(value, str) or not value.strip():
            raise SettingsError(f"{paths.settings}: {key} must be a non-empty string")
        values[key] = value.strip()
    for key in ("application_id", "key_path"):
        if key not in values:
            raise SettingsError(f"{paths.settings}: {key} is missing")
    return Settings(
        application_id=values["application_id"],
        key_path=Path(os.path.expanduser(values["key_path"])),
        aspsp_name=values.get("aspsp_name", DEFAULT_ASPSP_NAME),
        aspsp_country=values.get("aspsp_country", DEFAULT_ASPSP_COUNTRY),
        psu_type=values.get("psu_type", DEFAULT_PSU_TYPE),
        redirect_url=values.get("redirect_url", DEFAULT_REDIRECT_URL),
    )


def settings_text(application_id: str, key_path: str) -> str:
    """The `finance.toml` written by `setup`."""
    return (
        "# Enable Banking application read by `python -m finance`.\n"
        "# Optional keys: aspsp_name, aspsp_country, psu_type, redirect_url.\n"
        f"application_id = {_toml_string(application_id)}\n"
        f"key_path = {_toml_string(key_path)}\n"
    )


def _toml_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
