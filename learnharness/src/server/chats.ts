import { abortRuns, backgroundRuns, runsEnded } from "../agent/subagents/background-runs.ts";
import { isJobLive } from "../agent/subagents/aborts.ts";
import { titleFromPrompt } from "../core/contracts.ts";
import { stores } from "./stores.ts";
import { isTurnRunning } from "./turn-liveness.ts";
import { clearTurnFailure } from "./turn-runs.ts";
import { discardChatDeliveries } from "./jobs.ts";

/**
 * Server-side chat entries for the transport layer (app/api/chats*,
 * app/chat/[id]). Today these delegate straight to the ChatStore port; the
 * services stage carves the real orchestration behind this same surface.
 *
 * deleteChatSession (wave 6, session deletion) is the one real
 * orchestration here: gates → digest wind-down → one synchronous deletion
 * block.
 */

export const { createChat, getChat, listChats } = stores.chatStore;
export { titleFromPrompt };

/** How long the wind-down wait may take before the caller gets a retryable
 *  503 (an aborted digest ends at its next model-call boundary —
 *  provider cancellation is normally sub-second, but a wedged provider
 *  must never wedge deletion). */
const WIND_DOWN_TIMEOUT_MS = 10_000;

/** What deleteChatSession did — the route maps it straight to HTTP. */
export type ChatDeleteOutcome =
	| { ok: false; status: 404; code: "not_found"; error: string }
	| { ok: false; status: 409; code: "turn_in_flight" | "jobs_running"; error: string; jobIds: string[] }
	| { ok: false; status: 503; code: "digest_winding_down"; error: string }
	| { ok: true; jobsRemoved: number };

/**
 * Delete a session (owner rulings 2026-09-22/23): gates first, then the
 * removal. The owner-locked choreography:
 *
 *   1. GATES — a turn in flight or a running background job refuses with
 *      409 (they write the chat record and steer into it; deleting
 *      mid-flight would corrupt the write-ahead flow). The UI retries once
 *      work drains.
 *   2. DIGEST WIND-DOWN — the chat's own lesson digest is TRUE-
 *      CANCELLED (abortRuns: spend stops, nothing saves), then awaited off
 *      the registry. A timeout is a retryable 503, never a forced race.
 *   3. THE SYNC BLOCK — no await between the late gate and the removal:
 *      jobs first, the chat record LAST. A digest that slipped past the
 *      wind-down finds the chat gone after its model call and saves
 *      nothing.
 */
function runningWorkBlocker(chatId: string): Extract<ChatDeleteOutcome, { status: 409 }> | null {
	if (isTurnRunning(chatId)) {
		return {
			ok: false,
			status: 409,
			code: "turn_in_flight",
			error: "A turn is running in this session — try again when it finishes",
			jobIds: [],
		};
	}
	// Legacy records kept completed workers running until delivery. A saved
	// result without a live loop is pending session data, not computing work;
	// deletion must not depend on a prior recovery poll to recognize it.
	const runningJobs = stores.jobStore.listJobs(chatId).filter((job) =>
		job.status === "running" && (!job.result || isJobLive(job.id)));
	if (runningJobs.length > 0) {
		return {
			ok: false,
			status: 409,
			code: "jobs_running",
			error: "Background jobs are still running in this session — try again when they finish",
			jobIds: runningJobs.map((job) => job.id),
		};
	}
	return null;
}

export async function deleteChatSession(chatId: string): Promise<ChatDeleteOutcome> {
	if (!stores.chatStore.getChat(chatId)) {
		return { ok: false, status: 404, code: "not_found", error: "No such session" };
	}
	const blocker = runningWorkBlocker(chatId);
	if (blocker) return blocker;
	if (backgroundRuns().some((run) => run.chatId === chatId)) {
		abortRuns(chatId); // true cancellation — spend stops, nothing saves
		if (!(await runsEnded(chatId, WIND_DOWN_TIMEOUT_MS))) {
			return {
				ok: false,
				status: 503,
				code: "digest_winding_down",
				error: "The session's digest is still winding down — try again in a moment",
			};
		}
	}

	// A result wake or a worker may have started during the wind-down.
	// Recheck immediately before the synchronous purge, with no await gap.
	const lateBlocker = runningWorkBlocker(chatId);
	if (lateBlocker) return lateBlocker;

	// THE SYNC BLOCK — no awaits below (see the doc comment). Order:
	// jobs → the chat record.
	const jobsRemoved = stores.jobStore.deleteJobsForChat(chatId);
	if (stores.chatStore.deleteChat(chatId)) {
		discardChatDeliveries(chatId);
		clearTurnFailure(chatId);
	}
	return { ok: true, jobsRemoved };
}
