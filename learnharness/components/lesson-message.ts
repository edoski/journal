/**
 * Same-tab handover of a message for a lesson that already exists: the
 * topic page writes it, then opens the lesson, whose page takes it once
 * and sends it through the composer's own send (a steer while the tutor
 * writes). Where the composer cannot send now (a question waits on his
 * answer, the context is being compacted), the message stays in the
 * composer as his draft. Never put the message in the URL.
 */

const keyFor = (id: string) => `lh.lessonMessage.${id}`;

/** Keeps a message for a lesson; false when storage refused it. */
export function stashLessonMessage(id: string, text: string): boolean {
	try {
		const storage = globalThis.sessionStorage;
		storage.setItem(keyFor(id), text);
		return storage.getItem(keyFor(id)) === text;
	} catch {
		return false;
	}
}

/** Takes a lesson's message once: read and removed. */
export function takeLessonMessage(id: string): string | undefined {
	try {
		const storage = globalThis.sessionStorage;
		const text = storage.getItem(keyFor(id));
		storage.removeItem(keyFor(id));
		return text?.trim() ? text : undefined;
	} catch {
		return undefined;
	}
}
