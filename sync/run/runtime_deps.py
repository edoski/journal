"""Top-level runtime dependency container for the CLI entrypoint."""

from __future__ import annotations

from dataclasses import dataclass

from sync.run import wiring
from sync.run.commands.grades import GradesCommandConfig
from sync.run.commands.goals import GoalCommandConfig
from sync.run.commands.media_common import (
    MediaCommandDeps,
    default_media_command_deps,
)
from sync.study.flow_automation import (
    FlowAutomationDeps,
    default_flow_automation_deps,
)
from sync.run.commands.session import (
    SessionCommandDeps,
    default_session_command_deps,
)


@dataclass(frozen=True)
class RuntimeDeps:
    """All dependency groups needed by the CLI entrypoint."""

    wiring: wiring.WiringDeps
    grades: GradesCommandConfig
    goals: GoalCommandConfig
    media: MediaCommandDeps
    reminders: FlowAutomationDeps
    session: SessionCommandDeps


def build_runtime_deps() -> RuntimeDeps:
    """Build the default runtime dependency graph for CLI dispatch."""
    return RuntimeDeps(
        wiring=wiring.default_wiring_deps(),
        grades=GradesCommandConfig(),
        goals=GoalCommandConfig(),
        media=default_media_command_deps(),
        reminders=default_flow_automation_deps(),
        session=default_session_command_deps(),
    )
