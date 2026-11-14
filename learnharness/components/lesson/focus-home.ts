/**
 * Where his next key belongs in a lesson (round 2, 14 Nov 2026). Tab is
 * dead (owner, 17 Sep 2026), so after anything that takes focus away (the
 * lesson opening, a dock swapping, a turn ending, a rename, a dialog
 * closing) focus lands where he types next:
 *
 * - an open practice problem: its "Your thinking" field;
 * - an open question with a typed answer: its answer field;
 * - an open question with choices: nowhere, because the page's arrows walk
 *   its rows and Enter sends;
 * - a question or problem folded to its bar: nowhere, because Enter opens it;
 * - otherwise the composer, except while the tutor replies to what he just
 *   sent from a question or problem (round 4, 14 Nov 2026): keys typed on
 *   after Enter landed in the message box and waited there unseen behind
 *   the next question, to surface later as a stray draft. The reply ending
 *   puts focus home.
 *
 * It moves focus only when nothing has it: a field or menu he is in keeps it.
 */

const FIELD = {
	practice: '[data-testid="practice-thinking-field"]',
	answer: '[data-testid="question-dock"] [data-testid="answer-field"]',
	choices: '[data-testid="question-dock"]',
	folded: '[data-testid="question-dock-bar"], [data-testid="teach-check-reveal"], [data-testid="practice-dock-bar"]',
	composer: '[data-testid="composer"] textarea',
} as const;

/** The field his next key belongs to, or null where the page's own keys act. */
export function focusHomeIn(root: ParentNode, replyingToDock = false): HTMLElement | null {
	const practice = root.querySelector<HTMLElement>(FIELD.practice);
	if (practice) return practice;
	if (root.querySelector(FIELD.choices)) return root.querySelector<HTMLElement>(FIELD.answer);
	if (root.querySelector(FIELD.folded)) return null;
	return replyingToDock ? null : root.querySelector<HTMLElement>(FIELD.composer);
}

/** Whether focus is nowhere a key would do anything: the page itself, or an
 *  element that has left it. */
export function focusIsLost(doc: Document): boolean {
	const active = doc.activeElement;
	return active == null || active === doc.body || !active.isConnected;
}

/** Puts focus home if nothing holds it. */
export function landFocus(doc: Document, root: ParentNode, replyingToDock = false): void {
	if (!focusIsLost(doc)) return;
	focusHomeIn(root, replyingToDock)?.focus({ preventScroll: true });
}

/** Arrows and page keys in an EMPTY lesson field read the lesson instead:
 *  the caret has nowhere to go, and the lesson is what he is reading. The
 *  distance to scroll, or null when the field keeps the key. */
export function readingKeyScroll(key: string, fieldEmpty: boolean, viewHeight: number): number | null {
	if (!fieldEmpty) return null;
	switch (key) {
		case "ArrowDown":
			return 40;
		case "ArrowUp":
			return -40;
		case "PageDown":
			return viewHeight * 0.9;
		case "PageUp":
			return -viewHeight * 0.9;
		default:
			return null;
	}
}
