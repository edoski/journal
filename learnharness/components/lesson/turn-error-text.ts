/** What a failed reply tells the learner (spec: turn-error.md). The
 *  subscription providers already fail in curated sentences; an API-key
 *  provider fails with the provider's raw text (`401 {"type":"error",…}`),
 *  which becomes one plain sentence with the raw text kept as details. */

export type TurnErrorKind = "key" | "busy" | "failed" | "written";

export interface TurnErrorText {
	kind: TurnErrorKind;
	sentence: string;
	/** The raw text, shown on demand; null when the sentence is the whole message. */
	details: string | null;
}

const STATUS = /^(\d{3})\b/;
const KEY_REJECTED = /invalid[ _-]?(x-)?api[ _-]?key|incorrect api key|api key not valid|authentication_error/i;
const BUSY = /rate[ _-]?limit|overloaded|too many requests/i;
const KEY_STATUSES = new Set([401, 403]);
const BUSY_STATUSES = new Set([429, 529]);

/** Prose meant for people: no status code in front, no JSON, ends a sentence. */
function isWritten(text: string): boolean {
	return !STATUS.test(text) && !text.includes("{") && /[.!?]$/.test(text);
}

export function turnErrorText(message: string): TurnErrorText {
	const raw = message.trim();
	const status = Number(STATUS.exec(raw)?.[1] ?? 0);
	if (KEY_STATUSES.has(status) || KEY_REJECTED.test(raw)) {
		return { kind: "key", sentence: "The provider rejected your API key.", details: raw };
	}
	if (BUSY_STATUSES.has(status) || BUSY.test(raw)) {
		return { kind: "busy", sentence: "The provider is busy. Wait a moment, then retry.", details: raw };
	}
	if (isWritten(raw)) return { kind: "written", sentence: raw, details: null };
	return { kind: "failed", sentence: "The reply failed.", details: raw === "" ? null : raw };
}
