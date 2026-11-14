import { createModels, type Api, type Model, type StreamFunction } from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ModelRole } from "../../config.ts";
import packageMetadata from "../../package.json" with { type: "json" };
import { claudeSubscriptionModel, claudeSubscriptionStream } from "./claude-stream.ts";
import { claudeAccount } from "./claude-connection.ts";
import { CLAUDE_MODEL } from "../core/contracts/claude.ts";

/** App identity is immutable and shared by Models and every native Agent.
 * Agent's default Pi attribution otherwise overrides the Models identity. */
export const APP_IDENTITY = Object.freeze({
	userAgent: Object.freeze({ custom: `learnharness/${packageMetadata.version}` }),
	attribution: Object.freeze({ name: packageMetadata.name, url: packageMetadata.homepage }),
});

/**
 * The one engine factory every agent's model comes from (the pi-ai swap,
 * docs/pi-engine-swap.md). Every agent runs CLAUDE_MODEL at its fixed
 * thinking level (owner, 2026-11-14) on the user's own `claude` CLI, under
 * one Claude account; the account is the only input.
 *
 * An "engine" is the model + the stream function the agent loop runs on —
 * the two things a test fake replaces.
 */

export interface PiEngine {
	model: Model<Api>;
	streamFn: StreamFunction;
	/** The thinking level the streamFn pins — observability + tests. */
	level?: ThinkingLevel;
}

export type { ThinkingLevel };

let collection: ReturnType<typeof createModels> | undefined;

/** The process-wide pi-ai Models collection, used as a CATALOG only: the
 *  ChatGPT connection reads OpenAI's model metadata from it, and read-time
 *  pricing reads older records' API models. Nothing streams through it,
 *  so no environment key is ever read for a model call. */
export function piModels() {
	if (!collection) {
		collection = createModels({ identity: APP_IDENTITY });
		for (const provider of builtinProviders()) collection.setProvider(provider);
	}
	return collection;
}

/** The production engine on one Claude account: CLAUDE_MODEL at
 *  CLAUDE_MODEL.thinkingLevel. Throws when the account is not set up in
 *  T3 Code or pi's catalog lacks the model, so a call never runs on a
 *  model or account it was not given. */
export function claudeEngine(account: string): PiEngine {
	const model = claudeSubscriptionModel(account);
	if (!model) throw new Error(`no ${CLAUDE_MODEL.id} on Claude account ${account}`);
	const level: ThinkingLevel = CLAUDE_MODEL.thinkingLevel;
	return {
		model,
		level,
		// bound streamSimple: the agent loop forwards state.thinkingLevel as
		// `reasoning`; the fixed level rides every call regardless.
		streamFn: (requestModel, context, options) =>
			claudeSubscriptionStream({ account: claudeAccount(account) ?? "missing" })(requestModel, context, { ...options, reasoning: level }),
	};
}

/** The role fallback agents reach only when no engine was injected. The
 *  agent layer cannot read settings (architecture law — it never imports
 *  the server layer) and production always injects (chat-handler), so this
 *  is a wiring bug and fails loudly. */
export function piEngineFor(role: ModelRole): PiEngine {
	throw new Error(`no engine injected for role "${role}"`);
}
