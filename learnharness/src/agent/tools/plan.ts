import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import { derivePlanStatusesLh, LESSON_PROGRESS_TOOL, lessonProgressInput, PLAN_MAP_CAP, type PlanToolResult, type PlanTree } from "../../core/contracts.ts";
import type { ChatStore } from "../../core/ports.ts";
import type { ChatRecord } from "../../core/contracts/chat.ts";
import { createTree, planDropsSteps, planMapTooBig, planStepIsTheTopic, planTitlesGiveAway, PlanTreeError } from "../../core/plan-tree.ts";
import { parseMermaidPlan } from "./mermaid-plan.ts";
import type { CourseToolContext } from "./course.ts";
import { sessionTopicsOf } from "../../core/native-messages.ts";
import { topicsToIntroduce, type CourseMap } from "../../core/contracts/course-map.ts";
import { plannedDayWords } from "../../core/day-words.ts";

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

type LessonDay = { planned: string; planned_words: string } | { starts: string; starts_words: string } | { continues: string; continues_words: string };

/** Each of the lesson's topics on the plan as the engine holds it after the
 *  close's save: its next review, its start while untaught, or the day a
 *  lesson he began continues, in the words the close copies. Read after
 *  the save, so the close never names a day its own save has already
 *  moved. */
async function lessonDays(course: CourseToolContext, candidates: readonly string[]): Promise<{ days: Record<string, LessonDay>; dayItems?: DayItems } | undefined> {
	if (candidates.length === 0) return undefined;
	const mapped = await course.records.map(course.course.workspace);
	if (!mapped.ok) return undefined;
	const wanted = new Set(candidates);
	const days: Record<string, LessonDay> = {};
	for (const topic of mapped.map.topics) {
		if (!wanted.has(topic.handle)) continue;
		if (topic.review) days[topic.handle] = { planned: topic.review.date, planned_words: plannedDayWords(topic.review.date, mapped.map.today) };
		// A lesson he began continues that day, as the app says it; one he
		// worked on today is today's until the close, which names the day
		// it goes on after today (round 14, m2).
		else if (topic.starts && topic.startsWhy?.kind === "begun") {
			const day = topic.starts === mapped.map.today && topic.startsWhy.then ? topic.startsWhy.then : topic.starts;
			days[topic.handle] = { continues: day, continues_words: plannedDayWords(day, mapped.map.today) };
		}
		else if (topic.starts) days[topic.handle] = { starts: topic.starts, starts_words: plannedDayWords(topic.starts, mapped.map.today) };
	}
	const dayItems = dayItemsOf(mapped.map, days);
	return { days, ...(dayItems ? { dayItems } : {}) };
}

/** Everything the plan holds in this course on each day from today to
 *  the last day the close gives a lesson topic (`days`): its reviews,
 *  starts and lessons that go on, by title, each day with the lesson's own
 *  topics, so a close that names what a day holds names all of it (round
 *  14, m4: "On Wednesday 11 November you have your Matrix multiplication
 *  review and you start Linear maps" left out the Determinants review). */
export type DayItems = Record<string, { day_words: string; items: string[]; lesson: string[] }>;

function dayItemsOf(map: CourseMap, days: Record<string, LessonDay>): DayItems | undefined {
	const last = Object.values(days)
		.map((d) => ("planned" in d ? d.planned : "starts" in d ? d.starts : d.continues))
		.sort()
		.pop();
	if (!last) return undefined;
	const lesson = map.topics.filter((t) => t.handle in days).map((t) => t.title);
	const items: DayItems = {};
	const add = (date: string | undefined, item: string) => {
		if (!date || date < map.today || date > last) return;
		(items[date] ??= { day_words: plannedDayWords(date, map.today), items: [], lesson }).items.push(item);
	};
	for (const t of map.topics) {
		if (t.excluded) continue;
		if (t.review) add(t.review.date, `${t.title} review`);
		else if (t.startsWhy?.kind === "begun" && t.starts) add(t.starts === map.today && t.startsWhy.then ? t.startsWhy.then : t.starts, `${t.title} lesson continues`);
		else if (t.starts && t.level === "new") add(t.starts, `${t.title} starts`);
	}
	return Object.keys(items).length > 0 ? Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b))) : undefined;
}

/**
 * The plan tool — AUTHOR-ONCE protocol (2026-09-03 design pass): the teacher
 * WRITES the map and never tracks progress. One tool, plan_init, takes the
 * whole dependency map as a mermaid `graph TD` block:
 *
 *   - call it ONCE right after the probe concludes; the tutor teaches the
 *     first step in the same turn (Edo, 14 Nov 2026: no approval of a map
 *     of material he doesn't know yet — he interrupts when he wants)
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
			"Ids are permanent lowercase slugs (a-z, 0-9, hyphens/underscores) — checks reference them via nodeId. " +
			"Each title is one line naming the question its step answers, never its result: he reads every title before the step is taught, " +
			"so a title holding a relation sign (=, ≠, →, ≤, ∈ or their TeX) or a condition in words (in every, for every, always, never, only if, iff, exactly when) is refused, " +
			"notation holding one included: `pmf[The probability of $k$ events]`, never \"The formula for $P(X=k)$\". " +
			"`-->` means 'from = prerequisite' (chains fine); no subgraphs, styles, or classes.",
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
				"with that step's node id in `done`; in the turn that ends the session, add `close: true` before your closing words. " +
				"The close's result gives each of the lesson's topics its day on the plan after the close: a day your closing words name is one of these, copied as written. " +
				"Its `day_items` lists everything the plan holds on each of those days: name a day by itself, or with all it holds, never with part of it.",
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
				const topics = [...new Set([...(record.topics ?? []), ...sessionTopicsOf(record.messages)])];
				const introduced = await introduceLessonTopics(ctx.course, topics);
				const read = await lessonDays(ctx.course, topics);
				return { ok: true, ...(introduced ? { record: introduced } : {}), ...(read ? { days: read.days } : {}), ...(read?.dayItems ? { day_items: read.dayItems } : {}) };
			}),
		},
		plan_init: {
			name: "plan_init",
			label: "plan_init",
			description:
				"Write or REWRITE this session's plan map — the dependency graph the learner follows live in the plan window. " +
				"Call once right after the probe concludes, then start teaching the first step in the same turn: he sees the map live and needs to approve nothing. " +
				"Re-call whenever the map is wrong (the new block replaces the old tree); once a step is taught, a rewrite of the same lesson keeps every step not marked done, with its id (refused otherwise): mark one he holds done with lesson_progress. " +
				"A mermaid graph block (any direction): one node per line (`slug[Short Title]` — slugs are permanent lowercase ids: a-z, 0-9, hyphens/underscores), " +
				"each title naming the question the step answers, never its result: he sees it before the step is taught, so no relation in a title (=, ≠, →, ≤, ∈ or their TeX, an equation that names a problem too: `inverse-solve[Solving a system with the inverse]`, never \"Solving $Ax = b$ with $A^{-1}$\"; refused), no condition in words (in every, for every, always, never, only if, iff, exactly when; refused), and maths in `$…$` only names a thing, with no relation sign inside it, an event's notation included (`pmf[The probability of $k$ events]`, never \"The formula for $P(X=k)$\"; refused). " +
				"A title holding square brackets is quoted: `row-reduce[\"Row reducing $[A \\mid I]$\"]`. " +
				"The topic itself is never a step: no node is named after the lesson's topic or goal (refused). " +
				"`-->` edges meaning 'from must be understood before to' (chains fine). " +
				`One idea per step, and the map fits his lesson map on one screen: at most ${PLAN_MAP_CAP.steps} steps, no chain longer than ${PLAN_MAP_CAP.deep}; a bigger map is refused. ` +
				"Every check you fire names the node it assesses via `nodeId`; where the lesson stands derives from those tags.",
			parameters: planInitInput,
			execute: serverExecute("plan_init", planInitInput, async ({ mermaid, goal }) => {
				const { chatId, chatStore } = ctx;
				const record = chatStore.getChat(chatId);
				if (!record) return { ok: false, error: `Chat not found: ${chatId}` };
				const checked = checkPlanInit(record, mermaid, goal);
				if (!checked.ok) return checked;
				const next = checked.tree;
				chatStore.saveTree(chatId, next);
				if (goal && !record.tree) chatStore.nameSession(chatId, goal);
				// Context diet: content = the validated nodeIds + the reminder (the
				// ids just became binding for every explain call); details =
				// the full tree for the record/UI — the plan popup's latestTree
				// seam, agent-invisible (the serializer sends content only).
				return planInitResult(next);
			}),
		},
	};
}

/** What a clean plan_init tells the tutor: the map's ids, now binding. */
export function planInitResult(next: PlanTree) {
	return {
		text: JSON.stringify({
			ok: true,
			nodeIds: next.nodes.map((n) => n.id),
			reminder: PLAN_NODE_IDS_REMINDER,
		}),
		details: { ok: true, tree: next },
	};
}

/** plan_init's checks on a map for this lesson, every problem at once, so
 *  one rewrite fixes them all. Pure: the plan draft (server/plan-draft.ts)
 *  runs the same checks and saves nothing. */
export function checkPlanInit(
	record: Pick<ChatRecord, "tree" | "messages" | "title">,
	mermaid: string,
	goal: { title: string; topic?: string } | undefined,
): { ok: false; error: string } | { ok: true; tree: PlanTree } {
	const parsed = parseMermaidPlan(mermaid);
	// The parser collects every problem; the teacher fixes and retries. No
	// tree echo — the model needs the problems, not a restatement of the map
	// it is rewriting (owner, context diet 2026-10-09).
	if (!parsed.ok || !parsed.plan) return { ok: false, error: parsed.problems.join("\n") };
	try {
		// createTree validates the structure (duplicate ids, missing edge
		// endpoints, self-loops, cycles → PlanTreeError).
		const next = createTree(parsed.plan.nodes, parsed.plan.edges);
		const lesson = { topic: goal?.topic, titles: [goal?.title, record.title].filter((t): t is string => typeof t === "string") };
		const taught = record.tree ? derivePlanStatusesLh(record.tree, record.messages) : null;
		const problems = [planMapTooBig(next), planTitlesGiveAway(next), planStepIsTheTopic(next, lesson), planDropsSteps(record.tree, next, (taught?.visited.size ?? 0) > 0 || taught?.current != null, taught?.done ?? new Set())].filter((p): p is string => p !== null);
		if (problems.length > 0) return { ok: false, error: problems.join("\n") };
		return { ok: true, tree: next };
	} catch (err) {
		if (err instanceof PlanTreeError) return { ok: false, error: err.message };
		throw err;
	}
}