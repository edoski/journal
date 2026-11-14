import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { PiEngine } from "../src/agent/models.ts";
import { chatGPTModel } from "../src/agent/chatgpt-bridge.ts";
import { chatGPTStream } from "../src/agent/chatgpt-stream.ts";
import type { ChatGPTDispatchLifecycle } from "../src/agent/chatgpt-request-cycle.ts";

/** A ChatGPT engine as the engine factory built one before every agent ran
 * Claude Opus 5.5 (owner, 2026-11-14), so the ChatGPT stream keeps its tests
 * while its sign-in remains. */
export function chatGPTEngine(id: string, background: boolean | (() => boolean) = true, lifecycle?: ChatGPTDispatchLifecycle, thinkingLevel?: ThinkingLevel): PiEngine {
	const model = chatGPTModel(id);
	if (!model) throw new Error(`chatgpt catalog has no model ${id}`);
	const supported = getSupportedThinkingLevels(model);
	const level = thinkingLevel ? clampThinkingLevel(model, thinkingLevel) : (["medium", "low", "high", "minimal", "xhigh", "max"] as const).find((l) => supported.includes(l)) ?? supported[0] ?? "off";
	const purpose = typeof background === "function" ? background : () => background;
	return {
		model,
		level,
		streamFn: (requestModel, context, options) => chatGPTStream(purpose, lifecycle)(requestModel, context, { ...options, reasoning: level === "off" ? undefined : level }),
	};
}
