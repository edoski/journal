"""
Architecture guardrails to prevent layering regressions.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


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
        "sync/daily/goals.py",
        "sync/periods/media.py",
        "sync/daily/__main__.py",
        "sync/study/__main__.py",
        "sync/periods/weekly/__main__.py",
        "sync/periods/monthly/__main__.py",
        "sync/periods/quarterly/__main__.py",
        "sync/periods/yearly/__main__.py",
        "sync_all.sh",
        "sync.sh",
        "utils",
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
        "sync/contracts",
        "sync/ports",
        "sync/adapters",
        "sync/application",
        "sync/daily/orchestrator",
        "sync/run",
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
        "sync.periods.media",
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


def test_removed_compat_helpers_are_not_reintroduced():
    banned_functions: dict[str, set[str]] = {
        "sync/daily/icloud.py": {"load_status_file"},
        "sync/adapters/cache_bootstrap.py": {"_LEGACY_CACHE_FILES"},
        "sync/goals/state.py": {"empty_goal_sync_state", "normalize_goal_sync_state"},
        "sync/goals/tombstones.py": {"normalize_carry_forward_cache"},
    }
    violations: list[str] = []

    for rel_path, names in banned_functions.items():
        path = ROOT / rel_path
        module = _parse_module(path)
        defined = {
            node.name for node in module.body if isinstance(node, ast.FunctionDef)
        }
        assigned = {
            target.id
            for node in module.body
            if isinstance(node, ast.Assign)
            for target in node.targets
            if isinstance(target, ast.Name)
        }

        for name in names:
            if name in defined or name in assigned:
                violations.append(f"{rel_path}: found banned symbol {name}")

    assert not violations, "Removed compat helpers reappeared:\n" + "\n".join(
        violations
    )


def test_period_goal_orchestration_lives_in_goal_service():
    period_modules = _iter_python_files("sync/periods")
    service_path = ROOT / "sync" / "application" / "goal_sync_service.py"
    pipeline_imports = _imported_from(service_path, "sync.goals.period_pipeline")
    expected_pipeline_imports = {
        "CarryForwardConfig",
        "MirrorSyncConfig",
        "PiercingSyncConfig",
        "SourceWriteConfig",
        "load_source_tasks_with_carry_forward",
        "propagate_source_sections",
        "sync_mirror_section",
        "sync_pierced_source_section",
    }
    missing_pipeline = sorted(expected_pipeline_imports - pipeline_imports)
    assert not missing_pipeline, (
        "sync/application/goal_sync_service.py must own goal pipeline orchestration:\n"
        + ", ".join(missing_pipeline)
    )

    carry_forward_imports = _imported_from(
        service_path,
        "sync.goals.carry_forward",
    )
    assert "carry_forward_with_tombstones" in carry_forward_imports, (
        "sync/application/goal_sync_service.py must own yearly carry-forward flow"
    )

    violations: list[str] = []

    for path in period_modules:
        if path.name in {"engine.py", "__init__.py"}:
            continue
        module = _parse_module(path)

        for node in ast.walk(module):
            if not isinstance(node, ast.ImportFrom):
                continue
            mod = node.module or ""
            if mod.startswith("sync.goals"):
                violations.append(f"{path}: period entrypoints must not import {mod}")

    assert not violations, (
        "Period goal orchestration must live in sync.application.goal_sync_service:\n"
        + "\n".join(violations)
    )


def test_goal_daily_pipeline_writes_use_period_pipeline_helper():
    daily_pipeline_path = ROOT / "sync" / "goals" / "daily_pipeline.py"
    imported = _imported_from(daily_pipeline_path, "sync.goals.period_pipeline")
    assert "propagate_source_sections" in imported, (
        "sync/goals/daily_pipeline.py must route goal source writes through "
        "sync.goals.period_pipeline.propagate_source_sections"
    )


def test_goal_sync_service_does_not_import_daily_goals_module():
    service_path = ROOT / "sync" / "application" / "goal_sync_service.py"
    module = _parse_module(service_path)
    violations: list[str] = []

    for node in ast.walk(module):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "sync.daily.goals" or alias.name.startswith(
                    "sync.daily.goals."
                ):
                    violations.append(f"import {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if mod == "sync.daily.goals" or mod.startswith("sync.daily.goals."):
                imported = ", ".join(alias.name for alias in node.names)
                violations.append(f"from {mod} import {imported}")

    assert not violations, (
        "sync.application.goal_sync_service must not import sync.daily.goals:\n"
        + "\n".join(violations)
    )


def test_removed_utils_package_is_not_imported():
    violations: list[str] = []
    for path in _iter_python_files("sync", "tests"):
        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "utils" or alias.name.startswith("utils."):
                        violations.append(f"{path}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                if mod == "utils" or mod.startswith("utils."):
                    imported = ", ".join(alias.name for alias in node.names)
                    violations.append(f"{path}: from {mod} import {imported}")
    assert not violations, "Removed utils package is still imported:\n" + "\n".join(
        violations
    )


def test_removed_reminder_functions_are_not_referenced():
    violations: list[str] = []
    for path in _iter_python_files("sync", "tests"):
        module = _parse_module(path)
        for node in ast.walk(module):
            if not isinstance(node, ast.ImportFrom):
                continue
            mod = node.module or ""
            if mod != "sync.goals.reminders":
                continue
            names = {alias.name for alias in node.names}
            banned = {
                "get_review_reminders_for_date",
                "get_periodic_reminders_for_date",
            }
            used = sorted(names & banned)
            if used:
                violations.append(
                    f"{path}: removed reminder API imported: {', '.join(used)}"
                )
    assert not violations, "Removed reminder API references found:\n" + "\n".join(
        violations
    )


def test_no_sessiondict_alias_exists():
    matches: list[str] = []
    for path in _iter_python_files("sync"):
        module = _parse_module(path)
        for node in module.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "SessionDict":
                        matches.append(str(path))
            elif isinstance(node, ast.AnnAssign):
                target = node.target
                if isinstance(target, ast.Name) and target.id == "SessionDict":
                    matches.append(str(path))
    assert not matches, "SessionDict aliases are not allowed:\n" + "\n".join(matches)


def test_sync_modules_do_not_import_private_symbols_across_modules():
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


def test_only_composition_roots_import_adapters_or_application():
    composition_roots = {
        ROOT / "sync" / "run" / "__main__.py",
    }
    violations: list[str] = []

    for path in _iter_python_files("sync"):
        if path in composition_roots:
            continue
        # Application internals may import sibling application modules.
        if path.is_relative_to(ROOT / "sync" / "application"):
            continue
        # Adapter internals may import sibling adapter modules.
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


def test_application_metrics_services_avoid_generic_dict_any_signatures():
    metric_service_files = [
        ROOT / "sync" / "application" / "period_sync_service.py",
        ROOT / "sync" / "application" / "query_service.py",
    ]
    generic_dict_any = re.compile(r"dict\[\s*str\s*,\s*Any\s*\]")
    violations: list[str] = []

    for path in metric_service_files:
        source = path.read_text(encoding="utf-8")
        if generic_dict_any.search(source):
            violations.append(f"{path}: found dict[str, Any] metric signature")
        if "from typing import Any" in source or " import Any" in source:
            violations.append(f"{path}: found typing.Any import")

    assert not violations, (
        "Application metric services must use contracts/typed metric values, "
        "not dict[str, Any]:\n" + "\n".join(violations)
    )


def test_period_snapshot_contract_is_defined_once():
    files = _iter_python_files("sync")
    definitions: list[str] = []

    for path in files:
        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.ClassDef) and node.name == "PeriodSnapshot":
                definitions.append(str(path.relative_to(ROOT)))

    assert definitions == ["sync/contracts/query.py"], (
        "PeriodSnapshot must be defined exactly once in sync/contracts/query.py, "
        "but found:\n" + "\n".join(definitions)
    )
