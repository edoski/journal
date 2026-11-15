/**
 * The words of a message on its way, held for chat.tsx's refusal flow: a
 * send the server refuses at once (Claude not signed in) puts them back in
 * the box. Once the server accepts the send they belong to the transcript
 * and are no longer held (round 6: a message accepted turns earlier came
 * back into the box when a later answer was refused, and one Enter would
 * have sent it twice). Pure.
 */
export function sendHoldingDraft(
	held: { current: string | null },
	text: string,
	go: (onAccepted: () => void) => Promise<boolean>,
): Promise<boolean> {
	held.current = text;
	return go(() => {
		if (held.current === text) held.current = null;
	});
}

/**
 * A message from the box on its way: its words are held for the refusal
 * flows (sendHoldingDraft), and a send that fails gives them back as he
 * typed them, trailing space too. Round 10 (4 major 1): a message sent
 * while the app was down, after a reply the connection cut, emptied the
 * box and was lost. Words another flow took meanwhile (a deleted course
 * moves them to the New lesson box) stay there, and words he typed since
 * stay in the box. Pure.
 */
export async function sendKeepingWords(
	held: { current: string | null },
	typed: string,
	go: (text: string, onAccepted: () => void) => Promise<boolean>,
	box: () => string,
): Promise<{ accepted: boolean; back: string | null }> {
	const text = typed.trim();
	const accepted = await sendHoldingDraft(held, typed, (onAccepted) => go(text, onAccepted));
	if (accepted || held.current !== typed) return { accepted, back: null };
	held.current = null;
	return { accepted, back: text && !box().trim() ? typed : null };
}
