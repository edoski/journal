"""Regenerate deterministic render baseline fixtures."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tests.support.render_baseline_generator import (  # noqa: E402
    SNAPSHOT_DIR,
    RenderBaselineArtifact,
    artifact_text,
    generate_render_baseline_artifacts,
)


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Regenerate deterministic render-baseline fixtures.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Report drift and exit non-zero instead of writing files.",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="NAME",
        help="Regenerate/check a single fixture file (repeatable).",
    )
    return parser.parse_args(argv)


def _select_artifacts(
    artifacts: tuple[RenderBaselineArtifact, ...],
    only: Sequence[str],
) -> tuple[RenderBaselineArtifact, ...]:
    by_name = {artifact.name: artifact for artifact in artifacts}
    if not only:
        return artifacts

    requested = set(only)
    unknown = sorted(name for name in requested if name not in by_name)
    if unknown:
        known = ", ".join(sorted(by_name))
        missing = ", ".join(unknown)
        raise ValueError(
            f"Unknown artifact name(s): {missing}. Available names: {known}",
        )

    return tuple(artifact for artifact in artifacts if artifact.name in requested)


def _sync_artifact(
    artifact: RenderBaselineArtifact,
    *,
    check: bool,
    output_dir: Path,
) -> str:
    path = output_dir / artifact.name
    expected = artifact_text(artifact)
    current = path.read_text(encoding="utf-8") if path.exists() else None

    if current == expected:
        return "UNCHANGED"
    if check:
        return "DRIFT"

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(expected, encoding="utf-8")
    return "UPDATED"


def run(
    *,
    check: bool,
    only: Sequence[str],
    output_dir: Path = SNAPSHOT_DIR,
) -> int:
    artifacts = generate_render_baseline_artifacts()
    selected = _select_artifacts(artifacts, only)

    has_drift = False
    for artifact in selected:
        status = _sync_artifact(artifact, check=check, output_dir=output_dir)
        if status == "DRIFT":
            has_drift = True
        print(f"{status:<9} {artifact.name}")

    if check and has_drift:
        return 1
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        return run(check=args.check, only=args.only, output_dir=SNAPSHOT_DIR)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
