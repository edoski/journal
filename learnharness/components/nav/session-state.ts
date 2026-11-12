import type { ChatListItem } from "@/src/core";

/** What a session row says about the session: the tutor is writing, the
 *  tutor waits on the learner (a question or a posed practice problem
 *  alike, since teaching and practice are routed for the learner), or
 *  nothing is pending. Pure. */
export type SessionState = "working" | "your-turn" | "idle";

export function sessionState(chat: ChatListItem): SessionState {
	if (chat.busy || chat.compacting) return "working";
	if (chat.pendingQuestion || chat.pendingProblem) return "your-turn";
	return "idle";
}
