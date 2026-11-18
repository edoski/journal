"""The declared Python floor covers the standard library the engine imports."""

from __future__ import annotations

import ast
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
# Standard-library modules newer than 3.10, with the release that added them.
ADDED = {"tomllib": (3, 11)}


def _floor() -> tuple[int, int]:
    text = (ROOT / "pyproject.toml").read_text()
    match = re.search(r'requires-python = ">=(\d+)\.(\d+)"', text)
    assert match, "pyproject declares requires-python"
    return int(match[1]), int(match[2])


def test_the_floor_has_every_module_the_engine_imports() -> None:
    needed: dict[str, tuple[int, int]] = {}
    for path in (ROOT / "learning").rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            names = (
                [alias.name for alias in node.names]
                if isinstance(node, ast.Import)
                else [node.module or ""]
                if isinstance(node, ast.ImportFrom)
                else []
            )
            for name in names:
                if name.split(".")[0] in ADDED:
                    needed[f"{path.relative_to(ROOT)}: {name}"] = ADDED[
                        name.split(".")[0]
                    ]
    assert {
        where: release for where, release in needed.items() if release > _floor()
    } == {}
