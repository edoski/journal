/**
 * The running half of the plan draft (core/plan-draft.ts): one draft per
 * lesson, a forked query of the lesson's own Claude Code session (the
 * teacher in draft mode, teacher-agent.ts), started when the probe's last
 * question is posed and taken by the teacher's turn when it opens.
 *
 * - Taken: the draft's map rides the handoff the teacher reads. A draft not
 *   ready by then is stopped, and the teacher plans as before.
 * - Cancelled: his Stop, Done for today, a deleted lesson, or a probe that
 *   asked on. Its query is stopped, and nothing of it is kept anywhere: its
 *   map lived only here, and its session was a fork Claude Code never wrote.
 *
 * Lives on globalThis, as turn-runs.ts does: Next dev compiles each route as
 * its own module instance, and the page, the chat route and the abort route
 * must see one registry.
 */
import type { PlanDraft } from "../core/plan-draft.ts";

/** The draft agent's surface: the SdkAgent run and its stop. */
export interface DraftRun {
	continue(): Promise<void>;
	abort(): void;
}

interface Draft {
	/** The probe question it was drafted at. */
	basis: string;
	run: DraftRun;
	plan: PlanDraft | null;
	startedAt: number;
}

interface LhPlanDraftsGlobal {
	__lhPlanDrafts?: Map<string, Draft>;
}

function drafts(): Map<string, Draft> {
	const g = globalThis as typeof globalThis & LhPlanDraftsGlobal;
	return (g.__lhPlanDrafts ??= new Map<string, Draft>());
}

/** Starts the lesson's draft at question `basis`, unless one runs for it.
 *  `build` makes the draft agent; its `keep` takes the map, and is a no-op
 *  once the draft was taken or cancelled. */
export function startPlanDraft(chatId: string, basis: string, build: (keep: (plan: PlanDraft) => void) => DraftRun): void {
	const current = drafts().get(chatId);
	if (current?.basis === basis) return;
	if (current) cancelPlanDraft(chatId, "a newer last question");
	const draft: Draft = { basis, run: { continue: async () => {}, abort: () => {} }, plan: null, startedAt: Date.now() };
	drafts().set(chatId, draft);
	draft.run = build((plan) => {
		if (drafts().get(chatId) !== draft) return;
		draft.plan = plan;
		console.info(`[plan-draft ${chatId}] ready in ${((Date.now() - draft.startedAt) / 1000).toFixed(1)} s`);
	});
	console.info(`[plan-draft ${chatId}] started at question ${basis}`);
	void draft.run.continue().catch((err: unknown) => console.error(`[plan-draft ${chatId}] failed:`, err));
}

/** The teacher's turn takes the draft: its map when it is ready and still
 *  fits (`holds`), else null, and the draft is gone either way. */
export function takePlanDraft(chatId: string, holds: (basis: string) => boolean): PlanDraft | null {
	const draft = drafts().get(chatId);
	if (!draft) return null;
	drafts().delete(chatId);
	if (draft.plan && holds(draft.basis)) {
		console.info(`[plan-draft ${chatId}] taken, ${((Date.now() - draft.startedAt) / 1000).toFixed(1)} s after it started`);
		return draft.plan;
	}
	draft.run.abort();
	console.info(`[plan-draft ${chatId}] not taken: ${draft.plan ? "it no longer fits" : "not ready"}`);
	return null;
}

/** Stops the lesson's draft and forgets it. */
export function cancelPlanDraft(chatId: string, why: string): void {
	const draft = drafts().get(chatId);
	if (!draft) return;
	drafts().delete(chatId);
	draft.run.abort();
	console.info(`[plan-draft ${chatId}] cancelled: ${why}`);
}

/** The lesson's draft, for what checks it (tests, the settle's staleness). */
export function planDraftOf(chatId: string): { basis: string; ready: boolean } | null {
	const draft = drafts().get(chatId);
	return draft ? { basis: draft.basis, ready: draft.plan !== null } : null;
}
