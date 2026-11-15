/**
 * The answer cards' marks (Edo, 14 Nov 2026): each answer's recorded
 * attempts, read whole from the engine with `show`, and the attempts that
 * correct them, so a card shows the mark that stands. The link from an
 * answer to its attempts is the transcript's (core/answer-marks.ts); every
 * field of the mark is the engine's.
 */

import { answerMarksOf, correctorsToRead, markLinks } from "../core/answer-marks.ts";
import type { AnswerMarksResponse } from "../core/contracts/marks.ts";
import { stores } from "./stores.ts";

/** How many rounds of corrections one read follows. */
const CHAIN_ROUNDS = 8;

function items(json: unknown): Record<string, unknown> {
	const value = (json as { items?: unknown } | null)?.items;
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** `show` for these handles; one at a time when the batch is refused, so
 *  a forgotten observation leaves only its own answer unmarked. */
async function shown(workspace: string, handles: readonly string[]): Promise<Record<string, unknown>> {
	if (handles.length === 0) return {};
	const batch = await stores.courseRecords.run(workspace, { verb: "show", handles: [...handles] });
	if (batch.ok) return items(batch.json);
	if (batch.kind !== "validation" || handles.length === 1) return {};
	const single = await Promise.all(handles.map((handle) => shown(workspace, [handle])));
	return Object.assign({}, ...single) as Record<string, unknown>;
}

/** GET /api/chats/:id/marks's answer. A session with no course, or an
 *  engine that cannot be read, has no marks. */
export async function answerMarks(chatId: string): Promise<{ status: 200 | 404; body: AnswerMarksResponse }> {
	const chat = stores.chatStore.getChat(chatId);
	if (!chat) return { status: 404, body: { ok: false, error: "Not found" } };
	const workspace = chat.course?.workspace;
	const links = markLinks(chat.messages);
	const linked = [...new Set(Object.values(links).flat())];
	if (!workspace || linked.length === 0) return { status: 200, body: { ok: true, marks: {} } };
	const observations = await shown(workspace, linked);
	for (let round = 0; round < CHAIN_ROUNDS; round++) {
		const next = correctorsToRead(observations, Object.keys(observations));
		if (next.length === 0) break;
		Object.assign(observations, await shown(workspace, next));
	}
	const unlabelled = answerMarksOf(links, observations);
	const topics = [...new Set(Object.values(unlabelled).flatMap((mark) => (mark.rows.length > 1 ? mark.rows.flatMap((row) => row.topics) : [])))];
	if (topics.length === 0) return { status: 200, body: { ok: true, marks: unlabelled } };
	const titles = Object.fromEntries(
		Object.entries(await shown(workspace, topics)).flatMap(([handle, topic]) => {
			const title = (topic as { title?: unknown } | null)?.title;
			return typeof title === "string" ? [[handle, title]] : [];
		}),
	);
	return { status: 200, body: { ok: true, marks: answerMarksOf(links, observations, titles) } };
}
