"""JSON-backed media cache adapter."""

from __future__ import annotations

import json
import os
from typing import cast

from sync.constants import MEDIA_CACHE_DIR, STATE_LOCK_DIR
from sync.contracts.cache import MediaDateCacheState
from sync.notes.locking import locked_path
from sync.ports.cache import MediaDateCacheStore


def _schema_error(path: str, detail: str) -> ValueError:
    return ValueError(
        f"Invalid cache schema in {path}: {detail}. Fix command: rm '{path}'"
    )


def _load_json_or_none(path: str) -> object | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return cast(object, json.load(handle))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        raise _schema_error(path, f"invalid JSON ({exc})") from exc


def _atomic_write_json(path: str, payload: object) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
    os.replace(tmp_path, path)


def _validate_title_to_date_map(
    raw: object, *, path: str, bucket: str
) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise _schema_error(path, f"{bucket} must be an object")

    validated: dict[str, str] = {}
    for title, date_value in raw.items():
        if not isinstance(title, str) or not title:
            raise _schema_error(path, f"{bucket} has invalid title key")
        if not isinstance(date_value, str) or not date_value:
            raise _schema_error(path, f"{bucket}.{title} must be a non-empty string")
        validated[title] = date_value

    return validated


def _validate_media_cache(raw: object, *, path: str) -> MediaDateCacheState:
    if not isinstance(raw, dict):
        raise _schema_error(path, "root payload must be an object")

    required = {"books", "podcasts"}
    if set(raw) != required:
        raise _schema_error(path, f"root must contain exactly {sorted(required)}")

    books = _validate_title_to_date_map(raw.get("books"), path=path, bucket="books")
    podcasts = _validate_title_to_date_map(
        raw.get("podcasts"), path=path, bucket="podcasts"
    )

    return {"books": books, "podcasts": podcasts}


class JsonMediaDateCacheStore(MediaDateCacheStore):
    """Filesystem-backed media date cache."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        self.cache_dir = cache_dir or MEDIA_CACHE_DIR
        self.lock_root = lock_root or STATE_LOCK_DIR
        self.path = os.path.join(self.cache_dir, "dates.json")

    def load(self) -> MediaDateCacheState:
        raw = _load_json_or_none(self.path)
        if raw is None:
            return {"books": {}, "podcasts": {}}
        return _validate_media_cache(raw, path=self.path)

    def save(self, state: MediaDateCacheState) -> None:
        validated = _validate_media_cache(state, path=self.path)
        with locked_path(self.path, lock_root=self.lock_root):
            _atomic_write_json(self.path, validated)
