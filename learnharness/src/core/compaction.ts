/**
 * COMPACTION. Claude Code compacts a lesson's session itself: the summary
 * replaces the conversation in the model's memory, while the record keeps
 * full history for every page. The app keeps only its policy: once a
 * settled turn's context reaches the trigger, it asks Claude Code to compact
 * with the lesson's instructions (`compactionInstructions`), and it records
 * each compaction as a marker the transcript shows.
 */

import type { PlanTree } from "./contracts/plan.ts";
import { derivePlanStatusesLh, derivedNodeStatus } from "./contracts/plan.ts";
import { COMPACTED_HISTORY_HEADER } from "./contracts/chat.ts";
import type { LhMessage, LhMarkerMessage } from "./native-messages.ts";
import { newMessageId } from "./native-messages.ts";

/** The reserve subtracted from the model's contextWindow when the window
 * is the binding constraint. */
export const COMPACTION_RESERVE_TOKENS = 16_384;

/** The trigger's bound (owner ruling: 150k): it caps what each reply of a
 *  long lesson draws, well inside every window. */
export const DEFAULT_COMPACTION_THRESHOLD_TOKENS = 150_000;

/** The most context a request may carry in a model window: the window less
 *  its reserve, or the bound with no known window. A lesson past it waits
 *  for its compaction; under it, a turn never does. Pure. */
export function compactionLimitTokens(contextWindowTokens: number | undefined | null): number {
	if (contextWindowTokens == null) return DEFAULT_COMPACTION_THRESHOLD_TOKENS;
	return Math.max(contextWindowTokens - COMPACTION_RESERVE_TOKENS, 1);
}

/** Where compaction triggers for a model window: the bound, or the limit
 *  when that is smaller. Pure. */
export function compactionTriggerTokens(contextWindowTokens: number | undefined | null): number {
	return Math.min(DEFAULT_COMPACTION_THRESHOLD_TOKENS, compactionLimitTokens(contextWindowTokens));
}

/** The context one request carried: every input token, cached or not. */
export function contextTokensOf(usage: { input: number; cacheRead: number; cacheWrite: number }): number {
	return usage.input + usage.cacheRead + usage.cacheWrite;
}

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
