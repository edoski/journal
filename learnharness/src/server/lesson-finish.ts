/**
 * What a lesson finishing starts. One subscriber on the event bus:
 *
 * - a turn settles and leaves its lesson closed: the lesson digest runs,
 *   and the graph extraction takes the lesson's tail whatever its size;
 * - a new lesson's first turn starts: the course's previous lesson, if it
 *   was left partway, is digested;
 * - the app starts: a digest a quit cut short runs again.
 *
 * Nothing here runs on a clock.
 */

import type { ChatStore } from "../core/ports.ts";
import { subscribe } from "../core/events.ts";
import { digestWindow, lessonFinished, lessonLeftMidway } from "../core/lesson-digest.ts";
import type { LessonDigest } from "../agent/subagents/lesson-digest.ts";

export interface LessonFinishDeps {
	chatStore: ChatStore;
	digest: LessonDigest;
	/** Extract the chat's uncovered teaching into the graph, whatever its
	 *  size (the graph's own switches decide whether it runs). */
	extractTail: (chatId: string) => void;
}

function startDigest(deps: LessonFinishDeps, chatId: string): void {
	void deps.digest.digestLesson(chatId).catch(() => {});
}

/** The course's most recent other lesson, when it stopped partway and has
 *  something left to digest. */
function previousLessonLeftMidway(deps: LessonFinishDeps, chatId: string, workspace: string): string | null {
	const previous = deps.chatStore.listChats().find((c) => c.id !== chatId && c.course?.workspace === workspace);
	if (!previous || previous.ended !== "mid-lesson") return null;
	const record = deps.chatStore.getChat(previous.id);
	return record && lessonLeftMidway(record) && digestWindow(record.messages, record.digest) ? record.id : null;
}

/** Subscribe to the events that finish a lesson. Returns the unsubscribe. */
export function onLessonEvents(deps: LessonFinishDeps): () => void {
	return subscribe((event) => {
		if (event.type === "turn-settled") {
			const record = deps.chatStore.getChat(event.chatId);
			if (!record || !lessonFinished(record)) return;
			startDigest(deps, record.id);
			deps.extractTail(record.id);
		} else if (event.type === "turn-started") {
			const record = deps.chatStore.getChat(event.chatId);
			if (!record?.course || record.messages.some((m) => m.role === "assistant")) return;
			const previous = previousLessonLeftMidway(deps, record.id, record.course.workspace);
			if (previous) startDigest(deps, previous);
		}
	});
}

/** At app start: run again every digest a quit cut short. */
export function resumeCutDigests(deps: Pick<LessonFinishDeps, "chatStore" | "digest">): void {
	for (const summary of deps.chatStore.listChats()) {
		if (deps.chatStore.getChat(summary.id)?.digest?.pending) startDigest({ ...deps, extractTail: () => {} }, summary.id);
	}
}
