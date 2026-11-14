/**
 * runSubmitAgent — the shared single-submit agent seam (the lesson digest
 * and the course-map builder): one TypeBox-validated submit
 * call is the whole deliverable (a pi agent purely so the model can retry a
 * schema-invalid call). The submitted value is captured from the execute
 * seam, which only fires on a schema-valid call — the ??-fill (the old zod
 * defaults) applies at the capture.
 */

import type { Usage } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { TSchema } from "typebox";
import { invalidInputResult, toToolResult } from "../tool-execute.ts";
import type { ModelRole } from "../../../config.ts";
import type { PiEngine } from "../models.ts";
import { runSubagent } from "./pi-run.ts";
import { healToolRecord } from "../tools/heal.ts";
import { healEncodedArguments } from "../../core/argument-heal.ts";

export async function runSubmitAgent<T>(opts: {
	role: ModelRole;
	toolName: string;
	toolDescription: string;
	parameters: TSchema;
	/** Weak-model tolerance: the old zod `.default()`s, applied to the
	 *  schema-valid raw input at the submit seam. */
	fill: (input: any) => T;
	systemPrompt: string;
	prompt: string;
	engine: PiEngine | undefined;
	signal: AbortSignal | undefined;
	onStep: (usage: Usage, model: string, step: number, finishReason: string, tools: string) => void;
	neverSubmitted: string;
	/** Extra tools beside the submit call (the course-map builder's material
	 *  readers): a small agentic loop instead of a bare retry. */
	extraTools?: Record<string, AgentTool<any>>;
	/** Turn budget for the loop (default 4 = retry-only; a builder with
	 *  extra tools sets its own). */
	maxTurns?: number;
	/** Debug: raw provider-event recording key (LH_PROVIDER_EVENTS=1). */
	chatId?: string;
	/** Semantic validation at the submit seam: the value is schema-valid
	 *  but may violate a PIPELINE law (coverage, echo-equality). Returning
	 *  a problem string yields an isError result (invalidInputResult) →
	 *  the model retries within maxTurns. null = accept. */
	validate?: (value: T) => string | null | Promise<string | null>;
}): Promise<T> {
	let submitted: T | undefined;
	const result = await runSubagent(
		[
			// healToolRecord (owner, 2026-10-09): the standard argument heal
		// over the extra tools — same as every
		// registry.
		...(opts.extraTools ? Object.values(healToolRecord(opts.extraTools)) : []),
			{
				name: opts.toolName,
				label: opts.toolName,
				description: opts.toolDescription,
				parameters: opts.parameters,
				// The standard argument heal (the whitehead generalization, 2026-10-09).
				prepareArguments: (args) => healEncodedArguments(args, opts.parameters) as never,
				execute: async (_toolCallId, input) => {
					const value = opts.fill(input);
					const problem = (await opts.validate?.(value)) ?? null;
					if (problem) return invalidInputResult(opts.toolName, [problem]);
					submitted = value;
					return toToolResult(submitted);
				},
			} satisfies AgentTool<any>,
		],
		{
			role: opts.role,
			engine: opts.engine,
			systemPrompt: opts.systemPrompt,
			prompt: opts.prompt,
			maxTurns: opts.maxTurns ?? 4,
			abortSignal: opts.signal,
			chatId: opts.chatId,
			onAssistantMessage: (message, step) =>
				opts.onStep(
					message.usage,
					// Provider-qualified stamp:
					// pi reports the bare id; usage stamps carry provider:id to
					// match the price table's uniform keys.
					`${message.provider}:${message.model}`,
					step,
					message.stopReason,
					message.content.filter((c) => c.type === "toolCall").map((c) => (c as { name: string }).name).join(", ") || "(none)",
				),
			shouldStop: (_message, toolResults) => toolResults.some((r) => r.toolName === opts.toolName && !r.isError),
		},
	);
	void result;
	if (!submitted) throw new Error(opts.neverSubmitted);
	return submitted;
}
