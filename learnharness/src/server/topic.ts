/**
 * The topic page's server seam: the engine's `show` for one topic and the
 * open tasks that hold it, and the plan of each of its sessions. The
 * engine's JSON and the stored sessions are parsed here, so the page gets
 * only the contract (core/contracts/topic.ts) and nothing else of a
 * transcript leaves the server.
 */

import type { ChatRecord } from "../core/contracts/chat.ts";
import { derivePlanStatusesLh } from "../core/contracts/plan.ts";
import type { SessionPlan, TopicAttempt, TopicReadResponse, TopicRecord, TopicRef } from "../core/contracts/topic.ts";
import { listCourses } from "./courses.ts";
import { stores } from "./stores.ts";

/** The most sessions one read names. */
export const TOPIC_READ_SESSIONS = 20;

const SESSION_ID = /^[A-Za-z0-9_-]+$/;
const RESULTS = ["correct", "partial", "incorrect"] as const;
const SURE = ["guess", "neutral", "confident"] as const;

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
			sure: SURE.find((s) => s === e.sure) ?? null,
			chose: str(e.chose),
			text,
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

/**
 * The page's view of the engine's `show <topic> <task>…` output, or null
 * when it does not hold the topic. Attempts keep the engine's order,
 * and the topic's refs name the places in his material it points to,
 * newest first; a self-report is not an attempt, and an attempt a later
 * one corrects is left out, as the engine leaves it out of the standing.
 * Pure.
 */
export function topicRecordOf(show: unknown, handle: string, taskKeys: readonly string[]): TopicRecord | null {
	const items = record(record(show)?.items);
	const topic = record(items?.[handle]);
	if (!items || !topic || topic.kind !== "topic") return null;
	const evidence = record(record(show)?.evidence) ?? {};
	const scored = strings(topic.observations).flatMap((id) => attemptOf(id, evidence[id]) ?? []);
	const corrected = new Set(scored.flatMap((s) => s.corrects));
	return {
		attempts: scored.map((s) => s.attempt).filter((a) => !corrected.has(a.id)),
		refs: refsOf(topic, record(record(show)?.sources) ?? {}),
		tasks: taskKeys.flatMap((key) => {
			const task = record(items[key]);
			return task?.kind === "task" ? [{ key, updated: str(task.updated) }] : [];
		}),
	};
}

/** A stored session's plan and where its transcript puts him on it, or
 *  null when its tutor authored none. Pure. */
export function sessionPlanOf(chat: ChatRecord): SessionPlan | null {
	const { tree } = chat;
	if (!tree || tree.nodes.length === 0) return null;
	const { current, visited } = derivePlanStatusesLh(tree, chat.messages);
	return {
		id: chat.id,
		tree: {
			nodes: tree.nodes.map(({ id, title, summary }) => (summary === undefined ? { id, title } : { id, title, summary })),
			edges: tree.edges.map(({ from, to }) => ({ from, to })),
		},
		current,
		visited: [...visited],
	};
}

/**
 * GET /api/topic's answer: the topic's record and the plans of the named
 * sessions that belong to the course. Only a course the engine lists is
 * read, as for the course map. An engine failure answers with no record
 * and the plans, since the page can still say where a lesson stands.
 */
export async function topicRead(
	workspace: string,
	handle: string,
	taskKeys: readonly string[],
	sessionIds: readonly string[],
): Promise<{ status: 200 | 400 | 404; body: TopicReadResponse }> {
	const bad = (error: string) => ({ status: 400 as const, body: { ok: false as const, code: "bad_request" as const, error } });
	if (!handle) return bad("A topic is required");
	if (sessionIds.length > TOPIC_READ_SESSIONS) return bad(`At most ${TOPIC_READ_SESSIONS} sessions`);
	if (!sessionIds.every((id) => SESSION_ID.test(id))) return bad("A session id is not valid");
	const listing = await listCourses();
	if (!listing.available || !listing.courses.some((c) => c.workspace === workspace)) {
		return { status: 404, body: { ok: false, code: "unknown_course", error: "No registered course has this folder" } };
	}
	const shown = await stores.courseRecords.run(workspace, { verb: "show", handles: [handle, ...taskKeys] });
	const plans = sessionIds.flatMap((id) => {
		const chat = stores.chatStore.getChat(id);
		return chat && chat.course?.workspace === workspace ? (sessionPlanOf(chat) ?? []) : [];
	});
	return { status: 200, body: { ok: true, record: shown.ok ? topicRecordOf(shown.json, handle, taskKeys) : null, plans } };
}
