"""JSON-backed media cache adapter."""

from __future__ import annotations

import json
import os
from typing import Any

from sync.constants import MEDIA_CACHE_DIR, STATE_LOCK_DIR
from sync.contracts.cache import MediaDateCacheState
from sync.notes.locking import locked_path
from sync.ports.cache import MediaDateCacheStore


def _safe_load_json(path: str, default: Any) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _atomic_write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
    os.replace(tmp_path, path)


def _normalize_media_cache(raw: Any) -> MediaDateCacheState:
    if not isinstance(raw, dict):
        return {"podcasts": {}, "books": {}}

    podcasts_raw = raw.get("podcasts")
    books_raw = raw.get("books")

    podcasts = (
        {
            title: date_str
            for title, date_str in podcasts_raw.items()
            if isinstance(title, str)
            and title
            and isinstance(date_str, str)
            and date_str
        }
        if isinstance(podcasts_raw, dict)
        else {}
    )

    books = (
        {
            title: date_str
            for title, date_str in books_raw.items()
            if isinstance(title, str)
            and title
            and isinstance(date_str, str)
            and date_str
        }
        if isinstance(books_raw, dict)
        else {}
    )

    return {"podcasts": podcasts, "books": books}


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
        raw = _safe_load_json(self.path, None)
        return _normalize_media_cache(raw)

    def save(self, state: MediaDateCacheState) -> None:
        normalized = _normalize_media_cache(state)
        with locked_path(self.path, lock_root=self.lock_root):
            _atomic_write_json(self.path, normalized)
