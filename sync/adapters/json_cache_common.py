"""Shared JSON cache adapter helpers."""

from __future__ import annotations

import datetime
import json
import os
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Generic, Protocol, TypeVar, cast

from sync.notes.locking import locked_path

TState = TypeVar("TState")
TEntries = TypeVar("TEntries")
TState_co = TypeVar("TState_co", covariant=True)
TEntries_co = TypeVar("TEntries_co", covariant=True)


class StateValidator(Protocol[TState_co]):
    """Validate and normalize a JSON state payload."""

    def __call__(self, raw: object, *, path: str) -> TState_co: ...


class PerDateValidator(Protocol[TEntries_co]):
    """Validate and normalize a per-date JSON payload."""

    def __call__(self, raw: object, *, path: str, date_str: str) -> TEntries_co: ...


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


def path_for_date(cache_dir: str, date_str: str) -> str:
    return os.path.join(cache_dir, f"{date_str}.json")


def iter_cache_files(cache_dir: str) -> Iterator[tuple[str, str]]:
    if not os.path.isdir(cache_dir):
        return
    for name in os.listdir(cache_dir):
        if not name.endswith(".json"):
            continue
        yield name, os.path.join(cache_dir, name)


def prune_old_files(cache_dir: str, keep_days: int) -> None:
    if keep_days <= 0:
        return
    cutoff = datetime.date.today() - datetime.timedelta(days=keep_days - 1)
    for name, path in iter_cache_files(cache_dir):
        date_part = name[:-5]
        try:
            file_date = datetime.datetime.strptime(date_part, "%Y-%m-%d").date()
        except ValueError:
            continue
        if file_date < cutoff:
            try:
                os.remove(path)
            except OSError:
                pass


class JsonValidatedStateStore(Generic[TState]):
    """Generic JSON-backed state store with schema validation."""

    def __init__(
        self,
        *,
        path: str,
        lock_root: str,
        empty_state: Callable[[], TState],
        validator: StateValidator[TState],
    ) -> None:
        self.path = path
        self.lock_root = lock_root
        self._empty_state = empty_state
        self._validator = validator

    def load(self) -> TState:
        raw = load_json_or_none(self.path)
        if raw is None:
            return self._empty_state()
        return self._validator(raw, path=self.path)

    def save(self, state: TState) -> None:
        validated = self._validator(state, path=self.path)
        with locked_path(self.path, lock_root=self.lock_root):
            atomic_write_json(self.path, validated)

    @contextmanager
    def locked_state(self) -> Iterator[TState]:
        with locked_path(self.path, lock_root=self.lock_root):
            state = self.load()
            try:
                yield state
            finally:
                validated = self._validator(state, path=self.path)
                atomic_write_json(self.path, validated)


class JsonValidatedPerDateStore(Generic[TEntries]):
    """Generic JSON-backed per-date store with schema validation."""

    def __init__(
        self,
        *,
        cache_dir: str,
        lock_root: str,
        empty_entries: Callable[[], TEntries],
        validator: PerDateValidator[TEntries],
    ) -> None:
        self.cache_dir = cache_dir
        self.lock_root = lock_root
        self._empty_entries = empty_entries
        self._validator = validator

    def load_for_date(self, date_str: str) -> TEntries:
        path = path_for_date(self.cache_dir, date_str)
        with locked_path(path, lock_root=self.lock_root):
            raw = load_json_or_none(path)
        if raw is None:
            return self._empty_entries()
        return self._validator(raw, path=path, date_str=date_str)

    def save_for_date(self, date_str: str, entries: TEntries) -> None:
        path = path_for_date(self.cache_dir, date_str)
        payload = {"date": date_str, "entries": entries}
        validated_entries = self._validator(payload, path=path, date_str=date_str)
        with locked_path(path, lock_root=self.lock_root):
            atomic_write_json(path, {"date": date_str, "entries": validated_entries})

    def prune(self, *, keep_days: int) -> None:
        prune_old_files(self.cache_dir, keep_days)
