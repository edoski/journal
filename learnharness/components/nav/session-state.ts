import type { ChatListItem } from "@/src/core";

/**
 * Where a session stands, the one model Home, the topic page, the calendar
 * and the sidebar read (spec: session-state.md). Pure.
 *   - working: the tutor is writing (a turn or a compaction runs);
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
	if (chat.busy || chat.compacting) return "working";
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

/** The session to pick up among some: one that waits on the learner, else
 *  one the tutor writes in, else one the tutor stopped in, else one left
 *  for next time; the first in the order given (newest first) within
 *  each. */
export function resumableSession(sessions: readonly ChatListItem[]): ChatListItem | null {
	for (const state of PICK_UP_ORDER) {
		const found = sessions.find((chat) => sessionState(chat) === state);
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
