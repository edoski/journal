/**
 * Words he typed into a question or problem that another window answered
 * first (round 2, 14 Nov 2026). The dock that held them unmounts when the
 * question leaves, so the lesson keeps the latest typed words per dock and,
 * when the dock's question leaves without this window having sent them,
 * hands them to the composer with a line saying so.
 *
 * The rescued words still belong to the answered question (round 6): they
 * wait in the message box only while nothing is open. When the next
 * question or problem opens they leave the box, unless he has typed on
 * from them, and a question replaced by the next one takes its draft with
 * it. Otherwise Esc carried them into the next question's answer, where
 * Enter would have sent them.
 */

import { keepWords, keptWords } from "@/components/lesson/kept-drafts";

/** What he has typed in the open dock, keyed by the question or problem. */
export interface LiveDraft {
	key: string;
	text: string;
}

/** The words to rescue when the dock moves from `before` to `after`, or
 *  null when nothing was stranded: the dock did not change, another
 *  question replaced it, this window sent its words (the draft was cleared
 *  at the send), or nothing was typed. Pure. */
export function strandedDraft(before: string | null, after: string | null, draft: LiveDraft | null): string | null {
	if (before === null || after !== null || draft === null || draft.key !== before) return null;
	const text = draft.text.trim();
	return text === "" ? null : text;
}

const rescueScope = (chatId: string) => `${chatId}:rescued`;

/** Notes the words just rescued into the lesson's message box, kept with
 *  the box so a reload remembers which words they were. */
export function keepRescue(chatId: string, words: string): void {
	keepWords(rescueScope(chatId), { text: words });
}

/** The message box once a question or problem opens: without the rescued
 *  words when they still end it as rescued, or null when nothing changes.
 *  The rescue is forgotten either way. */
export function dropRescue(chatId: string, box: string): string | null {
	const rescued = keptWords(rescueScope(chatId))?.text;
	keepWords(rescueScope(chatId), null);
	const text = box.trimEnd();
	if (!rescued || !text.endsWith(rescued)) return null;
	return text.slice(0, -rescued.length).trim();
}
