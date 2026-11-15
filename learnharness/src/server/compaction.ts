import {
	activeCompactionOf,
	compactionInstructions,
	compactionLimitTokens,
	compactionTriggerTokens,
	contextTokensOf,
	newCompactionMarker,
	planTreeToText,
	type ChatRecord,
	type LhMessage,
} from "../core/index.ts";
import { emit } from "../core/events.ts";
import type { ChatStore } from "../core/ports.ts";
import { compactSession } from "../agent/sdk/compact.ts";
import type { SdkEngine } from "../agent/sdk/engine.ts";
import type { SessionStore } from "../agent/sdk/session-files.ts";
import { isTurnRunning } from "./turn-liveness.ts";

/**
 * The app's compaction policy over Claude Code's own compaction. Once a
 * settled turn's last request carried the trigger's worth of context, a
 * copy of the lesson's session is compacted in the background, inside the
 * learner's pause, with the lesson's instructions. The lesson takes the
 * compacted copy only if no turn ran on its session meanwhile; a summary a
 * turn overtook is dropped and redone once no turn runs. So a turn never
 * waits on a compaction while its request still fits under the limit
 * (round 9: 30 to 43 s under "Compacting the conversation…"); only a lesson
 * at the limit waits for its compaction. Claude Code's automatic
 * compaction stays on as the backstop.
 */
export interface CompactionDeps {
	canStart?: () => boolean;
	chatStore: ChatStore;
	engine: SdkEngine;
	kind: "teach" | "practice" | "probe";
	thresholdTokens: number;
	/** The most context a turn's request may carry: at it, the turn waits
	 *  for the compaction. */
	limitTokens: number;
	sessionStore?: SessionStore;
}

interface CompactionState {
	inFlight: Map<string, Promise<void>>;
	/** Lessons whose running compaction a turn went past. */
	overtaken: Set<string>;
	/** Lessons whose turn waits on their compaction. */
	holding: Set<string>;
}
const g = globalThis as typeof globalThis & { __lhCompaction?: Partial<CompactionState> };
function state(): CompactionState {
	const s = (g.__lhCompaction ??= {});
	s.inFlight ??= new Map();
	s.overtaken ??= new Set();
	s.holding ??= new Set();
	return s as CompactionState;
}

export function compactionInFlight(chatId: string): boolean {
	return state().inFlight.has(chatId);
}

/** A turn of the lesson waits on its compaction: the lesson says so. */
export function compactionHoldsTurn(chatId: string): boolean {
	return state().holding.has(chatId);
}

export async function awaitCompaction(chatId: string): Promise<void> {
	await state().inFlight.get(chatId)?.catch(() => undefined);
}

/** The trigger for a model window. LH_COMPACTION_TOKENS lowers it for a
 *  check that must reach a compaction in a short lesson. */
export function effectiveThresholdTokens(contextWindowTokens: number | undefined): number {
	const override = Number(process.env.LH_COMPACTION_TOKENS);
	return Number.isFinite(override) && override > 0 ? override : compactionTriggerTokens(contextWindowTokens);
}

/** The limit for a model window, never under its trigger. */
export function effectiveLimitTokens(contextWindowTokens: number | undefined): number {
	return Math.max(compactionLimitTokens(contextWindowTokens), effectiveThresholdTokens(contextWindowTokens));
}

/** The context the lesson's last request carried, or 0 when a compaction
 *  came after it. */
export function settledContextTokens(messages: readonly LhMessage[]): number {
	const compaction = activeCompactionOf(messages);
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m === compaction) return 0;
		if (m.role === "assistant" && m.stopReason !== "error" && m.stopReason !== "aborted" && m.usage) return contextTokensOf(m.usage);
	}
	return 0;
}

function due(record: ChatRecord, deps: CompactionDeps): boolean {
	return record.session !== undefined && settledContextTokens(record.messages) >= deps.thresholdTokens;
}

/** One compaction of a copy of the session: "overtaken" when a turn ran on
 *  the lesson meanwhile, so the summary was dropped. */
async function compact(deps: CompactionDeps, chatId: string): Promise<"done" | "overtaken"> {
	const record = deps.chatStore.getChat(chatId);
	if (!record?.session || !due(record, deps)) return "done";
	const from = record.session;
	state().overtaken.delete(chatId);
	try {
		const done = await compactSession(deps.engine, from, compactionInstructions(deps.kind, planTreeToText(record.tree, record.messages)), deps.sessionStore);
		const fresh = deps.chatStore.getChat(chatId);
		if (!fresh?.session) return "done";
		if (state().overtaken.has(chatId) || isTurnRunning(chatId) || fresh.session.id !== from.id || fresh.session.synced !== from.synced) {
			console.info(`[chat ${chatId}] compaction dropped: a turn ran on the lesson while it worked`);
			return "overtaken";
		}
		const marker = newCompactionMarker(done.summary, {
			firstKeptMessageId: "",
			tokensBefore: done.tokensBefore,
			model: `${deps.engine.model.provider}:${deps.engine.model.id}`,
			at: new Date().toISOString(),
		});
		deps.chatStore.saveMessages(chatId, [...fresh.messages, marker]);
		deps.chatStore.saveSession(chatId, { id: done.sessionId, synced: fresh.session.synced, ...(done.anchor ? { anchor: done.anchor } : {}) });
		done.keep();
		emit("record-changed", { chatId });
	} catch (err) {
		console.error(`[chat ${chatId}] compaction failed:`, err);
	} finally {
		state().overtaken.delete(chatId);
	}
	return "done";
}

/** Compacts until a summary lands or a turn is running, whose settle kicks
 *  the next one. */
async function run(deps: CompactionDeps, chatId: string): Promise<void> {
	while (await compact(deps, chatId) === "overtaken" && !isTurnRunning(chatId) && deps.canStart?.() !== false);
}

function start(deps: CompactionDeps, chatId: string): Promise<void> {
	const running = run(deps, chatId);
	state().inFlight.set(chatId, running);
	return running.finally(() => state().inFlight.delete(chatId));
}

/** The turn gate. Under the limit the turn goes ahead at once, past any
 *  running compaction. At the limit it waits for the running compaction,
 *  or compacts now (the settle kick was skipped), and the lesson says why
 *  the reply waits. */
export async function ensureCompacted(deps: CompactionDeps, chatId: string): Promise<void> {
	const record = deps.chatStore.getChat(chatId);
	if (!record || settledContextTokens(record.messages) < deps.limitTokens) {
		if (state().inFlight.has(chatId)) state().overtaken.add(chatId);
		return;
	}
	state().holding.add(chatId);
	emit("compaction-changed", { chatId, running: true });
	try {
		while (state().inFlight.has(chatId)) await awaitCompaction(chatId);
		if (deps.canStart?.() === false) return;
		const fresh = deps.chatStore.getChat(chatId);
		if (!fresh || !due(fresh, deps)) return;
		await start(deps, chatId);
	} finally {
		state().holding.delete(chatId);
		emit("compaction-changed", { chatId, running: false });
	}
}

/** The settle kick: starts the compaction in the background when due. */
export function kickCompaction(buildDeps: () => CompactionDeps | null, chatId: string): void {
	if (state().inFlight.has(chatId)) return;
	const deps = buildDeps();
	if (!deps || deps.canStart?.() === false) return;
	const record = deps.chatStore.getChat(chatId);
	if (!record || !due(record, deps)) return;
	void start(deps, chatId);
}
