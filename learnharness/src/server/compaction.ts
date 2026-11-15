import {
	activeCompactionOf,
	compactionInstructions,
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

/**
 * The app's compaction policy over Claude Code's own compaction. Once a
 * settled turn's last request carried the trigger's worth of context, the
 * lesson's session is compacted in the background, inside the learner's
 * pause (question and problem poses end turns, so a settle is always
 * between turns), with the lesson's instructions. The next turn waits for a
 * compaction still running: nothing model-facing for a lesson interleaves
 * with one. Claude Code's automatic compaction stays on as the backstop.
 */
export interface CompactionDeps {
	canStart?: () => boolean;
	chatStore: ChatStore;
	engine: SdkEngine;
	kind: "teach" | "practice" | "probe";
	thresholdTokens: number;
	sessionStore?: SessionStore;
}

interface CompactionState {
	inFlight: Map<string, Promise<void>>;
}
const g = globalThis as typeof globalThis & { __lhCompaction?: CompactionState };
function state(): CompactionState {
	return (g.__lhCompaction ??= { inFlight: new Map() });
}

export function compactionInFlight(chatId: string): boolean {
	return state().inFlight.has(chatId);
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

async function compact(deps: CompactionDeps, chatId: string): Promise<void> {
	const record = deps.chatStore.getChat(chatId);
	if (!record?.session || !due(record, deps)) return;
	emit("compaction-changed", { chatId, running: true });
	try {
		const done = await compactSession(deps.engine, record.session, compactionInstructions(deps.kind, planTreeToText(record.tree, record.messages)), deps.sessionStore);
		const fresh = deps.chatStore.getChat(chatId);
		if (!fresh?.session) return;
		const marker = newCompactionMarker(done.summary, {
			firstKeptMessageId: "",
			tokensBefore: done.tokensBefore,
			model: `${deps.engine.model.provider}:${deps.engine.model.id}`,
			at: new Date().toISOString(),
		});
		deps.chatStore.saveMessages(chatId, [...fresh.messages, marker]);
		deps.chatStore.saveSession(chatId, { id: fresh.session.id, synced: fresh.session.synced, ...(done.anchor ? { anchor: done.anchor } : {}) });
		emit("record-changed", { chatId });
	} catch (err) {
		console.error(`[chat ${chatId}] compaction failed:`, err);
	} finally {
		emit("compaction-changed", { chatId, running: false });
	}
}

function start(deps: CompactionDeps, chatId: string): Promise<void> {
	const run = compact(deps, chatId);
	state().inFlight.set(chatId, run);
	return run.finally(() => state().inFlight.delete(chatId));
}

/** The turn gate: waits for a running compaction, and compacts now when the
 *  lesson is still over the trigger (the settle kick was skipped). */
export async function ensureCompacted(deps: CompactionDeps, chatId: string): Promise<void> {
	await awaitCompaction(chatId);
	if (deps.canStart?.() === false) return;
	const record = deps.chatStore.getChat(chatId);
	if (!record || !due(record, deps) || state().inFlight.has(chatId)) return;
	await start(deps, chatId);
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
