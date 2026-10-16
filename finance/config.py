"""Finance paths and settings.

Paths follow the Journal layout: the finance folder sits under the Journal
support folder (`JOURNAL_SUPPORT_DIR`) unless `FINANCE_DIR` names another one.
`sync/config.py` resolves the same folder for the period notes; finance does
not import sync, so the rule is written in both places and a test keeps them
equal.

Personal values (the Enable Banking application id, the key path and the
banks read) live in `<finance dir>/finance.toml`, written by
`python -m finance setup`, never in the repository. Each bank has its own
consent file, `session-<bank key>.json`.
"""

from __future__ import annotations

import os
import re
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
SESSION_PREFIX = "session-"
RULES_FILE = "categories.toml"
LOCK_FILE = "fetch.lock"

_SETTINGS_KEYS = {"application_id", "key_path", "psu_type", "redirect_url", "bank"}
_BANK_KEYS = {"name", "country"}


class SettingsError(ValueError):
    """`finance.toml` is missing, unreadable or incomplete."""


def finance_dir(env: Mapping[str, str] | None = None) -> Path:
    """The finance folder, resolved from the environment at call time."""
    values = os.environ if env is None else env
    support = values.get("JOURNAL_SUPPORT_DIR", "~/Library/Application Support/Journal")
    default = os.path.join(support, "finance")
    return Path(os.path.expanduser(values.get("FINANCE_DIR", default)))


@dataclass(frozen=True)
class Bank:
    """A bank as Enable Banking names it (its ASPSP name and country)."""

    name: str
    country: str

    @property
    def key(self) -> str:
        """The bank in file names and store keys, e.g. `finecobank-it`."""
        slug = re.sub(r"[^a-z0-9]+", "-", f"{self.name}-{self.country}".lower())
        return slug.strip("-")


DEFAULT_BANK = Bank(DEFAULT_ASPSP_NAME, DEFAULT_ASPSP_COUNTRY)


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

    def session(self, bank: Bank) -> Path:
        """The consent file of one bank."""
        return self.root / f"{SESSION_PREFIX}{bank.key}.json"

    @property
    def rules(self) -> Path:
        return self.root / RULES_FILE

    @property
    def lock(self) -> Path:
        return self.root / LOCK_FILE


@dataclass(frozen=True)
class Settings:
    """The Enable Banking application and the banks it reads."""

    application_id: str
    key_path: Path
    banks: tuple[Bank, ...] = (DEFAULT_BANK,)
    psu_type: str = DEFAULT_PSU_TYPE
    redirect_url: str = DEFAULT_REDIRECT_URL

    def bank(self, name: str | None) -> Bank:
        """The bank called `name` (any case), or the only one when no name is given."""
        if name is None:
            if len(self.banks) == 1:
                return self.banks[0]
            names = ", ".join(f"'{bank.name}'" for bank in self.banks)
            raise SettingsError(f"say which bank with --bank: {names}")
        for bank in self.banks:
            if bank.name.casefold() == name.strip().casefold():
                return bank
        raise SettingsError(
            f"no bank called '{name}' in finance.toml; add it as a table:\n"
            f'[[bank]]\nname = "{name}"\ncountry = "IT"'
        )


def connect_command(settings: Settings, bank: Bank, command: str = COMMAND) -> str:
    """The command that (re)connects `bank`; `--bank` only when there are several."""
    if len(settings.banks) == 1:
        return f"{command} connect"
    return f"{command} connect --bank '{bank.name}'"


def bank_label(settings: Settings, bank: Bank) -> str:
    """The bank in messages: its name when several are read, otherwise "bank"."""
    return bank.name if len(settings.banks) > 1 else "bank"


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
    banks = _banks(paths, data.pop("bank", None))
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
        banks=banks,
        psu_type=values.get("psu_type", DEFAULT_PSU_TYPE),
        redirect_url=values.get("redirect_url", DEFAULT_REDIRECT_URL),
    )


def _banks(paths: Paths, items: object) -> tuple[Bank, ...]:
    """The `[[bank]]` tables; none means FinecoBank (IT)."""
    if items is None:
        return (DEFAULT_BANK,)
    if not isinstance(items, list) or not items:
        raise SettingsError(f"{paths.settings}: bank must be [[bank]] tables")
    banks: list[Bank] = []
    for item in items:
        if not isinstance(item, dict) or set(item) != _BANK_KEYS:
            raise SettingsError(
                f"{paths.settings}: each [[bank]] needs exactly name and country"
            )
        if not all(isinstance(value, str) and value.strip() for value in item.values()):
            raise SettingsError(
                f"{paths.settings}: a bank's name and country must be non-empty strings"
            )
        bank = Bank(item["name"].strip(), item["country"].strip().upper())
        if any(other.key == bank.key for other in banks):
            raise SettingsError(f"{paths.settings}: {bank.name} is listed twice")
        banks.append(bank)
    return tuple(banks)


def settings_text(application_id: str, key_path: str) -> str:
    """The `finance.toml` written by `setup`."""
    return (
        "# Enable Banking application read by `python -m finance`.\n"
        "# Optional keys: psu_type, redirect_url.\n"
        f"application_id = {_toml_string(application_id)}\n"
        f"key_path = {_toml_string(key_path)}\n"
        "\n"
        "# The banks read, one [[bank]] table each, after the keys above (name and\n"
        "# country as Enable Banking lists them). None means FinecoBank (IT).\n"
        "# [[bank]]\n"
        '# name = "FinecoBank"\n'
        '# country = "IT"\n'
    )


def _toml_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
