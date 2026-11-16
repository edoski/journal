/**
 * Plan-tree contracts — the session-scoped dependency tree
 *
 * Part of the domain-split contracts (src/core/contracts/): each domain file
 * is owned outright by its stream — cross-domain schema changes go through
 * master. Pure types + protocol docs + tiny pure helpers; type-only imports
 * of "ai" (safe everywhere: server, client, tests). See docs/vision.md.
 */
// ─── Plan tree (vision §2 "formal plan tree") ────────────────────────────────
// A session-scoped dependency tree authored by the teacher via plan tools.
// One substrate with the global graph: tree nodes fold into graph nodes.

export interface PlanNode {
	/** Opaque, agent-chosen slug, stable across edits: "chain-rule-intuition". */
	id: string;
	/** Short label for the tree panel. */
	title: string;
	/** 1-2 sentences: what this node covers. */
	summary?: string;
}

export interface PlanEdge {
	/** Prerequisite node id. */
	from: string;
	/** Node that depends on `from`. */
	to: string;
}

export interface PlanTree {
	nodes: PlanNode[];
	edges: PlanEdge[];
	/** Increments on every mutation — lets the UI animate/react to changes. */
	version: number;
}

/**
 * How big a lesson's plan map may be: what the topic page's lesson map
 * shows whole, without panning, at Edo's window (1512×982, his ruling of
 * 14 Nov 2026), each step one idea. Measured there with the sidebar open,
 * the map's pane is 696×786; inside its fade it opens a plan whole down to
 * the 75% scale its titles stay readable at (`WHOLE_COURSE_ZOOM`), which
 * holds 8 rows of steps, 4 across. A plan's rows are its longest chain of
 * steps, so `deep` caps that chain; `steps` caps the count, since a map
 * that fills its rows spreads past 4 across: at 12 steps 9 plans in 10 of
 * a tutor's shapes still open whole. Pinned to the pane's geometry in
 * tests/plan-map-cap.test.ts; the planning prompt and plan_init state
 * these numbers and point here. `across` is the most steps side by side a
 * step's card is sized for: its width is the pane's clear middle split
 * into the plan's widest row, at most four (`stepCard`, round 14, m34).
 */
export const PLAN_MAP_CAP = { steps: 12, deep: 8, across: 4 } as const;

// NOTE (2026-09-11 pivot, docs/probe-teach-split.md): the tree once carried
// `currentNodeId` / `doneNodeIds` — progress fields. They are GONE by
// design: the tree carries structure ONLY; position and visited-ness derive
// from the transcript at render time (derivePlanStatuses below). There is no
// done ledger of any kind. No backwards compatibility for old records.

/** Derived, never stored: status of a node for the panel (vision §2). */
export type PlanNodeStatus = "current" | "visited" | "upcoming";

// ─── derived statuses: position from CALLS, never from results ─────────────
//
// (2026-09-11 pivot — docs/probe-teach-split.md §3.) The teacher AUTHORS the
// map (plan_init, mermaid — re-callable rewrite) and never tracks progress.
// The explain `nodeId` means "this question is ABOUT this node" — a position
// signal, never a completion signal. Derivation reads CALLS only:
//   current — the node of the most RECENT tagged question call (any state)
//   visited — every node referenced by an EARLIER tagged call
// Consequences: a node spans multiple turns/checks naturally (several
// questions may tag the same node — the map holds still); moving to a new
// node is the teacher's judgment the previous one is finished, regardless of
// check outcomes (a failed check then a move-on is still visited); results
// feed nothing; there is NO fallback current (before the first tagged check
// nothing is current). Untagged checks no longer exist (nodeId is required
// on the teach question, owner ruling 2026-09-26). NodeIds missing from the
// current tree are ignored (a rewrite may have dropped the node).

/** Minimal structural message slice — anything with typed parts (mirrors
 * phases.ts: pure, no runtime deps, safe on server, client, and in tests). */
interface PartsCarrier {
	parts: Array<{ type: string; state?: string; input?: unknown; output?: unknown }>;
}

export interface DerivedPlanStatuses {
	/** The node the most recent tagged question call is about; null before any. */
	current: string | null;
	/** Nodes referenced by earlier tagged calls — been there, monotonic. */
	visited: ReadonlySet<string>;
	/** Nodes a lesson_progress call named done: taught, and he showed he
	 *  has it (each is also visited). */
	done: ReadonlySet<string>;
}

/** Statuses of a node: the derived view the plan panel should render. */
export function derivedNodeStatus(statuses: DerivedPlanStatuses, nodeId: string): PlanNodeStatus {
	if (statuses.current === nodeId) return "current";
	if (statuses.visited.has(nodeId)) return "visited";
	return "upcoming";
}

/** The teacher's progress tool: marks plan steps done and closes the
 *  session for today. Its calls feed the same fold as the question tags. */
export const LESSON_PROGRESS_TOOL = "lesson_progress";

export const lessonProgressInput = Type.Object({
	done: Type.Array(Type.String({ minLength: 1 }), {
		description:
			"REQUIRED — the plan node ids this turn finished teaching (taught, and he showed he has it), or [] when none. They show as done on his map.",
	}),
	close: Type.Optional(
		Type.Boolean({
			description: "true when this turn ends the session for today (your close). Omit otherwise.",
		}),
	),
});
export type LessonProgressInput = Static<typeof lessonProgressInput>;

/** A recorded lesson_progress call's arguments, read the way the tool
 *  boundary accepted them (a `done` sent as a JSON string included). */
export function lessonProgressOf(input: unknown): LessonProgressInput | undefined {
	return boundaryParse<LessonProgressInput>(lessonProgressInput, input);
}

/** One tool call, as the fold reads it. */
interface PlanCall {
	name: string;
	input: unknown;
}

/** Whether `step` is one `of` rests on, directly or through others: a
 *  step before it in teaching order on every path. */
function restsOn(tree: PlanTree, of: string, step: string): boolean {
	const seen = new Set<string>();
	const queue = [of];
	while (queue.length > 0) {
		const at = queue.shift()!;
		for (const edge of tree.edges) {
			if (edge.to !== at || seen.has(edge.from)) continue;
			if (edge.from === step) return true;
			seen.add(edge.from);
			queue.push(edge.from);
		}
	}
	return false;
}

/** Where the lesson stands, from its calls in order: a tagged question
 *  moves the position there (leaving a node marks it visited); a
 *  lesson_progress call marks its `done` nodes visited and, when one is the
 *  current node, leaves it, so nothing is current until the next tag. A
 *  question on a step already done is a recall check and moves nothing. A
 *  question on a step the current one rests on, taught out of order, marks
 *  it visited and leaves the position where it was (round 13, 2 n5: step 6
 *  of 7 went back to step 5). Ids missing from the tree move nothing. */
function foldPlanCalls(tree: PlanTree, calls: Iterable<PlanCall>): DerivedPlanStatuses {
	const ids = new Set(tree.nodes.map((n) => n.id));
	let current: string | null = null;
	const visited = new Set<string>();
	const done = new Set<string>();
	for (const call of calls) {
		if (POSITION_QUESTION_TOOLS.includes(call.name)) {
			const nodeId = (call.input as { nodeId?: unknown } | undefined)?.nodeId;
			if (typeof nodeId !== "string" || !ids.has(nodeId)) continue;
			// A question on a step already done is a recall check: the strip
			// moves only forward (round 12, 2 n6: step 7 back to step 6).
			if (done.has(nodeId)) continue;
			// The strip never moves back to a step behind the one he is on.
			if (current !== null && current !== nodeId && restsOn(tree, current, nodeId)) {
				visited.add(nodeId);
				continue;
			}
			if (current !== null && current !== nodeId) visited.add(current);
			current = nodeId;
		} else if (call.name === LESSON_PROGRESS_TOOL) {
			for (const id of lessonProgressOf(call.input)?.done ?? []) {
				if (!ids.has(id)) continue;
				visited.add(id);
				done.add(id);
				if (current === id) current = null;
			}
		}
	}
	return { current, visited, done };
}

export function derivePlanStatuses(tree: PlanTree, messages: readonly PartsCarrier[]): DerivedPlanStatuses {
	return foldPlanCalls(
		tree,
		messages.flatMap((m) => m.parts.filter((p) => p.type.startsWith("tool-")).map((p) => ({ name: p.type.slice("tool-".length), input: p.input }))),
	);
}

/**
 * The plan tool result (author-once protocol, 2026-09-03): ONE server-side
 * tool, plan_init (tools/plan.ts) — a mermaid `graph TD` block canonicalized
 * into the structured tree, called once at the probe→teach seam and
 * re-callable to rewrite. The former mutation/tracking tools are gone:
 * statuses derive from check outcomes (derivePlanStatuses above), so the
 * tree carries structure, never progress. The tree panel still derives its
 * display from the LATEST plan tool output in the transcript — plus the
 * derived statuses — with no separate state channel.
 */
export interface PlanToolResult {
	ok: boolean;
	error?: string;
	/** The saved tree — SUCCESS results only (owner, context diet
	 *  2026-10-09): this is the record/UI-facing `details` value. The
	 *  agent-facing content never carries it — content is the validated
	 *  nodeIds + reminder; failures carry just the error. The plan
	 *  popup's latestTree seam reads this field. */
	tree?: PlanTree;
}


// ─── the native fold (Wave D: derivePlanStatuses over LhMessage[]) ───────────

import type { LhMessage } from "../native-messages.ts";
import { POSITION_QUESTION_TOOLS } from "../question-core.ts";
import { Type, type Static } from "typebox";
import { boundaryParse } from "../tool-parts.ts";

/** The same derivation over the NATIVE record: tagged question CALLS only (any state —
 *  a dangling call still moves position; results feed nothing). */
export function derivePlanStatusesLh(tree: PlanTree, messages: readonly LhMessage[]): DerivedPlanStatuses {
	return foldPlanCalls(tree, lhToolCalls(messages));
}

/** Every tool call the record's assistant messages made, in order. */
export function lhToolCalls(messages: readonly LhMessage[]): PlanCall[] {
	return messages.flatMap((m) => {
		if ((m as { role?: string }).role !== "assistant") return [];
		const content = (m as { content?: unknown }).content;
		if (!Array.isArray(content)) return [];
		return (content as Array<{ type?: string; name?: string; arguments?: unknown }>)
			.filter((block) => block.type === "toolCall")
			.map((block) => ({ name: block.name ?? "", input: block.arguments }));
	});
}
