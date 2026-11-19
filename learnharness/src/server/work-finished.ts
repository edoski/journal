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
import { emit, subscribe } from "../core/events.ts";

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
			if (record?.messages.at(-1)?.role !== "assistant") return;
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
