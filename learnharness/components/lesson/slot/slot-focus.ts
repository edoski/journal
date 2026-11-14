/** Where his next key belongs while B's answer line is open (spec:
 *  answer-slot.md): a typed answer's or a problem's field, else the line of
 *  choices itself, where digits, arrows and Enter act. Null when no line is
 *  open, so the composer is home. */
export function slotFocusHome(root: ParentNode = document): HTMLElement | null {
	const line = root.querySelector<HTMLElement>('[data-slot="answer-slot"]');
	if (!line) return null;
	const choices = line.getAttribute("data-mode") === "single-select" || line.getAttribute("data-mode") === "multi-select";
	return choices ? line : line.querySelector<HTMLElement>('[data-slot="slot-field"]');
}

/** B's words beyond the shared ones. */
export const SLOT_WORDS = {
	/** The composer's placeholder while a question or problem is open. */
	askAbout: "Ask about this…",
} as const;
