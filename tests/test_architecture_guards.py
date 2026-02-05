"""
Architecture guardrails to prevent layering regressions.
"""

from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _iter_python_files(*relative_dirs: str) -> list[Path]:
    files: list[Path] = []
    for rel_dir in relative_dirs:
        files.extend(sorted((ROOT / rel_dir).rglob("*.py")))
    return files


def _parse_module(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def test_writers_do_not_import_readers():
    writer_files = sorted((ROOT / "sync" / "writers").glob("*.py"))
    violations: list[str] = []

    for path in writer_files:
        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("sync.readers"):
                        violations.append(f"{path}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                if mod.startswith("sync.readers"):
                    imported = ", ".join(alias.name for alias in node.names)
                    violations.append(f"{path}: from {mod} import {imported}")

    assert not violations, "Writers must not import readers:\n" + "\n".join(violations)


def test_readers_init_has_no_lazy_wrapper_functions():
    init_path = ROOT / "sync" / "readers" / "__init__.py"
    module = _parse_module(init_path)
    functions = [
        node.name
        for node in module.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    assert not functions, (
        "sync/readers/__init__.py should only re-export symbols, "
        f"found functions: {functions}"
    )


def test_deprecated_import_paths_are_not_used():
    violations: list[str] = []

    for path in _iter_python_files("sync", "tests"):
        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "sync.notes":
                        violations.append(f"{path}: import sync.notes")

            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""

                if mod == "sync.notes":
                    imported = ", ".join(alias.name for alias in node.names)
                    violations.append(f"{path}: from sync.notes import {imported}")

                if mod == "sync.readers":
                    for alias in node.names:
                        if alias.name == "parse_daily_note":
                            violations.append(
                                f"{path}: from sync.readers import parse_daily_note"
                            )

                if mod == "sync.base":
                    for alias in node.names:
                        if alias.name == "atomic_write_note":
                            violations.append(
                                f"{path}: from sync.base import atomic_write_note"
                            )

    assert not violations, "Deprecated import paths found:\n" + "\n".join(violations)
