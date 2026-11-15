import type { ChatListItem } from "@/src/core";

/**
 * Where a session stands, the one model Home, the topic page, the calendar
 * and the sidebar read (spec: session-state.md). Pure.
 *   - working: the tutor is writing (a turn runs; a compaction is not
 *     writing: he can answer during one, and a closed lesson stays closed);
 *   - your-turn: the tutor waits on the learner: a question or a practice
 *     problem it posed, a plan it wrote but taught no step of, or its last
 *     words asking him something partway through a lesson;
 *   - paused: the tutor's turn stopped before it finished, so the tutor
 *     owes the next word and picks the turn back up when it is opened;
 *   - left: he pressed Done for today on work still open (a question or
 *     problem it set aside, plan steps still to teach, a review not yet
 *     done), so it waits for next time;
 *   - finished: the tutor ended the lesson (a sign-off such as "Good place
 *     to stop" included), the practice round or the answer.
 */
export type SessionState = "working" | "your-turn" | "paused" | "left" | "finished";

export function sessionState(chat: ChatListItem): SessionState {
	if (chat.busy) return "working";
	if (chat.pendingQuestion || chat.pendingProblem || chat.ended === "mid-lesson") return "your-turn";
	if (chat.ended === "left") return "left";
	return chat.ended === "cut" ? "paused" : "finished";
}

/** Edo's open choice for Continue on a finished lesson: reopen it, or
 *  start a fresh session that picks it up at its step without probing or
 *  planning again ("fresh"). */
export const FINISHED_LESSON: "reopen" | "fresh" = "reopen";

/** What Continue does: open a session where it stopped, sending nothing,
 *  or start a fresh session from a finished lesson. */
export type ContinueMove = { kind: "open"; chat: ChatListItem } | { kind: "fresh"; from: ChatListItem };

/** Each state's one Continue: every state but finished opens the session,
 *  one left for next time included;
 *  a finished lesson does what FINISHED_LESSON says. */
const CONTINUE: Record<SessionState, (chat: ChatListItem, finished: typeof FINISHED_LESSON) => ContinueMove> = {
	working: (chat) => ({ kind: "open", chat }),
	"your-turn": (chat) => ({ kind: "open", chat }),
	paused: (chat) => ({ kind: "open", chat }),
	left: (chat) => ({ kind: "open", chat }),
	finished: (chat, finished) => (finished === "reopen" ? { kind: "open", chat } : { kind: "fresh", from: chat }),
};

const PICK_UP_ORDER: readonly SessionState[] = ["your-turn", "working", "paused", "left"];

/** The sessions still current among some: each but one a later session of
 *  its kind started after he last touched it, which moved past it (round
 *  9, 2 m7: a preview whose turn failed on 6 Nov stayed Diagonalization's
 *  Now over the lesson he left on 8 Nov). A turn running now stays. Pure. */
export function currentSessions(sessions: readonly ChatListItem[]): ChatListItem[] {
	const started = (kind: ChatListItem["kind"]) => sessions.reduce((last, chat) => (chat.kind === kind && chat.createdAt > last ? chat.createdAt : last), "");
	return sessions.filter((chat) => chat.busy || chat.updatedAt >= started(chat.kind));
}

/** The session to pick up among some: of the current ones
 *  (`currentSessions`), one that waits on the learner, else one the tutor
 *  writes in, else one the tutor stopped in, else one left for next time;
 *  the first in the order given (newest first) within each. */
export function resumableSession(sessions: readonly ChatListItem[]): ChatListItem | null {
	const current = currentSessions(sessions);
	for (const state of PICK_UP_ORDER) {
		const found = current.find((chat) => sessionState(chat) === state);
		if (found) return found;
	}
	return null;
}

/** What Continue does on some sessions (newest first): pick up the
 *  resumable one, else the newest finished lesson's move; null when
 *  nothing is picked up and a new session starts. A finished practice
 *  round is not picked up. */
export function continueMove(sessions: readonly ChatListItem[], finished: typeof FINISHED_LESSON = FINISHED_LESSON): ContinueMove | null {
	const chat = resumableSession(sessions) ?? sessions.find((c) => c.kind !== "practice" && sessionState(c) === "finished");
	return chat ? CONTINUE[sessionState(chat)](chat, finished) : null;
}

/** What a paused session says (round 8): his own stop in his words, a
 *  turn a restart cut as cut off. */
export function pausedWords(chat: Pick<ChatListItem, "stopped">): string {
	return chat.stopped ? "You stopped the tutor" : "Reply cut off";
}
