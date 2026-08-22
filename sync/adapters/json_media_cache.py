"""JSON-backed media cache adapter."""

from __future__ import annotations

import os
from typing import cast

from sync.constants import LOCK_DIR, MEDIA_CACHE_DIR
from sync.contracts.cache import MediaDateCacheState
from sync.ports.cache import MediaDateCacheStore

from .json_cache_common import JsonValidatedStateStore, schema_error


def _validate_title_to_date_map(
    raw: object, *, path: str, bucket: str
) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise schema_error(path, f"{bucket} must be an object")
    payload = cast(dict[str, object], raw)

    validated: dict[str, str] = {}
    for title, date_value in payload.items():
        if not title:
            raise schema_error(path, f"{bucket} has invalid title key")
        if not isinstance(date_value, str) or not date_value:
            raise schema_error(path, f"{bucket}.{title} must be a non-empty string")
        validated[title] = date_value

    return validated


def _validate_media_cache(raw: object, *, path: str) -> MediaDateCacheState:
    if not isinstance(raw, dict):
        raise schema_error(path, "root payload must be an object")
    payload = cast(dict[str, object], raw)

    required = {"books", "podcasts"}
    if set(payload) != required:
        raise schema_error(path, f"root must contain exactly {sorted(required)}")

    books = _validate_title_to_date_map(
        payload.get("books"),
        path=path,
        bucket="books",
    )
    podcasts = _validate_title_to_date_map(
        payload.get("podcasts"),
        path=path,
        bucket="podcasts",
    )

    return {"books": books, "podcasts": podcasts}


class JsonMediaDateCacheStore(
    JsonValidatedStateStore[MediaDateCacheState],
    MediaDateCacheStore,
):
    """Filesystem-backed media date cache."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        self.cache_dir = cache_dir or MEDIA_CACHE_DIR
        super().__init__(
            path=os.path.join(self.cache_dir, "dates.json"),
            lock_root=lock_root or LOCK_DIR,
            empty_state=lambda: {"books": {}, "podcasts": {}},
            validator=_validate_media_cache,
        )
