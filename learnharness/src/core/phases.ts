/**
 * Phase derivation (docs/probe-teach-split.md §4) — EXPLICIT EVENTS, never
 * occupancy. The probe→teach agent split (2026-09-11) gave the first
 * boundary a transcript event; the second is INFERRED (owner ruling
 * 2026-09-26, the verdict death):
 *
 *   probe  — until the prober's `probe_done` call CONCLUDES (a clean
 *            toolResult for it; the assessment rides the call's arguments)
 *   plan   — probe concluded, until teaching actually BEGINS
 *   teach  — the first explain call tagged with a `nodeId` (a question
 *            ABOUT a plan node — the prober's recall carries no nodeId in
 *            its schema, so nothing false-triggers). The CALL is the seam, not
 *            its answer: the block that poses the first node question is
 *            where teaching starts.
 *
 * There is no verdict gate and no approval step (Edo, 14 Nov 2026): the
 * teacher writes the plan, says the goal in one line and starts teaching
 * in the same turn. The live indicator LAGS by design (owner accepted):
 * "teach" shows only once the first node's question is posed.
 * A teacher that never tags a question can no longer exist — nodeId is
 * schema-required at the teach explain boundary (owner ruling 2026-09-26),
 * so the seam signal is structural, not prompt-mandated.
 *
 * The former derived-occupancy seam (phase-of-tree via `currentNodeId`)
 * is GONE, as is the verdict-marker fold: no backwards compatibility
 * (legacy sessions are wiped data).
 *
 * TWO FOLDS over the same events (Wave D): `phaseAt3`/`phaseTimeline` fold
 * VIEW messages (the client's dividers and dock — part shapes, pure and
 * structural); `phaseAt3Lh` folds the NATIVE record (server summaries,
 * tests) — probe→plan advances at the probe_done RESULT message, plan→teach
 * at the assistant message carrying the first nodeId-tagged question CALL.
 * Both are strictly sequential; the two derivations agree on every settled
 * record (a call's part projects into the same view boundary).
 *
 * Pure: only browser-safe core helpers — safe on server, client, and tests.
 */

import { POSITION_QUESTION_TOOLS } from "./question-core.ts";
import { QUESTION_TOOLS } from "./pending.ts";

/** The three phases of a session, as the picker / header / dividers see them. */
export type Phase3 = "probe" | "plan" | "teach";

/**
 * Minimal structural slice of a UI message for the phase scan: parts with
 * a state, an input (a tool call's parsed arguments), and (for concluded
 * calls) an output.
 */
export interface PhaseMessage {
	parts: ReadonlyArray<{ type: string; state?: string; input?: unknown; output?: unknown }>;
}

/** A graded call's part input carries `nodeId` iff it is tagged (teach-only —
 *  the prober's recall schema has no nodeId field). */
function taggedNodeId(input: unknown): boolean {
	return (
		typeof input === "object" &&
		input !== null &&
		typeof (input as { nodeId?: unknown }).nodeId === "string" &&
		(input as { nodeId: string }).nodeId.length > 0
	);
}

function isPositionPart(type: string): boolean {
	return type.startsWith("tool-") && POSITION_QUESTION_TOOLS.includes(type.slice("tool-".length));
}

/** The phase at `upToIndex` (inclusive; default: the last message). */
export function phaseAt3(messages: readonly PhaseMessage[], upToIndex?: number): Phase3 {
	let phase: Phase3 = "probe";
	const last = Math.min(upToIndex ?? messages.length - 1, messages.length - 1);
	for (let i = 0; i <= last; i++) {
		phase = advance(phase, messages[i]?.parts);
	}
	return phase;
}

/** One message's advance of the phase (pure fold step). */
function advance(
	phase: Phase3,
	parts: ReadonlyArray<{ type: string; state?: string; input?: unknown; output?: unknown }> | undefined,
): Phase3 {
	if (!parts) return phase;
	for (const part of parts) {
		// STRICTLY SEQUENTIAL: probe → plan only via a concluded probe_done,
		// plan → teach only via the first nodeId-tagged question CALL (the call,
		// not its answer — an errored-and-retried call still proves teaching
		// began, and the retry lands in the same group anyway).
		// A session that picks up an earlier lesson starts teaching: its
		// plan carried over, so no probe or plan of its own.
		if (part.type === "data-session-resume") phase = "teach";
		if (
			phase === "probe" && part.type === "tool-probe_done" && part.state === "output-available" &&
			(part.output as { ok?: unknown } | null | undefined)?.ok !== false
		) {
			phase = "plan";
		}
		if (
			phase === "plan" &&
			isPositionPart(part.type) &&
			taggedNodeId(part.input)
		) {
			phase = "teach";
		}
	}
	return phase;
}

/**
 * The phase at EVERY message index, in one forward fold — the transcript
 * dividers render one per boundary, so phaseAt3(m, i) per index would rescan
 * 0..i each time (quadratic); this is the same derivation, linear.
 * out[i] === phaseAt3(messages, i) for every i.
 */
export function phaseTimeline(messages: readonly PhaseMessage[]): Phase3[] {
	const out: Phase3[] = [];
	let phase: Phase3 = "probe";
	for (let i = 0; i < messages.length; i++) {
		phase = advance(phase, messages[i]?.parts);
		out.push(phase);
	}
	return out;
}

// ─── the native fold (Wave D: record-side phase over LhMessage[]) ───────────

import { probeDoneResultIds, type LhMessage } from "./native-messages.ts";

/** The phase at `upToIndex` (inclusive; default: the last message) of a
 *  NATIVE record. probe→plan advances at the probe_done call's clean
 *  toolResult; plan→teach at the assistant message carrying the first
 *  nodeId-tagged question CALL (mirrors the view fold — same seam, native
 *  shape). */
export function phaseAt3Lh(messages: readonly LhMessage[], upToIndex?: number): Phase3 {
	let phase: Phase3 = "probe";
	const last = Math.min(upToIndex ?? messages.length - 1, messages.length - 1);
	const concluded = probeDoneResultIds(messages.slice(0, last + 1));
	for (let i = 0; i <= last; i++) {
		const m = messages[i]!;
		const role = (m as { role?: string }).role;
		if (role === "custom" && (m as { customType?: string }).customType === "session-resume") {
			phase = "teach";
		} else if (role === "toolResult") {
			if (phase === "probe" && concluded.has(m.id)) phase = "plan";
		} else if (role === "assistant") {
			const content = (m as { content?: ReadonlyArray<{ type?: string; name?: string; arguments?: unknown }> }).content ?? [];
			if (phase === "plan") {
				for (const block of content) {
					if (
						block.type === "toolCall" &&
						POSITION_QUESTION_TOOLS.includes(block.name ?? "") &&
						taggedNodeId(block.arguments)
					) {
						phase = "teach";
						break;
					}
				}
			}
		}
	}
	return phase;
}
