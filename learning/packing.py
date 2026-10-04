"""Byte budgets: serialized sizes and one linear packer of whole entries."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
import json
from typing import Any

EMPTY_OBJECT = 2
SMALLEST_ENTRY = len('"":0')


def size(value: Any) -> int:
    """Compact UTF-8 JSON size, the unit of every learning budget."""
    return len(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )


@dataclass
class Packed:
    """Kept entries in offer order, the keys left out, and the bytes used."""

    items: dict[str, Any] = field(default_factory=dict)
    omitted: list[str] = field(default_factory=list)
    used: int = EMPTY_OBJECT


def pack(groups: Iterable[Sequence[tuple[str, Any]]], budget: int) -> Packed:
    """Keep whole groups of entries, in order, while their JSON object fits ``budget``.

    The object ``{"k":v,...}`` costs two braces, each ``"k":v`` entry and a comma
    between entries, so every entry is measured once and the running total is
    exact. A group shares bytes with entries already kept (an observation and its
    correction partners), never splits, and is omitted whole when it does not
    fit; later, smaller groups may still fit.
    """
    if type(budget) is not int or budget < EMPTY_OBJECT:
        raise ValueError(f"budget must be at least {EMPTY_OBJECT} bytes")
    packed = Packed()
    sizes: dict[str, int] = {}
    left_out: dict[str, None] = {}
    for group in groups:
        fresh: dict[str, Any] = {}
        for key, value in group:
            if key not in packed.items:
                fresh.setdefault(key, value)
        if not fresh:
            continue
        room = budget - packed.used
        cost = len(fresh) - (0 if packed.items else 1)
        for key, value in fresh.items():
            if room < cost + SMALLEST_ENTRY:
                cost = room + 1
                break
            if key not in sizes:
                sizes[key] = size(key) + 1 + size(value)
            cost += sizes[key]
        if cost <= room:
            packed.items.update(fresh)
            packed.used += cost
        else:
            left_out.update(dict.fromkeys(fresh))
    packed.omitted = [key for key in left_out if key not in packed.items]
    return packed
