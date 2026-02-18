"""Architecture guardrails to prevent layering regressions."""

from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _iter_python_files(*relative_dirs: str) -> list[Path]:
    files: list[Path] = []
    for rel_dir in relative_dirs:
        files.extend(sorted((ROOT / rel_dir).rglob("*.py")))
    return files


def _parse_module(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def test_sync_modules_do_not_import_private_symbols_across_modules() -> None:
    violations: list[str] = []
    for path in _iter_python_files("sync"):
        module = _parse_module(path)
        for node in ast.walk(module):
            if not isinstance(node, ast.ImportFrom):
                continue
            mod = node.module or ""
            if not mod.startswith("sync."):
                continue
            for alias in node.names:
                if alias.name.startswith("_"):
                    violations.append(
                        f"{path}: from {mod} import private symbol {alias.name}"
                    )

    assert not violations, (
        "Cross-module private imports are not allowed in sync package:\n"
        + "\n".join(violations)
    )


def test_only_composition_roots_import_adapters_or_application() -> None:
    composition_roots = {
        ROOT / "sync" / "run" / "__main__.py",
    }
    violations: list[str] = []

    for path in _iter_python_files("sync"):
        if path in composition_roots:
            continue
        if path.is_relative_to(ROOT / "sync" / "application"):
            continue
        if path.is_relative_to(ROOT / "sync" / "adapters"):
            continue

        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("sync.adapters") or alias.name.startswith(
                        "sync.application"
                    ):
                        violations.append(f"{path}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                if mod.startswith("sync.adapters") or mod.startswith(
                    "sync.application"
                ):
                    imported = ", ".join(alias.name for alias in node.names)
                    violations.append(f"{path}: from {mod} import {imported}")

    assert not violations, (
        "Only composition roots may wire adapters/application services:\n"
        + "\n".join(violations)
    )


def test_period_snapshot_contract_is_defined_once() -> None:
    definitions: list[str] = []
    for path in _iter_python_files("sync"):
        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.ClassDef) and node.name == "PeriodSnapshot":
                definitions.append(str(path.relative_to(ROOT)))

    assert definitions == ["sync/contracts/query.py"], (
        "PeriodSnapshot must be defined exactly once in sync/contracts/query.py, "
        "but found:\n" + "\n".join(definitions)
    )
