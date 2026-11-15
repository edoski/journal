"use client";

import { toolActivityLabel } from "@/src/core";
import type { ArtifactPartProps } from "@/src/core";
import { ActivityLine } from "@/components/lesson/activity-line";

/**
 * The LIVE tool card (owner, streaming round 2026-10-01): what a tool
 * call looks like while the agent WRITES it. A tool part sits in
 * `input-streaming` for its whole execution (the bridge defers
 * input-available to tool_execution_end), so this line IS the working
 * state: one muted activity line, no arguments, no input to open. The
 * moment the call settles, the part re-renders through the artifact
 * registry.
 */
export function LiveToolCard({ part }: ArtifactPartProps) {
	const tool = part.type.replace(/^tool-/, "");
	return <ActivityLine testId="live-tool-card" label={toolActivityLabel(tool)} />;
}
