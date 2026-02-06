"""
Architecture guardrails to prevent layering regressions.
"""

from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


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
        "sync/daily/goals.py",
        "sync/periods/media.py",
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
        "sync/writers/charts",
        "tui",
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


def test_period_entrypoints_import_service_and_windows():
    required: dict[str, dict[str, set[str]]] = {
        "sync/periods/weekly.py": {
            "sync.application.period_sync_service": {"PeriodSyncService"},
            "sync.periods.runtime": {"resolve_note_path"},
            "sync.periods.windows": {"build_week_window"},
        },
        "sync/periods/monthly.py": {
            "sync.application.period_sync_service": {"PeriodSyncService"},
            "sync.periods.runtime": {"resolve_note_path"},
            "sync.periods.windows": {"build_month_window"},
        },
        "sync/periods/quarterly.py": {
            "sync.application.period_sync_service": {"PeriodSyncService"},
            "sync.periods.runtime": {"resolve_note_path"},
            "sync.periods.windows": {"build_quarter_window"},
        },
        "sync/periods/yearly.py": {
            "sync.application.period_sync_service": {"PeriodSyncService"},
            "sync.periods.runtime": {"resolve_note_path"},
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

    assert not violations, (
        "Period entrypoint service/window imports regressed:\n" + "\n".join(violations)
    )


def test_period_entrypoints_stay_thin():
    entrypoints = [
        ROOT / "sync" / "periods" / "weekly.py",
        ROOT / "sync" / "periods" / "monthly.py",
        ROOT / "sync" / "periods" / "quarterly.py",
        ROOT / "sync" / "periods" / "yearly.py",
    ]
    violations: list[str] = []

    for path in entrypoints:
        source = path.read_text(encoding="utf-8")
        module = _parse_module(path)
        import_count = sum(
            1
            for line in source.splitlines()
            if line.startswith("import ") or line.startswith("from ")
        )
        if import_count > 12:
            violations.append(f"{path}: import count {import_count} exceeds 12")

        for node in module.body:
            if isinstance(node, ast.FunctionDef) and node.name.startswith("build_"):
                violations.append(
                    f"{path}: entrypoint should not define builder {node.name}"
                )

    assert not violations, (
        "Period entrypoints regressed from thin wrappers:\n" + "\n".join(violations)
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


def test_sync_package_does_not_import_tui():
    violations: list[str] = []
    for path in _iter_python_files("sync"):
        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "tui" or alias.name.startswith("tui."):
                        violations.append(f"{path}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                if mod == "tui" or mod.startswith("tui."):
                    imported = ", ".join(alias.name for alias in node.names)
                    violations.append(f"{path}: from {mod} import {imported}")
    assert not violations, "sync must not import tui:\n" + "\n".join(violations)


def test_removed_utils_package_is_not_imported():
    violations: list[str] = []
    for path in _iter_python_files("sync", "tests", "tui"):
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
    for path in _iter_python_files("sync", "tests", "tui"):
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
    for path in _iter_python_files("sync", "tui"):
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


def test_application_layer_does_not_import_adapters():
    application_files = sorted((ROOT / "sync" / "application").rglob("*.py"))
    violations: list[str] = []

    for path in application_files:
        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("sync.adapters"):
                        violations.append(f"{path}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                if mod.startswith("sync.adapters"):
                    imported = ", ".join(alias.name for alias in node.names)
                    violations.append(f"{path}: from {mod} import {imported}")

    assert not violations, (
        "sync.application must depend on ports/contracts, not adapters:\n"
        + "\n".join(violations)
    )


def test_writers_do_not_import_ports_or_adapters():
    writer_files = sorted((ROOT / "sync" / "writers").rglob("*.py"))
    violations: list[str] = []

    for path in writer_files:
        module = _parse_module(path)
        for node in ast.walk(module):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("sync.ports") or alias.name.startswith(
                        "sync.adapters"
                    ):
                        violations.append(f"{path}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                if mod.startswith("sync.ports") or mod.startswith("sync.adapters"):
                    imported = ", ".join(alias.name for alias in node.names)
                    violations.append(f"{path}: from {mod} import {imported}")

    assert not violations, (
        "sync.writers must remain pure render layer (no ports/adapters):\n"
        + "\n".join(violations)
    )


def test_only_composition_roots_import_adapters_or_application():
    composition_roots = {
        ROOT / "sync" / "daily" / "__main__.py",
        ROOT / "sync" / "periods" / "weekly.py",
        ROOT / "sync" / "periods" / "monthly.py",
        ROOT / "sync" / "periods" / "quarterly.py",
        ROOT / "sync" / "periods" / "yearly.py",
        ROOT / "tui" / "app.py",
        ROOT / "tui" / "cli.py",
    }
    violations: list[str] = []

    for path in _iter_python_files("sync", "tui"):
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
