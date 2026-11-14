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
import { firstTurnTopics } from "../core/session-naming.ts";

export interface SessionNamingDeps {
	chatStore: ChatStore;
	courseRecords: Pick<CourseRecords, "map">;
}

/** Name the session after its first turn's topic when nothing named it.
 *  Returns whether it named it. */
export async function nameFromFirstTurn(deps: SessionNamingDeps, chatId: string): Promise<boolean> {
	const record = deps.chatStore.getChat(chatId);
	if (!record?.course || record.named || record.renamed || (record.topics ?? []).length > 0) return false;
	if (!record.messages.some((m) => m.role === "assistant" && m.stopReason === "stop")) return false;
	const candidates = firstTurnTopics(record.messages);
	if (candidates.length === 0) return false;
	const mapped = await deps.courseRecords.map(record.course.workspace);
	if (!mapped.ok) return false;
	const topic = candidates.flatMap((handle) => mapped.map.topics.find((t) => t.handle === handle) ?? [])[0];
	if (!topic) return false;
	deps.chatStore.nameSession(chatId, { title: topic.title, topic: topic.handle });
	return true;
}

/** Subscribe to settled turns. Returns the unsubscribe. */
export function onSessionNaming(deps: SessionNamingDeps): () => void {
	return subscribe((event) => {
		if (event.type === "turn-settled") void nameFromFirstTurn(deps, event.chatId).catch(() => {});
	});
}
