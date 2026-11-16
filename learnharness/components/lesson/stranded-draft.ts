/**
 * Words he typed into a question or problem that another window moved on
 * from (round 2, 14 Nov 2026). The dock that held them unmounts when the
 * question leaves, so the lesson keeps the latest typed words per dock and,
 * when the dock's question leaves without this window having sent them,
 * keeps them and says where (round 7, 15 Nov 2026: a hint or an answer in
 * one window silently wiped the other window's draft):
 *
 * - the question is still open (the other window asked for a hint on it,
 *   or asked the tutor something first): the words wait in this window's
 *   carry for that question asked again, in whatever words;
 * - the question was answered or skipped: the words go to the message box
 *   and stay there while the next questions come, with one line saying so.
 *   They never fill another question's answer.
 */

import { joinAsTyped, keepWords, keptWords } from "@/components/lesson/kept-drafts";
import { LESSON_WORDS } from "@/components/study-words";

/** What he has typed in the open dock, keyed by the question or problem. */
export interface LiveDraft {
	key: string;
	text: string;
}

/** Why a question left the dock without an answer, so it is still open. */
export type LeftOpen = "hint" | "asked";

/** Where overtaken words go: back to the same question when it is asked
 *  again, or to the message box. */
export type Overtaken = { to: "carry"; words: string; why: LeftOpen } | { to: "box"; words: string };

/** The words overtaken when the dock moves from `before` to `after`, or
 *  null when nothing was: the dock did not change, this window sent its
 *  words (the draft was cleared at the send), or nothing was typed.
 *  `leftOpen` says why `before`'s question left, when it is still open. Pure. */
export function overtakenDraft(before: string | null, after: string | null, draft: LiveDraft | null, leftOpen: LeftOpen | null): Overtaken | null {
	if (before === null || before === after || draft === null || draft.key !== before) return null;
	// As he typed them, trailing space too (round 10, 4 minor 5).
	const words = draft.text;
	if (words.trim() === "") return null;
	return leftOpen ? { to: "carry", words, why: leftOpen } : { to: "box", words };
}

/** Words he typed in the dock after this window sent from it, when the
 *  dock moves on, or null: they go to the message box as typed (round 11,
 *  4 major 1: words typed in a problem's box while the tutor replied to
 *  his work were erased when the problem closed). Pure. */
export function typedAfterSend(before: string | null, after: string | null, draft: LiveDraft | null): string | null {
	if (before === null || before === after || draft === null || draft.key !== before) return null;
	return draft.text.trim() === "" ? null : draft.text;
}

/** The line under the transcript about where his words are: another
 *  window's doing (`overtaken`), given whether a question or problem now
 *  holds the box; else, while one holds it, words of his waiting in the
 *  message box behind it (`hidden`, round 11, 4 minor 2). Pure. */
export function boxLine(overtaken: "answered" | LeftOpen | null, open: boolean, hidden: boolean): string | null {
	if (overtaken === "answered") return open ? LESSON_WORDS.answeredElsewhereOpen : LESSON_WORDS.answeredElsewhere;
	if (overtaken === "hint" && !open) return LESSON_WORDS.hintElsewhere;
	if (overtaken === "asked" && !open) return LESSON_WORDS.askedElsewhere;
	return open && hidden ? LESSON_WORDS.messageKept : null;
}

const rescueScope = (chatId: string) => `${chatId}:rescued`;

/** Notes the words just rescued into the lesson's message box, and the
 *  dock they were rescued from, kept with the box so a reload remembers
 *  which words they were. */
export function keepRescue(chatId: string, words: string, from: string | null = null): void {
	keepWords(rescueScope(chatId), { text: words, ...(from ? { from } : {}) });
}

/** Forgets the rescue: he sent, emptied or rewrote the box. */
export function forgetRescue(chatId: string): void {
	keepWords(rescueScope(chatId), null);
}

/** Whether the message box still holds the rescued words as they came:
 *  then they are another question's answer, never this one's. */
export function holdsRescue(chatId: string, box: string): boolean {
	const rescued = keptWords(rescueScope(chatId))?.text;
	return !!rescued && box.trimEnd().endsWith(rescued.trimEnd());
}

/** Whether the box holds the rescued words and nothing else of his. */
function onlyRescue(chatId: string, box: string): boolean {
	const rescued = keptWords(rescueScope(chatId))?.text;
	return !!rescued && box.trim() === rescued.trim();
}

/** The message box with newly rescued words: they replace an older rescue
 *  he left untouched, and follow words of his own (round 8: two rescues
 *  merged into one block). Pure but for reading the kept rescue. */
export function rescuedBox(chatId: string, box: string, words: string): string {
	if (!box.trim() || onlyRescue(chatId, box)) return words;
	return joinAsTyped([box, words]);
}

/** A rescue dies with its own question (round 8: it stayed in the box
 *  through later questions and came back during a hint with a live Send):
 *  once a question after the one it was rescued from closes, an untouched
 *  rescue leaves the box. The box's new words (empty), or null when it
 *  stays as it is. Forgets the rescue when it leaves. */
export function boxAfterClose(chatId: string, box: string, closing: string | null): string | null {
	const rescue = keptWords(rescueScope(chatId));
	if (!rescue?.text || closing === null || closing === rescue.from) return null;
	if (!onlyRescue(chatId, box)) {
		if (!holdsRescue(chatId, box)) forgetRescue(chatId);
		return null;
	}
	forgetRescue(chatId);
	return "";
}
