import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import { LESSON_PROGRESS_TOOL, lessonProgressInput, PLAN_MAP_CAP, type PlanToolResult, type PlanTree } from "../../core/contracts.ts";
import type { ChatStore } from "../../core/ports.ts";
import { createTree, planMapTooBig, planTitlesGiveAway, PlanTreeError } from "../../core/plan-tree.ts";
import { parseMermaidPlan } from "./mermaid-plan.ts";
import type { CourseToolContext } from "./course.ts";
import { sessionTopicsOf } from "../../core/native-messages.ts";
import { topicsToIntroduce } from "../../core/contracts/course-map.ts";

/** The binding-id reminder riding plan_init's slim content (owner,
 *  2026-10-09): plan_init is the exact moment the node ids become
 *  load-bearing — every later explain call must reference one. The
 *  field-drop incidents (tools_fails_2) showed the turn's tail is where
 *  discipline slips; the reminder lands right there. */
const PLAN_NODE_IDS_REMINDER =
	"These are the plan's node ids — the only valid nodeId values for every explain call from here on. Reference them exactly.";

/** What the plan tools close over (the plan-tree half of the tool context). */
export interface PlanToolContext {
	chatId: string;
	/** The storage port plan tools persist through. */
	chatStore: ChatStore;
	/** The session's course: present, the close marks the lesson's new
	 *  topics introduced in the engine. */
	course?: CourseToolContext;
}

/** The close's record step: the session's topics the engine has never
 *  seen introduced are saved as introduced, through the engine's own save,
 *  so the next day's first review is scheduled without relying on the
 *  tutor to remember it. Returns what it did, for the tutor to read. */
async function introduceLessonTopics(course: CourseToolContext, candidates: readonly string[]): Promise<string> {
	if (candidates.length === 0) return "";
	const mapped = await course.records.map(course.course.workspace);
	if (!mapped.ok) return `The lesson's topics could not be marked introduced (${mapped.message}).`;
	const fresh = topicsToIntroduce(candidates, mapped.map);
	if (fresh.length === 0) return "";
	const saved = await course.records.run(course.course.workspace, {
		verb: "save",
		changes: { topics: Object.fromEntries(fresh.map((handle) => [handle, { introduced: true }])) },
	});
	return saved.ok ? `Marked introduced: ${fresh.join(", ")}.` : `The lesson's topics could not be marked introduced (${saved.message}).`;
}

/**
 * The plan tool — AUTHOR-ONCE protocol (2026-09-03 design pass): the teacher
 * WRITES the map and never tracks progress. One tool, plan_init, takes the
 * whole dependency map as a mermaid `graph TD` block:
 *
 *   - call it ONCE right after the probe concludes; the tutor states the
 *     lesson's goal in one line and starts teaching in the same turn (Edo,
 *     14 Nov 2026: no approval of a map of material he doesn't know yet —
 *     he interrupts when he wants)
 *   - the map fits his lesson map on one screen (PLAN_MAP_CAP); a bigger
 *     one is refused with what to prune or split
 *   - statuses (current / visited / upcoming) are DERIVED from the quiz
 *     nodeId tags the teacher fires (contracts.ts derivePlanStatuses) — the
 *     teacher never declares them, and there is no "done" bookkeeping
 *   - re-call it any time the map is wrong: the new block replaces the tree
 *     wholesale. Node slugs are permanent — the map tracks nothing between
 *     rewrites
 *   - checks name the node they assess (quiz nodeId, validated against the
 *     live tree at the call boundary) — that tag is the only thing statuses
 *     derive from
 *
 * The former mutation tools (add/update/remove node/edge, set_current,
 * mark_done) are gone by design: restructuring is a rewrite, tracking is
 * derived. SERVER-SIDE with execute: parse → validate → persist. The
 * result is CONTEXT-SLIM (owner, context diet 2026-10-09): the model
 * WROTE the mermaid one message ago, so content never echoes the tree —
 * it carries the validated nodeIds + the binding-nodeId reminder (the
 * exact moment the ids become load-bearing); `details` keeps the full
 * tree for the record and the plan popup (latestTree reads it — the
 * agent-invisible channel, serializer-verified).
 */
const planInitInput = Type.Object({
	mermaid: Type.String({
		minLength: 1,
		description:
			"A mermaid graph block (any direction), e.g.:\ngraph TD\n  primitives[Number primitives] --> operators[Arithmetic operators] --> expressions[Evaluating expressions]\n" +
			"The only strict rule: ids are permanent lowercase slugs (a-z, 0-9, hyphens/underscores) — checks reference them via nodeId. " +
			"Titles are free single-line text; `-->` means 'from = prerequisite' (chains fine); no subgraphs, styles, or classes.",
	}),
	goal: Type.Optional(
		Type.Object(
			{
				title: Type.String({ minLength: 1, description: "A short name for the lesson, a few words in his language, e.g. \"Eigenvalues by hand\"." }),
				topic: Type.Optional(Type.String({ minLength: 1, description: "The handle of the course topic the lesson teaches, when it teaches one." })),
			},
			{
				description:
					"What the lesson is for, on the first call: it names a session started from a free message, once, everywhere he sees it. A rewrite never renames it.",
			},
		),
	),
});

export function planTools(ctx: PlanToolContext): Record<string, AgentTool<any>> {
	return {
		[LESSON_PROGRESS_TOOL]: {
			name: LESSON_PROGRESS_TOOL,
			label: LESSON_PROGRESS_TOOL,
			description:
				"Mark plan steps done on his map, and say when you close the session for today. Call it in the turn that finishes a step, " +
				"with that step's node id in `done`; in the turn that ends the session, add `close: true` before your closing words.",
			parameters: lessonProgressInput,
			execute: serverExecute(LESSON_PROGRESS_TOOL, lessonProgressInput, async ({ done, close }) => {
				const record = ctx.chatStore.getChat(ctx.chatId);
				if (!record) return { ok: false, error: `Chat not found: ${ctx.chatId}` };
				const ids = new Set(record.tree?.nodes.map((n) => n.id) ?? []);
				const unknown = done.filter((id) => !ids.has(id));
				if (unknown.length > 0) {
					return { ok: false, error: `Not node ids of this session's plan: ${unknown.join(", ")}. Valid ids: ${[...ids].join(", ") || "(no plan yet)"}` };
				}
				if (!close || !ctx.course) return { ok: true };
				const introduced = await introduceLessonTopics(ctx.course, [...new Set([...(record.topics ?? []), ...sessionTopicsOf(record.messages)])]);
				return introduced ? { ok: true, record: introduced } : { ok: true };
			}),
		},
		plan_init: {
			name: "plan_init",
			label: "plan_init",
			description:
				"Write or REWRITE this session's plan map — the dependency graph the learner follows live in the plan window. " +
				"Call once right after the probe concludes, then state the lesson's goal in one line and start teaching in the same turn: he sees the map live and needs to approve nothing. " +
				"Re-call whenever the map is wrong (the new block replaces the old tree). " +
				"A mermaid graph block (any direction): one node per line (`slug[Short Title]` — slugs are permanent lowercase ids: a-z, 0-9, hyphens/underscores), " +
				"each title naming what the step teaches, never its result: he sees it before the step is taught. " +
				"`-->` edges meaning 'from must be understood before to' (chains fine). " +
				`One idea per step, and the map fits his lesson map on one screen: at most ${PLAN_MAP_CAP.steps} steps, no chain longer than ${PLAN_MAP_CAP.deep}; a bigger map is refused. ` +
				"Every check you fire names the node it assesses via `nodeId`; where the lesson stands derives from those tags.",
			parameters: planInitInput,
			execute: serverExecute("plan_init", planInitInput, async ({ mermaid, goal }) => {
				const { chatId, chatStore } = ctx;
				const record = chatStore.getChat(chatId);
				if (!record) return { ok: false, error: `Chat not found: ${chatId}` };

				const parsed = parseMermaidPlan(mermaid);
				if (!parsed.ok || !parsed.plan) {
					// The parser collects every problem; the teacher fixes and retries.
					// No tree echo — the model needs the problems, not a restatement of
					// the map it is rewriting (owner, context diet 2026-10-09).
					return { ok: false, error: parsed.problems.join("\n") };
				}
				try {
					// createTree validates the structure (duplicate ids, missing
					// edge endpoints, self-loops, cycles → PlanTreeError).
					const next = createTree(parsed.plan.nodes, parsed.plan.edges);
					const tooBig = planMapTooBig(next) ?? planTitlesGiveAway(next);
					if (tooBig) return { ok: false, error: tooBig };
					chatStore.saveTree(chatId, next);
					if (goal && !record.tree) chatStore.nameSession(chatId, goal);
					// Context diet: content = the validated nodeIds + the reminder (the
				// ids just became binding for every explain call); details =
					// the full tree for the record/UI — the plan popup's latestTree
					// seam, agent-invisible (the serializer sends content only).
					return {
						text: JSON.stringify({
							ok: true,
							nodeIds: next.nodes.map((n) => n.id),
							reminder: PLAN_NODE_IDS_REMINDER,
						}),
						details: { ok: true, tree: next },
					};
				} catch (err) {
					if (err instanceof PlanTreeError) return { ok: false, error: err.message };
					throw err;
				}
			}),
		},
	};
}