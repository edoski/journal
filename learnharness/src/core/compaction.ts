/**
 * COMPACTION. Claude Code compacts a lesson's session itself, at its own
 * point (its automatic compaction): the summary replaces the conversation in
 * the model's memory, while the record keeps full history for every page.
 * The app gives that summary the lesson's instructions
 * (`compactionInstructions`, through Claude Code's PreCompact hook), and
 * records each compaction as a marker the transcript shows.
 */

import type { PlanTree } from "./contracts/plan.ts";
import { derivePlanStatusesLh, derivedNodeStatus } from "./contracts/plan.ts";
import { COMPACTED_HISTORY_HEADER } from "./contracts/chat.ts";
import type { LhMessage, LhMarkerMessage } from "./native-messages.ts";
import { newMessageId } from "./native-messages.ts";

// ─── the wait ────────────────────────────────────────────────────────────────

/** Claude Code started or ended compacting inside the turn (the Agent
 *  SDK's own `system` / `status: "compacting"` message): a turn event the
 *  stream carries beside the agent's, so the lesson names the wait instead
 *  of a bare "Thinking…" (round 10, robustness minor 3: about 105 s). */
export interface CompactionEvent {
	type: "compaction";
	active: boolean;
}

/** The lesson's working line while Claude Code compacts. */
export const COMPACTING_LINE = "Summarising the lesson so far…";

// ─── the marker ──────────────────────────────────────────────────────────────

/** The compaction marker's details (UI payload — never model-visible;
 * the model sees content, the header + summary). */
export interface CompactionDetails {
	/** Record id of the first message the summary did not replace; empty
	 * when the summary replaced the whole conversation (Claude Code's own
	 * compaction keeps no verbatim tail). */
	firstKeptMessageId: string;
	/** The context tokens Claude Code compacted (provenance for the
	 * divider's tooltip/dialog). */
	tokensBefore: number;
	/** provider:id of the model that wrote the summary (the session's
	 * own model — owner ruling; provenance, never a routing input). */
	model?: string;
	/** ISO timestamp of the compaction moment. */
	at: string;
}

/** Build the compaction marker. Content is the FULL model-facing text
 * (header + summary — single-sourced header); the marker rides the
 * record at the compaction MOMENT (near the transcript end), while the
 * cut it names sits deep in history: the UI renders both places. */
export function newCompactionMarker(summary: string, details: CompactionDetails): LhMarkerMessage {
	return {
		id: newMessageId(),
		role: "custom",
		customType: "compaction",
		content: `${COMPACTED_HISTORY_HEADER}\n\n${summary.trim()}`,
		display: true,
		details,
		timestamp: Date.now(),
	};
}

/** The ACTIVE compaction marker: the newest one with a retained-message
 * id. Its summary supersedes older markers even when their stored
 * positions remain inside its retained tail. */
export function activeCompactionOf(messages: readonly LhMessage[]): (LhMarkerMessage & { details: CompactionDetails }) | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if ((m as { role?: string }).role !== "custom") continue;
		const marker = m as LhMarkerMessage;
		if (marker.customType === "compaction") {
			const details = marker.details as Partial<CompactionDetails>;
			if (typeof details.firstKeptMessageId === "string") {
				return marker as LhMarkerMessage & { details: CompactionDetails };
			}
		}
	}
	return null;
}

/** Render the plan dependency tree verbatim (owner requirement: the tree
 * persists through compaction). Structure from record.tree, statuses
 * derived from the transcript (the record's own law: the tree carries
 * structure only). Empty tree → absent section (nothing persisted). */
export function planTreeToText(tree: PlanTree | undefined, messages: readonly LhMessage[]): string | null {
	if (!tree || tree.nodes.length === 0) return null;
	const statuses = derivePlanStatusesLh(tree, messages);
	const byId = new Map(tree.nodes.map((n) => [n.id, n]));
	const lines: string[] = [];
	for (const node of tree.nodes) {
		const status = derivedNodeStatus(statuses, node.id);
		const summary = node.summary ? ` — ${node.summary}` : "";
		lines.push(`- [${status}] ${node.title} (${node.id})${summary}`);
	}
	for (const edge of tree.edges) {
		const from = byId.get(edge.from);
		const to = byId.get(edge.to);
		if (from && to) lines.push(`- ${from.title} → ${to.title} (${from.id} → ${to.id})`);
	}
	return lines.join("\n");
}

/**
 * What Claude Code's summary of a lesson must keep (owner rulings): the
 * learner's understanding and how it evolved, the teaching arc, the plan
 * tree verbatim, and the current moment, in that order of stress.
 */
export function compactionInstructions(kind: "teach" | "practice" | "probe", planTreeText: string | null): string {
	const agent = kind === "practice" ? "practice agent" : "tutor";
	return `This is a tutoring session: write the summary your future self, the ${agent}, will read instead of the conversation. Use exactly these sections, in this order:

## The learner's understanding
The most detailed picture you can give of what this learner knows and how that evolved across the session: what they answered and how well (graded answers, correct reasoning, mistakes), how sure they said they were, misconceptions that surfaced, which were corrected and which still stand. This section carries the most weight: future teaching decisions hang on it.

## The teaching arc
How the session progressed: what was covered and in what order, which explanations landed and which didn't, how the learner responded, where the momentum went. Include probe-phase findings if present.

## The plan dependency tree
Reproduce the session's current plan tree verbatim from the structure below: do not drop nodes, edges or statuses.

${planTreeText ?? "No plan tree exists in this session (nothing was persisted)."}

## The current moment
What is happening right now: any question or problem awaiting the learner's answer (with its call id), any commitment you made that a later turn must honor, and the immediate next step.

Rules: no praise, no filler, no speculation beyond the conversation. Every claim about the learner must be traceable to what they actually said or answered. Keep every identifier (proposition ids, node ids, call ids, file paths) exact.`;
}
