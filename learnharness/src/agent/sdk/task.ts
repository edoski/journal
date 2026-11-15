import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import { SdkAgent } from "./agent.ts";
import type { ClaudeCodeTool, SdkEngine } from "./engine.ts";

/**
 * The runner every background agent shares (researcher, demo builder, visual
 * maker, pdf reader, lesson digest, course-map builder, arc former): one SDK
 * agent on one prompt, no session kept, driven to its end. Provider and loop
 * failures throw; an abort throws an AbortError, so every `signal.aborted`
 * early return keeps working.
 */
export interface SubagentRunOptions {
	engine: SdkEngine;
	systemPrompt: string;
	prompt: string;
	/** Max model calls. */
	maxTurns: number;
	abortSignal?: AbortSignal;
	/** Money channel: one call per model request. */
	onUsage?: (usage: Usage) => void;
	/** Activity line per tool execution (job record progress). */
	onToolStart?: (toolName: string, args: unknown) => void;
	/** Per completed assistant message (the submit agents' step log). */
	onAssistantMessage?: (message: AssistantMessage, step: number) => void;
	/** A clean call of this tool ends the run (a submit). */
	endsTurn?: (toolName: string) => boolean;
	/** Claude Code's own tools that join the app's (the researcher's WebSearch). */
	builtins?: readonly ClaudeCodeTool[];
}

export interface SubagentRunResult {
	/** The messages this run added (assistant + tool results). */
	newMessages: AgentMessage[];
	/** The final assistant text (the deliverable). */
	text: string;
}

export async function runSubagent(tools: AgentTool<any, any>[], opts: SubagentRunOptions): Promise<SubagentRunResult> {
	const prompt: AgentMessage = { role: "user", content: opts.prompt, timestamp: Date.now() };
	const agent = new SdkAgent({
		engine: opts.engine,
		systemPrompt: opts.systemPrompt,
		tools,
		messages: [{ ...prompt, id: "prompt" } as AgentMessage],
		endsTurn: opts.endsTurn ?? (() => false),
		builtins: opts.builtins,
		ephemeral: { maxTurns: opts.maxTurns },
	});
	const onAbort = () => agent.abort();
	if (opts.abortSignal?.aborted) onAbort();
	opts.abortSignal?.addEventListener("abort", onAbort, { once: true });
	let step = 0;
	let errorMessage: string | undefined;
	let aborted = false;
	agent.subscribe((event) => {
		if (event.type === "tool_execution_start") opts.onToolStart?.(event.toolName, event.args);
		if (event.type !== "message_end" || (event.message as { role?: string }).role !== "assistant") return;
		const message = event.message as AssistantMessage;
		if (message.stopReason === "aborted") { aborted = true; return; }
		if (message.stopReason === "error") { errorMessage = message.errorMessage; return; }
		step++;
		opts.onUsage?.(message.usage);
		opts.onAssistantMessage?.(message, step);
	});
	try { await agent.continue(); }
	finally { opts.abortSignal?.removeEventListener("abort", onAbort); }
	if (aborted || opts.abortSignal?.aborted) {
		const error = new Error("aborted");
		error.name = "AbortError";
		throw error;
	}
	if (errorMessage !== undefined) throw new Error(errorMessage);
	const newMessages = agent.state.messages.slice(1);
	const last = newMessages.filter((m): m is AssistantMessage => (m as { role?: string }).role === "assistant").at(-1);
	const text = last ? last.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("") : "";
	return { newMessages, text };
}
