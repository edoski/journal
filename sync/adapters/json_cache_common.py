"""Shared JSON cache adapter helpers."""

from __future__ import annotations

import json
import os
from typing import cast


def schema_error(path: str, detail: str) -> ValueError:
    return ValueError(
        f"Invalid cache schema in {path}: {detail}. Fix command: rm '{path}'"
    )


def load_json_or_none(path: str) -> object | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return cast(object, json.load(handle))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        raise schema_error(path, f"invalid JSON ({exc})") from exc


def atomic_write_json(path: str, payload: object) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
    os.replace(tmp_path, path)
