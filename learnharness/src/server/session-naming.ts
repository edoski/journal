/**
 * Every session has a short, literal name after its first turn. The opening
 * agents name it themselves (`name_session`); when a first reply did not,
 * the turn settling names it after the course topic that turn looked at
 * (`firstTurnTopics`). One subscriber on the event bus; nothing runs on a
 * clock. `ChatStore.nameSession` keeps a session started on a topic,
 * renamed by him or named already as it is.
 */

import { subscribe } from "../core/events.ts";
import type { ChatStore, CourseRecords } from "../core/ports.ts";
import { firstTurnTopics, onFirstTurn } from "../core/session-naming.ts";
import { lessonTakenUp } from "../core/session-opening.ts";

export interface SessionNamingDeps {
	chatStore: ChatStore;
	courseRecords: Pick<CourseRecords, "map">;
}

/** Name the session after its first turn's topic when nothing named it.
 *  Returns whether it named it. */
export async function nameFromFirstTurn(deps: SessionNamingDeps, chatId: string): Promise<boolean> {
	const record = deps.chatStore.getChat(chatId);
	if (!record?.course || record.named || record.renamed || (record.topics ?? []).length > 0) return false;
	// Its first reply came, a question included, and nothing he did followed.
	if (!record.messages.some((m) => m.role === "assistant" && m.stopReason !== "aborted" && m.stopReason !== "error") || !onFirstTurn(record.messages)) return false;
	const candidates = firstTurnTopics(record.messages);
	if (candidates.length === 0) return false;
	const mapped = await deps.courseRecords.map(record.course.workspace);
	if (!mapped.ok) return false;
	const topic = candidates.flatMap((handle) => mapped.map.topics.find((t) => t.handle === handle) ?? [])[0];
	if (!topic) return false;
	deps.chatStore.nameSession(chatId, { title: topic.title, topic: topic.handle });
	return true;
}

/** Name a session after the lesson it took up (`lessonTakenUp`) once a
 *  turn of it settles, as its first plan names it: a review whose probe
 *  started the topic he asked for is "Expectation and linearity lesson"
 *  from that answer on, though no plan came yet (round 17, M5). The store
 *  keeps a name he gave it. Returns whether it took one up. */
export async function nameTakenUpLesson(deps: SessionNamingDeps, chatId: string): Promise<boolean> {
	const record = deps.chatStore.getChat(chatId);
	const taken = record?.course && !record.renamed ? lessonTakenUp(record) : null;
	if (!record?.course || !taken) return false;
	const mapped = await deps.courseRecords.map(record.course.workspace);
	const title = mapped.ok ? mapped.map.topics.find((t) => t.handle === taken)?.title : undefined;
	if (!title) return false;
	deps.chatStore.takeUpLesson(chatId, `${title} lesson`);
	return true;
}

/** Subscribe to settled turns. Returns the unsubscribe. */
export function onSessionNaming(deps: SessionNamingDeps): () => void {
	return subscribe((event) => {
		if (event.type !== "turn-settled") return;
		void nameFromFirstTurn(deps, event.chatId).catch(() => {});
		void nameTakenUpLesson(deps, event.chatId).catch(() => {});
	});
}
