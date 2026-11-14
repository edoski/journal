/**
 * Words he typed into a question or problem that another window answered
 * first (round 2, 14 Nov 2026). The dock that held them unmounts when the
 * question leaves, so the lesson keeps the latest typed words per dock and,
 * when the dock's question leaves without this window having sent them,
 * hands them to the composer with a line saying so. Pure.
 */

/** What he has typed in the open dock, keyed by the question or problem. */
export interface LiveDraft {
	key: string;
	text: string;
}

/** The words to rescue when the dock moves from `before` to `after`, or
 *  null when nothing was stranded: the dock did not change, this window
 *  sent its words (the draft was cleared at the send), or nothing was typed. */
export function strandedDraft(before: string | null, after: string | null, draft: LiveDraft | null): string | null {
	if (before === null || before === after || draft === null || draft.key !== before) return null;
	const text = draft.text.trim();
	return text === "" ? null : text;
}

/** The words of a question's form, the answer first, as one draft. */
export function formDraftText(parts: readonly (string | undefined)[]): string {
	return parts.map((part) => part?.trim() ?? "").filter((part) => part !== "").join("\n\n");
}
