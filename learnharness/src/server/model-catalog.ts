/**
 * The model's server surface. Every agent runs CLAUDE_MODEL on one Claude
 * account (owner, 2026-11-14), so there is no catalog to pick from: this
 * module reports that account's state (GET /api/models) and the context
 * windows the meters divide by. The app runs only on subscriptions: no API
 * key, no environment key, no keyed provider reaches a model call.
 */

import { claudeConnected, refreshClaudeConnections } from "../agent/claude-connection.ts";
import { claudeSubscriptionModel, claudeSubscriptionModels } from "../agent/claude-stream.ts";
import type { ModelStatus } from "../core/contracts/models.ts";
import { effectiveSettings } from "./stores.ts";

/** Whether a model call on this Claude account could run now: its Claude
 *  Code is signed in to its plan. */
export function providerConnected(provider: string): boolean {
	return claudeConnected(provider);
}

/** The live-limits index: provider:id → contextWindow over the signed-in
 *  accounts. The one source for every context meter's denominator — the
 *  activity feed (observability.ts) and compaction resolve job and turn
 *  limits through this. A model missing here reads limit-null (usage-only). */
export function catalogContextLimits(): Map<string, number> {
	return new Map(claudeSubscriptionModels().map((model) => [`${model.provider}:${model.id}`, model.contextWindow]));
}

/** Whether T3 Code (or the plain signed-in `claude`) has this Claude account. */
export function claudeAccountKnown(provider: string): boolean {
	return claudeSubscriptionModel(provider) !== undefined;
}

/** GET /api/models: the settings' account, re-checked, and the model's window. */
export async function modelStatus(): Promise<ModelStatus> {
	await refreshClaudeConnections();
	const account = effectiveSettings().claude.account;
	return {
		account,
		connected: claudeConnected(account),
		contextWindow: claudeSubscriptionModel(account)?.contextWindow ?? null,
	};
}
