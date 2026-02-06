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
    writer_files = sorted((ROOT / "sync" / "writers").rglob("*.py"))
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


def test_removed_legacy_module_files_do_not_exist():
    legacy_paths = [
        "sync/weekly.py",
        "sync/monthly.py",
        "sync/quarterly.py",
        "sync/yearly.py",
        "sync/period_sections.py",
        "sync/period_cleanup.py",
        "sync/media_section.py",
        "sync/daily/orchestrator.py",
        "sync/metrics.py",
        "sync/writers/charts.py",
        "sync/goal_identity.py",
        "sync/goals_engine.py",
        "sync/carried_goals.py",
        "sync/goal_sync_state.py",
        "sync/base.py",
        "sync/reminders.py",
        "sync/notes_sections.py",
        "sync/notes_locking.py",
        "sync/markdown_common.py",
        "sync/daily/flow_db.py",
        "sync/daily/breaks.py",
        "sync/daily/study.py",
    ]
    existing = [path for path in legacy_paths if (ROOT / path).exists()]
    assert not existing, "Removed legacy module files reappeared:\n" + "\n".join(
        sorted(existing)
    )


def test_required_domain_packages_exist():
    required_dirs = [
        "sync/goals",
        "sync/study",
        "sync/notes",
        "sync/periods",
        "sync/metrics",
        "sync/daily/orchestrator",
        "sync/writers/charts",
    ]
    missing = [path for path in required_dirs if not (ROOT / path).is_dir()]
    assert not missing, (
        "Required domain package directories are missing:\n"
        + "\n".join(sorted(missing))
    )


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
    banned_modules = {
        "sync.weekly",
        "sync.monthly",
        "sync.quarterly",
        "sync.yearly",
        "sync.period_sections",
        "sync.period_cleanup",
        "sync.media_section",
        "sync.goal_identity",
        "sync.goals_engine",
        "sync.carried_goals",
        "sync.goal_sync_state",
        "sync.base",
        "sync.reminders",
        "sync.notes_sections",
        "sync.notes_locking",
        "sync.markdown_common",
        "sync.daily.flow_db",
        "sync.daily.breaks",
        "sync.daily.study",
    }
    violations: list[str] = []

    for path in _iter_python_files("sync", "tests"):
        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "sync.notes":
                        violations.append(f"{path}: import sync.notes")
                    if alias.name in banned_modules:
                        violations.append(f"{path}: import {alias.name}")

            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""

                if mod == "sync.notes":
                    imported = ", ".join(alias.name for alias in node.names)
                    violations.append(f"{path}: from sync.notes import {imported}")

                if mod in banned_modules:
                    imported = ", ".join(alias.name for alias in node.names)
                    violations.append(f"{path}: from {mod} import {imported}")

                if mod == "sync.readers":
                    for alias in node.names:
                        if alias.name == "parse_daily_note":
                            violations.append(
                                f"{path}: from sync.readers import parse_daily_note"
                            )

                if mod == "sync.goals.reconcile":
                    for alias in node.names:
                        if alias.name == "atomic_write_note":
                            violations.append(
                                f"{path}: from sync.goals.reconcile import atomic_write_note"
                            )

    assert not violations, "Deprecated import paths found:\n" + "\n".join(violations)
