/** What a failed reply tells the learner (spec: turn-error.md). The
 *  subscription providers already fail in curated sentences; an API-key
 *  provider fails with the provider's raw text (`401 {"type":"error",…}`),
 *  which becomes one plain sentence with the raw text kept as details. The
 *  app's own failures reach the browser as its fetch error or as the
 *  route's JSON body (`{"error":"Unknown chat"}`), and read as what
 *  happened. */

export type TurnErrorKind = "signed-out" | "key" | "busy" | "offline" | "gone" | "failed" | "written";

export interface TurnErrorText {
	kind: TurnErrorKind;
	sentence: string;
	/** What to do next names a button: Sign in, then Retry when the line
	 *  offers it (round 7: a token failure said "press Refresh" beside a
	 *  lone Retry). */
	then?: "sign-in-retry";
	/** The raw text, shown on demand; null when the sentence is the whole message. */
	details: string | null;
}

const STATUS = /^(\d{3})\b/;
const KEY_REJECTED = /invalid[ _-]?(x-)?api[ _-]?key|incorrect api key|api key not valid|authentication_error/i;
const BUSY = /rate[ _-]?limit|overloaded|too many requests/i;
const KEY_STATUSES = new Set([401, 403]);
const BUSY_STATUSES = new Set([429, 529]);
/** Chrome's words for a request that never reached the app: the line a
 *  Try again that could not reach it shows. */
export const UNREACHABLE_APP = "Failed to fetch";

/** The browser's own words when the request never reached the app: Chrome, Safari, Firefox. */
const UNREACHABLE = /^(failed to fetch|load failed|networkerror when attempting to fetch resource\.?)$/i;
import { CLAUDE_SIGNED_OUT_STARTS, isProviderKeyRefusal, PROVIDER_KEY_MISSING_CODE } from "@/src/core";

/** The chat routes' answer for a session that no longer exists. */
const UNKNOWN_CHAT = "Unknown chat";

/** Prose meant for people: no status code in front, no JSON, ends a sentence. */
function isWritten(text: string): boolean {
	return !STATUS.test(text) && !text.includes("{") && /[.!?]$/.test(text);
}

/** The app's route body, `{"error":"…"}`, as its text; null for anything else. */
function routeError(text: string): string | null {
	if (!text.startsWith("{")) return null;
	try {
		const body: unknown = JSON.parse(text);
		const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
		return typeof error === "string" ? error : null;
	} catch {
		return null;
	}
}

/** The signed-out refusal: the server's 503 body, thrown verbatim by the
 *  send, matched by the envelope's own wording so it never drifts. */
export function parseProviderKeyRefusal(message: string | undefined): boolean {
	if (!message) return false;
	try {
		const body = JSON.parse(message) as { code?: unknown; error?: unknown };
		return body.code === PROVIDER_KEY_MISSING_CODE && typeof body.error === "string" && isProviderKeyRefusal(body.error);
	} catch {
		return false;
	}
}

/** A send refused because the lesson's course was deleted: the chat
 *  route's 410 body (`code: "course_deleted"`). */
export function isCourseDeletedRefusal(message: string | undefined): boolean {
	if (!message?.startsWith("{")) return false;
	try {
		return (JSON.parse(message) as { code?: unknown }).code === "course_deleted";
	} catch {
		return false;
	}
}

export function turnErrorText(message: string): TurnErrorText {
	const raw = message.trim();
	if (UNREACHABLE.test(raw)) {
		return { kind: "offline", sentence: "Couldn't reach the app. Check it's running, then try again.", details: null };
	}
	if (parseProviderKeyRefusal(raw)) {
		return { kind: "signed-out", sentence: "Claude isn't signed in, so the tutor couldn't reply. What you wrote is still in the box.", details: null };
	}
	if (CLAUDE_SIGNED_OUT_STARTS.some((start) => raw.startsWith(start))) {
		return { kind: "signed-out", sentence: "Claude isn't signed in, so the tutor couldn't reply.", then: "sign-in-retry", details: null };
	}
	const route = routeError(raw);
	if (route === UNKNOWN_CHAT) return { kind: "gone", sentence: "This lesson was deleted.", details: null };
	const status = Number(STATUS.exec(raw)?.[1] ?? 0);
	if (KEY_STATUSES.has(status) || KEY_REJECTED.test(raw)) {
		return { kind: "key", sentence: "The provider rejected your API key.", details: raw };
	}
	if (BUSY_STATUSES.has(status) || BUSY.test(raw)) {
		return { kind: "busy", sentence: "The provider is busy. Wait a moment, then retry.", details: raw };
	}
	const text = route ?? raw;
	if (isWritten(text)) return { kind: "written", sentence: text, details: null };
	return { kind: "failed", sentence: "The reply failed.", details: text === "" ? null : text };
}

/** Whether the line for a send refused because Claude was signed out has
 *  outlived its cause (round 8: it stayed red after he signed in and
 *  pressed Refresh). It waits for the account to read signed out at least
 *  once while the line shows (`seenSignedOut`, a status read just before
 *  the refusal can still say connected), then clears the moment it reads
 *  connected. Pure. */
export function refusalWatch(seenSignedOut: boolean, refusal: boolean, connected: boolean | undefined): { seenSignedOut: boolean; clear: boolean } {
	if (!refusal) return { seenSignedOut: false, clear: false };
	if (connected === false) return { seenSignedOut: true, clear: false };
	if (connected === true && seenSignedOut) return { seenSignedOut: false, clear: true };
	return { seenSignedOut, clear: false };
}
