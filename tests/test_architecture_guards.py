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


def _imported_from(path: Path, module_name: str) -> set[str]:
    imported: set[str] = set()
    module = _parse_module(path)
    for node in ast.walk(module):
        if isinstance(node, ast.ImportFrom) and (node.module or "") == module_name:
            imported.update(alias.name for alias in node.names)
    return imported


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


def test_period_entrypoints_import_shared_runtime_and_windows():
    required: dict[str, dict[str, set[str]]] = {
        "sync/periods/weekly.py": {
            "sync.periods.runtime": {
                "open_period_note",
                "resolve_note_path",
                "write_note_metrics",
            },
            "sync.periods.windows": {"build_week_window"},
        },
        "sync/periods/monthly.py": {
            "sync.periods.runtime": {
                "open_period_note",
                "resolve_note_path",
                "write_note_metrics",
            },
            "sync.periods.windows": {"build_month_window"},
        },
        "sync/periods/quarterly.py": {
            "sync.periods.runtime": {
                "open_period_note",
                "resolve_note_path",
                "write_note_metrics",
            },
            "sync.periods.windows": {"build_quarter_window"},
        },
        "sync/periods/yearly.py": {
            "sync.periods.runtime": {
                "open_period_note",
                "resolve_note_path",
                "write_note_metrics",
            },
            "sync.periods.windows": {"build_year_window"},
        },
    }

    violations: list[str] = []
    for rel_path, modules in required.items():
        path = ROOT / rel_path
        for module_name, symbols in modules.items():
            imported = _imported_from(path, module_name)
            missing = sorted(symbols - imported)
            if missing:
                violations.append(
                    f"{rel_path}: missing {module_name} imports: {', '.join(missing)}"
                )

    assert not violations, "Period runtime/window imports regressed:\n" + "\n".join(
        violations
    )


def test_period_goal_orchestration_uses_pipeline_or_note_store():
    period_modules = [
        ROOT / "sync" / "periods" / "weekly.py",
        ROOT / "sync" / "periods" / "monthly.py",
        ROOT / "sync" / "periods" / "quarterly.py",
        ROOT / "sync" / "periods" / "yearly.py",
    ]
    violations: list[str] = []

    for path in period_modules:
        module = _parse_module(path)
        imported_pipeline = _imported_from(path, "sync.goals.period_pipeline")
        imported_note_store = _imported_from(path, "sync.goals.note_store")

        if path.name in {"weekly.py", "monthly.py", "quarterly.py"}:
            required_pipeline = {
                "CarryForwardConfig",
                "load_source_tasks_with_carry_forward",
                "SourceWriteConfig",
                "propagate_source_sections",
            }
            missing = sorted(required_pipeline - imported_pipeline)
            if missing:
                violations.append(
                    f"{path}: missing pipeline imports: {', '.join(missing)}"
                )

        if path.name == "yearly.py":
            required_note_store = {"extract_goals", "apply_goals_sections"}
            missing = sorted(required_note_store - imported_note_store)
            if missing:
                violations.append(
                    f"{path}: missing note_store imports: {', '.join(missing)}"
                )

        for node in ast.walk(module):
            if not isinstance(node, ast.ImportFrom):
                continue
            mod = node.module or ""
            names = {alias.name for alias in node.names}
            if mod == "sync.goals.reconcile":
                banned = {
                    "reconcile_goal_lists",
                    "merge_mirror_goals",
                    "process_pierced_goals",
                }
                used = sorted(names & banned)
                if used:
                    violations.append(
                        f"{path}: direct reconcile imports not allowed: {', '.join(used)}"
                    )
            if mod == "sync.writers.goals" and "build_goals_block" in names:
                violations.append(f"{path}: build_goals_block import is not allowed")
            if mod == "sync.notes.sections":
                banned_sections = {
                    "splice_goals_section",
                    "goals_section_bounds",
                    "extract_subsection_tasks",
                }
                used_sections = sorted(names & banned_sections)
                if used_sections:
                    violations.append(
                        f"{path}: direct goals section helpers not allowed: {', '.join(used_sections)}"
                    )

    assert not violations, (
        "Period goal orchestration must use goals pipeline/note_store:\n"
        + "\n".join(violations)
    )


def test_daily_goal_writes_use_period_pipeline_helper():
    daily_goals_path = ROOT / "sync" / "daily" / "goals.py"
    imported = _imported_from(daily_goals_path, "sync.goals.period_pipeline")
    assert "propagate_source_sections" in imported, (
        "sync/daily/goals.py must route goal source writes through "
        "sync.goals.period_pipeline.propagate_source_sections"
    )
