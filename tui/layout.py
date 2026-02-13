"""Responsive shell geometry for the redesigned curses TUI."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Rect:
    """Rectangular drawing region in terminal coordinates."""

    y: int
    x: int
    h: int
    w: int


@dataclass(frozen=True)
class ShellLayout:
    """Top-level shell layout regions."""

    header: Rect
    nav: Rect
    body: Rect
    footer: Rect
    breakpoint: str


def compute_shell_layout(height: int, width: int) -> ShellLayout:
    """Compute shell areas for three supported width classes."""
    header_h = 3
    footer_h = 2
    body_h = max(1, height - header_h - footer_h)

    if width >= 140:
        breakpoint = "wide"
        nav_w = 24
    elif width >= 110:
        breakpoint = "medium"
        nav_w = 20
    else:
        breakpoint = "compact"
        nav_w = 0

    nav = Rect(y=header_h, x=0, h=body_h, w=nav_w)
    body = Rect(y=header_h, x=nav_w, h=body_h, w=max(1, width - nav_w))
    return ShellLayout(
        header=Rect(y=0, x=0, h=header_h, w=width),
        nav=nav,
        body=body,
        footer=Rect(y=header_h + body_h, x=0, h=footer_h, w=width),
        breakpoint=breakpoint,
    )
