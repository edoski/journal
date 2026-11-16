"""Work one read of the daily plan repeats, done once.

The plan replays every day back to the last one that began afresh
(``agenda.replay``), and each day reads every course's history again: his
week (``capacity.activity``, ``capacity.estimate``) and each topic's verdicts
(``progress.replays``), mostly on the same records (round 12: L1's replay made
``resume`` and ``plan`` four times slower, 0.35 to 1.4 s a course, and every
tutor turn waits on them). Within one read (``scope``) each of these pure
functions keeps what it found for the input it was given, by that input's
content, so the same history is read once; outside a read nothing is kept,
and nothing outlives the read, so nothing is stored between reads.
"""

from __future__ import annotations

from collections.abc import Callable, Hashable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
import json
from typing import Any, TypeVar

T = TypeVar("T")

_found: ContextVar[dict[Hashable, Any] | None] = ContextVar("memo", default=None)


@contextmanager
def scope() -> Iterator[None]:
    """One read: what the functions below find is kept until it ends. A read
    within a read shares the outer one."""
    if _found.get() is not None:
        yield
        return
    token = _found.set({})
    try:
        yield
    finally:
        _found.reset(token)


def once(name: str, key: Hashable, compute: Callable[[], T]) -> T:
    """``compute()``, or what it gave for ``key`` earlier in this read. The
    result is shared, so a caller must not change it."""
    found = _found.get()
    if found is None:
        return compute()
    slot = (name, key)
    if slot not in found:
        found[slot] = compute()
    result: T = found[slot]
    return result


def active() -> bool:
    """Whether a read is under way, so a key is worth making."""
    return _found.get() is not None


def content(value: dict[str, Any]) -> str:
    """A record as a key: its whole content, read once per record in a read
    (the record is kept with it, so its identity stays its own)."""
    found = _found.get()
    if found is None:
        return json.dumps(value, sort_keys=True, default=str)
    slot = ("content", id(value))
    if slot not in found or found[slot][0] is not value:
        found[slot] = (value, json.dumps(value, sort_keys=True, default=str))
    text: str = found[slot][1]
    return text
