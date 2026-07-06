"""CLI adapters for Flow skip/remind automation."""

from __future__ import annotations

import argparse

from sync.study.flow_automation import FlowAutomationDeps
from sync.study.flow_automation import run_session_remind
from sync.study.flow_automation import run_session_skip


def cmd_session_skip(
    args: argparse.Namespace,
    *,
    deps: FlowAutomationDeps | None = None,
) -> int:
    return run_session_skip(getattr(args, "state", None), deps=deps)


def cmd_session_remind(
    args: argparse.Namespace,
    *,
    deps: FlowAutomationDeps | None = None,
) -> int:
    return run_session_remind(getattr(args, "state", None), deps=deps)
