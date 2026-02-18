"""Shared typed dispatch helpers for writer APIs."""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

Renderer = Callable[[object], list[str]]
SpecT = TypeVar("SpecT")


def typed_renderer(
    spec_type: type[SpecT], fn: Callable[[SpecT], list[str]]
) -> Renderer:
    """Wrap a typed callback in a runtime type-checked renderer."""

    def _render(spec: object) -> list[str]:
        if not isinstance(spec, spec_type):
            raise TypeError(f"Renderer expected {spec_type!r}, received {type(spec)!r}")
        return fn(spec)

    return _render


def render_exact_type(
    *,
    spec: object,
    renderers: dict[type[object], Renderer],
    kind_label: str,
) -> list[str]:
    """Render using an exact concrete spec type lookup."""
    renderer = renderers.get(type(spec))
    if renderer is None:
        raise ValueError(f"Unsupported {kind_label} spec: {type(spec)!r}")
    return renderer(spec)
