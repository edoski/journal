import type { EarlyRun } from "../agent/sdk/agent.ts";

/**
 * Plan while the assessment is written (Edo, 18 Nov 2026: "Yes as long as
 * this is reliable"; round 15's P5-speed, lever 1). The moment the probe
 * starts writing its assessment, the teacher starts planning on a fork of
 * the probe's session, from his answers; the handoff's turn takes that run
 * when it has every option of the turn but its session, and reads it from
 * its start, so he sees what the handoff would have shown, only sooner. The
 * card stays the probe's. Anything else, a run that failed before it was
 * taken, a probe that did not conclude, Done for today, ends it, and the
 * handoff plans as before.
 *
 * One per lesson, on `globalThis`, so every route's copy of this module
 * shares them (turn-runs.ts).
 */
interface LhEarlyPlanGlobal {
	__lhEarlyPlan?: Map<string, EarlyRun>;
}
const g = globalThis as typeof globalThis & LhEarlyPlanGlobal;
const runs = (g.__lhEarlyPlan ??= new Map());

function end(run: EarlyRun): void {
	run.controller.abort();
	run.query.close();
}

/** Keeps the lesson's early plan, ending one it had. */
export function startEarlyPlan(chatId: string, run: EarlyRun | undefined): void {
	endEarlyPlan(chatId);
	if (run) runs.set(chatId, run);
}

/** The lesson's early plan, taken once by the handoff's turn: when it was
 *  started with `key`'s options; one started otherwise ends. */
export function claimEarlyPlan(chatId: string, key: string): EarlyRun | undefined {
	const run = runs.get(chatId);
	runs.delete(chatId);
	if (!run) return undefined;
	if (run.key === key) return run;
	end(run);
	return undefined;
}

/** Ends the lesson's early plan, if it has one. */
export function endEarlyPlan(chatId: string): void {
	const run = runs.get(chatId);
	if (!run) return;
	runs.delete(chatId);
	end(run);
}

/** Whether the lesson has an early plan waiting for its handoff. */
export function hasEarlyPlan(chatId: string): boolean {
	return runs.has(chatId);
}
