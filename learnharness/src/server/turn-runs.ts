/**
 * The running-turn registry (background-turn runner wave, owner ruling
 * 2026-09-25): chatId → the live PiTurnHandle. THE reattach surface —
 * GET /api/chats/[id]/stream resolves here, and the remote abort
 * (/api/activity/abort, kind "turn") kills through here.
 *
 * Same globalThis discipline as turn-liveness.ts (read its header): Next
 * dev compiles each route as its own module instance, so a module-level
 * Map would be a DIFFERENT registry in the POST /api/chat entry and the
 * GET .../stream entry. globalThis spans module instances within the
 * process.
 *
 * Registration lifecycle: chat-handler registers the handle the moment
 * the turn starts (after the 409 guard) and its onFinish unregisters LAST
 * — after persist, usage, and endTurn — so anything that sees
 * "no running turn" sees durable record truth. Failed settlement also
 * retains its small notice before unregistering, so late attachments do
 * not mistake an unsaved reply for success. The per-chat
 * 409 guard means a chatId can hold at most one handle, and beginTurn's
 * 30-minute TTL bounds the pathological never-settling case the same way
 * it does for the liveness map: if onFinish never fires, the stale entry
 * is overwritten by the next turn's registration (Map.set) and garbage
 * collected — no unbounded leak beyond the same pathology turn-liveness
 * already accepts.
 *
 * App-quit mid-turn (the process dying with an un-persisted turn) is the
 * SAME residual as before the wave: the registry is memory-only, the
 * write-ahead record + liveness TTL recovery cover the next mount.
 */

import type { PiTurnHandle } from "./pi/ui-stream.ts";

interface LhTurnRunsGlobal {
	__lhTurnRuns?: Map<string, PiTurnHandle>;
	__lhTurnFailures?: Map<string, string>;
	__lhTurnStopping?: Set<string>;
	__lhTurnWaking?: Set<string>;
}

function runs(): Map<string, PiTurnHandle> {
	const g = globalThis as typeof globalThis & LhTurnRunsGlobal;
	return (g.__lhTurnRuns ??= new Map<string, PiTurnHandle>());
}

/** One small, transient notice per failed session. Never stores messages.
 * Cleared on the next accepted begin, session deletion, or process exit. */
function failures(): Map<string, string> {
	const g = globalThis as typeof globalThis & LhTurnRunsGlobal;
	return (g.__lhTurnFailures ??= new Map<string, string>());
}

export function rememberTurnFailure(chatId: string, errorText: string): void {
	failures().set(chatId, errorText);
}

export function turnFailure(chatId: string): string | undefined {
	return failures().get(chatId);
}

export function clearTurnFailure(chatId: string): void {
	failures().delete(chatId);
}

/** Chats whose running turn was told to stop before it registered (it
 *  had begun but not yet started): it stops the moment it registers. */
function stopping(): Set<string> {
	const g = globalThis as typeof globalThis & LhTurnRunsGlobal;
	return (g.__lhTurnStopping ??= new Set<string>());
}

/** Chats whose next turn the server is setting up itself (a handoff's
 *  next agent, a job's result: jobs.ts's wake), before it begins. */
function waking(): Set<string> {
	const g = globalThis as typeof globalThis & LhTurnRunsGlobal;
	return (g.__lhTurnWaking ??= new Set<string>());
}

/** The wake pipeline marks the setup of a turn it starts: the lesson
 *  shows it as busy, with Stop (round 14, 3 M2), so his Stop meanwhile
 *  stops that turn as it starts. */
export function markWaking(chatId: string, on: boolean): void {
	if (on) waking().add(chatId);
	else waking().delete(chatId);
}

/** Register the chat's running turn (chat-handler, right after the turn
 *  starts). One per chat by construction — the 409 guard. */
export function registerTurn(chatId: string, handle: PiTurnHandle): void {
	runs().set(chatId, handle);
	if (stopping().delete(chatId)) handle.abort();
}

/** Stops the chat's running turn, registered or still starting. */
export function stopTurn(chatId: string): void {
	const handle = runs().get(chatId);
	if (handle) handle.abort();
	else stopping().add(chatId);
}

/** Forgets a stop no turn took (the turn ended before registering). */
export function forgetStop(chatId: string): void {
	stopping().delete(chatId);
}

/** Unregister at settle — chat-handler's onFinish, LAST (after endTurn). */
export function unregisterTurn(chatId: string): void {
	runs().delete(chatId);
}

/** The live turn handle for a chat, or undefined — the subscribe endpoint's
 *  and the abort channel's resolution point. */
export function runningTurn(chatId: string): PiTurnHandle | undefined {
	return runs().get(chatId);
}

/** The remote kill: any client (original sender, reattached viewer, future
 *  surfaces) may stop a running turn. not_running mirrors abortJob's
 *  honest 409 — there was nothing to abort, the caller refetches. */
export function abortTurn(chatId: string): { ok: true } | { ok: false; reason: "not_running" } {
	const handle = runs().get(chatId);
	if (handle) handle.abort();
	else if (waking().has(chatId)) stopping().add(chatId);
	else return { ok: false, reason: "not_running" };
	return { ok: true };
}

/** The cheap terminal when GET /api/chats/[id]/stream finds no running
 *  turn (raced settle, or the client checked turnInFlight a beat too
 *  late): a same-dialect SSE response whose single chunk tells the client
 *  "nothing to attach to — refetch durable truth". A retained settlement
 *  failure is delivered first, including when no view attached in time.
 *  Chosen as an EVENT (not a status code), consuming ONE wire
 *  protocol end to end. */
export function settledTurnResponse(chatId?: string): Response {
	const errorText = chatId ? turnFailure(chatId) : undefined;
	const notice = errorText === undefined ? "" : `data: ${JSON.stringify({ type: "error", errorText })}\n\n`;
	return new Response(`${notice}data: {"type":"turn-settled"}\n\ndata: [DONE]\n\n`, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			"X-Accel-Buffering": "no",
		},
	});
}
