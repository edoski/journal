"""One byte-budget packer for every bounded projection the agent receives."""

from __future__ import annotations

from collections.abc import Callable, Sequence
import json
from typing import Any, TypeVar

T = TypeVar("T")
R = TypeVar("R")


def size(value: Any) -> int:
    """Serialized UTF-8 byte size, the unit of every learning budget."""
    return len(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )


def pack(
    items: Sequence[T],
    budget: int | None,
    render: Callable[[list[T]], R],
    *,
    contiguous: bool = False,
    error: str = "budget must fit the empty selection",
) -> tuple[list[T], list[T], R]:
    """Greedily keep items, in order, while the rendered whole fits the budget.

    ``render`` builds the complete projection for a selection, so envelopes and
    already-included material are counted exactly. Items are never clipped: one
    that does not fit is omitted whole. ``contiguous`` stops at the first miss,
    which paged results need so that offsets stay meaningful. A ``None`` budget
    keeps everything. Returns the kept items, the omitted items and the result.
    """
    if budget is None:
        selected = list(items)
        return selected, [], render(selected)
    kept: list[T] = []
    omitted: list[T] = []
    result = render(kept)
    if type(budget) is not int or size(result) > budget:
        raise ValueError(error)
    for index, item in enumerate(items):
        candidate = render([*kept, item])
        if size(candidate) <= budget:
            kept.append(item)
            result = candidate
            continue
        omitted.append(item)
        if contiguous:
            omitted.extend(items[index + 1 :])
            break
    return kept, omitted, result


def fit(
    items: Sequence[T],
    budget: int,
    render: Callable[[list[T], list[T]], R],
    *,
    error: str = "budget must fit the omission descriptors",
) -> R:
    """Pack whole items and always render the omitted ones as descriptors."""
    kept: list[T] = []
    omitted = list(items)
    result = render(kept, omitted)
    if type(budget) is not int or size(result) > budget:
        raise ValueError(error)
    for item in items:
        candidate = render(
            [*kept, item], [other for other in omitted if other is not item]
        )
        if size(candidate) <= budget:
            kept.append(item)
            omitted = [other for other in omitted if other is not item]
            result = candidate
    return result
