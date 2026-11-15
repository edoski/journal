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
