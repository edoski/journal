import type { PreparedProcess } from "../agent/sdk/agent.ts";

/**
 * The next answer's Claude Code process, started while he thinks (Edo, 18
 * Nov 2026: "as long as it is not weird in any way and it behaves
 * deterministically reliably"). A lesson page that waits on his answer asks
 * for it; the turn his answer starts takes it when it was started with every
 * option that turn starts one with (`processKey`), and starts its own
 * otherwise, as before. Each process is used once.
 *
 * At most one waits, for the page that asked last: a page that asks for
 * another lesson, his leaving the page, a turn of that lesson, sign-out and
 * a change of account each end it. On `globalThis`, so every route's copy of
 * this module shares it (turn-runs.ts).
 */
interface LhPrestartGlobal {
	__lhPrestart?: { chatId: string; process: PreparedProcess };
}
const g = globalThis as typeof globalThis & LhPrestartGlobal;

function end(process: PreparedProcess): void {
	process.controller.abort();
	void process.warm.then((warm) => warm.close(), () => undefined);
}

/** Starts the lesson's next process, ending the one that waited; one
 *  started with the same options for it already is kept. */
export function prestart(chatId: string, prepared: { key: string; start: () => PreparedProcess } | undefined): void {
	const waiting = g.__lhPrestart;
	if (waiting?.chatId === chatId && waiting.process.key === prepared?.key) return;
	if (waiting) end(waiting.process);
	g.__lhPrestart = prepared ? { chatId, process: prepared.start() } : undefined;
}

/** The process started for the lesson's turn, taken once: its own when it
 *  was started with `key`'s options; one started otherwise ends. */
export function claimPrestart(chatId: string, key: string): PreparedProcess | undefined {
	const waiting = g.__lhPrestart;
	if (waiting?.chatId !== chatId) return undefined;
	g.__lhPrestart = undefined;
	if (waiting.process.key === key) return waiting.process;
	end(waiting.process);
	return undefined;
}

/** Ends the process that waits, for this lesson only when one is named. */
export function releasePrestart(chatId?: string): void {
	const waiting = g.__lhPrestart;
	if (!waiting || (chatId !== undefined && waiting.chatId !== chatId)) return;
	g.__lhPrestart = undefined;
	end(waiting.process);
}
