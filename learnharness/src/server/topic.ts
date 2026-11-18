/**
 * The topic page's server seam: the engine's `show` for one topic and the
 * open tasks that hold it, the plan of each of its sessions, and which of
 * them saved each attempt. The
 * engine's JSON and the stored sessions are parsed here, so the page gets
 * only the contract (core/contracts/topic.ts) and nothing else of a
 * transcript leaves the server.
 */

import { markLinks, savedOf } from "../core/answer-marks.ts";
import type { ChatRecord } from "../core/contracts/chat.ts";
import { chosenSure } from "../core/contracts/marks.ts";
import { derivePlanStatusesLh, lhToolCalls } from "../core/contracts/plan.ts";
import { POSITION_QUESTION_TOOLS } from "../core/question-core.ts";
import type { SessionPlan, TopicAttempt, TopicReadResponse, TopicRecord, TopicRef } from "../core/contracts/topic.ts";
import { planDays, plannedOf } from "./calendar.ts";
import type { CourseResult } from "../core/contracts/course.ts";
import { listCourses } from "./courses.ts";
import { stores } from "./stores.ts";
import { homeMap } from "./study.ts";

/** The most sessions one read names. */
export const TOPIC_READ_SESSIONS = 20;

const SESSION_ID = /^[A-Za-z0-9_-]+$/;
const RESULTS = ["correct", "partial", "incorrect"] as const;
const GRADES = ["solid", "helped", "missed"] as const;

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** One `evidence` entry as a scored attempt and the ids it corrects; null
 *  for a self-report or an entry without a result, a day or a sentence. */
function attemptOf(id: string, entry: unknown): { attempt: TopicAttempt; corrects: string[] } | null {
	const e = record(entry);
	if (!e || (e.kind !== "attempt" && e.kind !== "exam")) return null;
	const result = RESULTS.find((r) => r === e.result);
	const date = str(e.date);
	const text = str(e.text);
	if (!result || !date || !text) return null;
	return {
		attempt: {
			id,
			date,
			recorded: str(e.recorded),
			result,
			unaided: e.kind === "exam" || e.help === "none",
			grade: GRADES.find((g) => g === e.grade) ?? null,
			gaveUp: e.gave_up === true,
			predicted: e.predicted === true,
			uncertain: typeof e.uncertain === "string",
			sure: chosenSure(e.sure),
			chose: str(e.chose),
			text,
			session: null,
		},
		corrects: strings(e.corrects),
	};
}

/** The topic's `refs` as places in his material: each source named by
 *  the title `show` gives it under `sources` (its handle when it has
 *  none), with its locator; a ref to no listed source is left out. Pure. */
function refsOf(topic: Record<string, unknown>, sources: Record<string, unknown>): TopicRef[] {
	const refs = Array.isArray(topic.refs) ? topic.refs : [];
	return refs.flatMap((entry) => {
		const ref = record(entry);
		const key = str(ref?.source);
		const source = key ? record(sources[key]) : null;
		return key && source ? [{ source: str(source.title) ?? key, locator: str(ref?.locator) }] : [];
	});
}

/** Which session saved each observation, from the sessions' transcripts:
 *  every attempt their answers' marks link (`markLinks`), and every one
 *  their own saves' receipts name (`savedOf`), so an answer saved with
 *  no card to mark, as a seeded session's or one given in words, still sits
 *  under its session's line in Earlier (round 14, m30). Pure. */
export function savedBy(chats: readonly ChatRecord[]): Map<string, string> {
	const saved = new Map<string, string>();
	for (const chat of chats) for (const ids of Object.values(markLinks(chat))) for (const id of ids) saved.set(id, chat.id);
	for (const chat of chats) for (const id of savedOf(chat.messages, chat.answerSaves)) if (!saved.has(id)) saved.set(id, chat.id);
	return saved;
}

/**
 * The page's view of the engine's `show <topic> <task>…` output, or null
 * when it does not hold the topic. Attempts keep the engine's order,
 * and the topic's refs name the places in his material it points to,
 * newest first; a self-report is not an attempt, and an attempt a later
 * one corrects is left out, as the engine leaves it out of the standing.
 * Each attempt names the session that saved it (`saved`, from `savedBy`),
 * or saved an attempt it corrects. Pure.
 */
export function topicRecordOf(show: unknown, handle: string, taskKeys: readonly string[], saved: ReadonlyMap<string, string> = new Map()): TopicRecord | null {
	const items = record(record(show)?.items);
	const topic = record(items?.[handle]);
	if (!items || !topic || topic.kind !== "topic") return null;
	const evidence = record(record(show)?.evidence) ?? {};
	const scored = strings(topic.observations).flatMap((id) => attemptOf(id, evidence[id]) ?? []);
	const corrected = new Set(scored.flatMap((s) => s.corrects));
	const sessionOf = (id: string, corrects: readonly string[]) => saved.get(id) ?? corrects.map((c) => saved.get(c)).find((s) => s !== undefined) ?? null;
	return {
		attempts: scored.filter((s) => !corrected.has(s.attempt.id)).map((s) => ({ ...s.attempt, session: sessionOf(s.attempt.id, s.corrects) })),
		refs: refsOf(topic, record(record(show)?.sources) ?? {}),
		tasks: taskKeys.flatMap((key) => {
			const task = record(items[key]);
			return task?.kind === "task" ? [{ key, updated: str(task.updated) }] : [];
		}),
	};
}

/** The step the newest step-tagged question asks about, whatever the
 *  strip's position does with it (a check back on a step done moves
 *  nothing there); null before any. Pure. */
export function askedStep(tree: NonNullable<ChatRecord["tree"]>, messages: ChatRecord["messages"]): string | null {
	const ids = new Set(tree.nodes.map((node) => node.id));
	const tagged = lhToolCalls(messages).flatMap((call) => {
		const nodeId = POSITION_QUESTION_TOOLS.includes(call.name) ? (call.input as { nodeId?: unknown } | undefined)?.nodeId : undefined;
		return typeof nodeId === "string" && ids.has(nodeId) ? [nodeId] : [];
	});
	return tagged.at(-1) ?? null;
}

/** A stored session's plan and where its transcript puts him on it, or
 *  null when its tutor authored none. Pure. */
export function sessionPlanOf(chat: ChatRecord): SessionPlan | null {
	const { tree } = chat;
	if (!tree || tree.nodes.length === 0) return null;
	const { current, visited } = derivePlanStatusesLh(tree, chat.messages);
	const asked = askedStep(tree, chat.messages);
	return {
		id: chat.id,
		tree: {
			nodes: tree.nodes.map(({ id, title, summary }) => (summary === undefined ? { id, title } : { id, title, summary })),
			edges: tree.edges.map(({ from, to }) => ({ from, to })),
		},
		current,
		visited: [...visited],
		...(asked !== current ? { asked } : {}),
	};
}

/** The first day of `plan`'s daily plan that reviews the topic, from
 *  today on; null when it reviews it on none. Pure. */
export function firstReviewOf(plan: unknown, handle: string): string | null {
	return plannedOf(plan, { topics: [{ handle } as never] }).find((day) => day.reviews.includes(handle as never))?.date ?? null;
}

/** Every topic of a course as the engine shows it, in one read kept until a
 *  record changes; null when the course's map cannot be read or has no
 *  topics. Showing a topic replays the course's plan, and a topic's item is
 *  the same whatever else is shown beside it, so one read serves every topic
 *  page of the course where each topic ran its own (round 15, P7). */
export async function topicsShown(workspace: string): Promise<CourseResult | null> {
	const map = await homeMap(workspace);
	if (!map.ok || map.map.topics.length === 0) return null;
	return stores.courseRecords.run(workspace, { verb: "show", handles: map.map.topics.map((t) => t.handle) });
}

/** The topic and the tasks that hold it, as one `show` prints them: the topic
 *  from the course's kept read of every topic (`topicsShown`), the tasks
 *  (no plan to replay) read beside it; one `show` of them all where that read
 *  does not hold the topic. */
async function shownFor(workspace: string, handle: string, taskKeys: readonly string[]): Promise<CourseResult> {
	const alone = () => stores.courseRecords.run(workspace, { verb: "show", handles: [handle, ...taskKeys] });
	const [every, tasks] = await Promise.all([topicsShown(workspace), taskKeys.length > 0 ? stores.courseRecords.run(workspace, { verb: "show", handles: [...taskKeys] }) : null]);
	const topics = every?.ok ? record(every.json) : null;
	if (!topics || !record(topics.items)?.[handle] || (tasks && !tasks.ok)) return alone();
	const held = tasks?.ok ? (record(tasks.json) ?? {}) : {};
	const merged = (key: string) => ({ ...record(topics[key]), ...record(held[key]) });
	return { ok: true, json: { ...topics, items: merged("items"), evidence: merged("evidence"), sources: merged("sources") } };
}

/**
 * GET /api/topic's answer: the topic's record and the plans of the named
 * sessions that belong to the course, and for a lesson he began (`begun`)
 * the day the engine's daily plan first reviews the topic, read over the
 * calendar's days (round 14, m36: the begun Poisson page said "Lesson
 * continues · Today" and nothing of the review the plan puts after it).
 * Only a course the engine lists is read, as for the course map. An
 * engine failure answers with no record and the plans, since the page can
 * still say where a lesson stands.
 */
export async function topicRead(
	workspace: string,
	handle: string,
	taskKeys: readonly string[],
	sessionIds: readonly string[],
	begun = false,
): Promise<{ status: 200 | 400 | 404; body: TopicReadResponse }> {
	const bad = (error: string) => ({ status: 400 as const, body: { ok: false as const, code: "bad_request" as const, error } });
	if (!handle) return bad("A topic is required");
	if (sessionIds.length > TOPIC_READ_SESSIONS) return bad(`At most ${TOPIC_READ_SESSIONS} sessions`);
	if (!sessionIds.every((id) => SESSION_ID.test(id))) return bad("A session id is not valid");
	const listing = await listCourses();
	const course = listing.available ? listing.courses.find((c) => c.workspace === workspace) : undefined;
	if (!course) {
		return { status: 404, body: { ok: false, code: "unknown_course", error: "No registered course has this folder" } };
	}
	const [shown, plan] = await Promise.all([
		shownFor(workspace, handle, taskKeys),
		begun ? stores.courseRecords.run(workspace, { verb: "plan", days: planDays(course) }) : null,
	]);
	const chats = sessionIds.flatMap((id) => {
		const chat = stores.chatStore.getChat(id);
		return chat && chat.course?.workspace === workspace ? [chat] : [];
	});
	const plans = chats.flatMap((chat) => sessionPlanOf(chat) ?? []);
	const record = shown.ok ? topicRecordOf(shown.json, handle, taskKeys, savedBy(chats)) : null;
	return { status: 200, body: { ok: true, record, plans, ...(plan ? { firstReview: plan.ok ? firstReviewOf(plan.json, handle) : null } : {}) } };
}
