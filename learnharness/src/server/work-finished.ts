/**
 * Work he started that finished, announced as `work-finished` for the Mac
 * app's notice (components/desktop-notices.tsx), which shows it only while
 * no window of the app is focused:
 *
 * - a course's topic map saved (course-map.ts, `onBuilt`);
 * - a new lesson's opening turn settled: the tutor's plan and first
 *   question, the wait a new lesson starts with.
 *
 * Event-driven: one subscriber on the bus, nothing on a clock.
 */

import type { ChatStore } from "../core/ports.ts";
import type { LhMessage } from "../core/native-messages.ts";
import { emit, subscribe } from "../core/events.ts";

/** Whether a turn ended on the tutor's answer: its last message, past the
 *  markers a turn lands after it (the lesson's plan-block, a compaction),
 *  is his reply, not a failure or a stop (input-events.ts
 *  `failedResponseAtEnd` skips the same markers). */
function endsOnAnswer(messages: readonly LhMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "custom" && (m.customType === "plan-block" || m.customType === "compaction")) continue;
		return m.role === "assistant" && m.stopReason !== "error" && m.stopReason !== "aborted";
	}
	return false;
}

/** Announce each new lesson's opening turn as it settles with the tutor's
 *  answer. A lesson opens on a turn that starts with no answer of the
 *  tutor's in it yet. Returns the unsubscribe. */
export function onLessonOpenings(chatStore: ChatStore): () => void {
	const opening = new Set<string>();
	return subscribe((event) => {
		if (event.type === "turn-started") {
			const record = chatStore.getChat(event.chatId);
			if (record && !record.messages.some((m) => m.role === "assistant")) opening.add(event.chatId);
		} else if (event.type === "turn-settled") {
			if (!opening.delete(event.chatId)) return;
			const record = chatStore.getChat(event.chatId);
			if (!record || !endsOnAnswer(record.messages)) return;
			emit("work-finished", { kind: "lesson", chatId: record.id, title: record.title });
		}
	});
}

interface LhWorkFinishedGlobal {
	__lhLessonOpenings?: () => void;
}

/** Listen for lesson openings, once per process (the events.ts reason). */
export function listenForLessonOpenings(chatStore: ChatStore): void {
	const g = globalThis as typeof globalThis & LhWorkFinishedGlobal;
	g.__lhLessonOpenings ??= onLessonOpenings(chatStore);
}
