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

import { keepWords, keptWords } from "@/components/lesson/kept-drafts";

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
	const words = draft.text.trim();
	if (words === "") return null;
	return leftOpen ? { to: "carry", words, why: leftOpen } : { to: "box", words };
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
	return !!rescued && box.trim().endsWith(rescued);
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
	return `${box.trim()}\n\n${words}`;
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
