import type { Api, AssistantMessage, AssistantMessageEvent, Model, ToolCall } from "@earendil-works/pi-ai";
import { NO_KEY } from "../claude-errors.ts";
import { SDK_TOOL_PREFIX } from "./engine.ts";

type Json = Record<string, unknown>;
const record = (value: unknown): Json | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Json : undefined;
const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * One model request's raw Anthropic stream events (the SDK's `stream_event`)
 * folded into the app's assistant message and its incremental events. A
 * thinking block shows only once it has text: Claude Code can stream one that
 * carries only a signature. Tool names lose the in-process server's prefix.
 */
export class AssistantStream {
	readonly message: AssistantMessage;
	finished = false;
	private started = false;
	private blocks = new Map<number, number>();
	private json = new Map<number, string>();
	private unseenThinking = new Set<number>();
	private stopReason: "stop" | "length" = "stop";

	constructor(model: Model<Api>, now = Date.now()) {
		this.message = {
			role: "assistant", api: model.api, provider: model.provider, model: model.id, content: [], stopReason: "stop", timestamp: now,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		};
	}

	fail(errorMessage: string, reason: "error" | "aborted" = "error"): AssistantMessageEvent[] {
		this.finished = true;
		this.message.stopReason = reason;
		this.message.errorMessage = errorMessage;
		return [...this.start(), { type: "error", reason, error: this.message }];
	}

	private done(reason: "stop" | "length" | "toolUse"): AssistantMessageEvent[] {
		this.finished = true;
		this.message.stopReason = reason;
		return [...this.start(), { type: "done", reason, message: this.message }];
	}

	private start(): AssistantMessageEvent[] {
		if (this.started) return [];
		this.started = true;
		return [{ type: "start", partial: this.message }];
	}

	private usage(raw: unknown): void {
		const usage = record(raw);
		if (!usage) return;
		const u = this.message.usage;
		u.input = num(usage.input_tokens) ?? u.input;
		u.output = num(usage.output_tokens) ?? u.output;
		u.cacheRead = num(usage.cache_read_input_tokens) ?? u.cacheRead;
		u.cacheWrite = num(usage.cache_creation_input_tokens) ?? u.cacheWrite;
		const oneHour = num(record(usage.cache_creation)?.ephemeral_1h_input_tokens);
		if (oneHour !== undefined) u.cacheWrite1h = oneHour;
		u.totalTokens = u.input + u.output + u.cacheRead + u.cacheWrite;
	}

	feed(raw: unknown): AssistantMessageEvent[] {
		const event = record(raw);
		if (!event || this.finished) return [];
		const content = this.message.content;
		const partial = this.message;
		switch (event.type) {
			case "message_start": {
				const message = record(event.message);
				if (typeof message?.id === "string") this.message.responseId = message.id;
				if (typeof message?.model === "string") this.message.responseModel = message.model;
				this.usage(message?.usage);
				return this.start();
			}
			case "content_block_start": {
				const index = num(event.index), block = record(event.content_block);
				if (index === undefined || !block) return [];
				const contentIndex = content.length;
				if (block.type === "text") {
					content.push({ type: "text", text: "" });
					this.blocks.set(index, contentIndex);
					return [...this.start(), { type: "text_start", contentIndex, partial }];
				}
				if (block.type === "thinking") {
					this.unseenThinking.add(index);
					return this.start();
				}
				if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
					const name = block.name.startsWith(SDK_TOOL_PREFIX) ? block.name.slice(SDK_TOOL_PREFIX.length) : block.name;
					content.push({ type: "toolCall", id: block.id, name, arguments: {} });
					this.blocks.set(index, contentIndex);
					this.json.set(index, "");
					return [...this.start(), { type: "toolcall_start", contentIndex, partial }];
				}
				return [];
			}
			case "content_block_delta": {
				const index = num(event.index), delta = record(event.delta);
				if (index !== undefined && this.unseenThinking.has(index)) {
					if (delta?.type !== "thinking_delta" || typeof delta.thinking !== "string" || !delta.thinking) return [];
					this.unseenThinking.delete(index);
					const contentIndex = content.length;
					content.push({ type: "thinking", thinking: delta.thinking });
					this.blocks.set(index, contentIndex);
					return [{ type: "thinking_start", contentIndex, partial }, { type: "thinking_delta", contentIndex, delta: delta.thinking, partial }];
				}
				const contentIndex = index === undefined ? undefined : this.blocks.get(index);
				const block = contentIndex === undefined ? undefined : content[contentIndex];
				if (contentIndex === undefined || !block || !delta) return [];
				if (delta.type === "text_delta" && block.type === "text" && typeof delta.text === "string") {
					block.text += delta.text;
					return [{ type: "text_delta", contentIndex, delta: delta.text, partial }];
				}
				if (delta.type === "thinking_delta" && block.type === "thinking" && typeof delta.thinking === "string") {
					block.thinking += delta.thinking;
					return [{ type: "thinking_delta", contentIndex, delta: delta.thinking, partial }];
				}
				if (delta.type === "signature_delta" && block.type === "thinking" && typeof delta.signature === "string") {
					block.thinkingSignature = (block.thinkingSignature ?? "") + delta.signature;
					return [];
				}
				if (delta.type === "input_json_delta" && block.type === "toolCall" && typeof delta.partial_json === "string") {
					this.json.set(index!, (this.json.get(index!) ?? "") + delta.partial_json);
					return [{ type: "toolcall_delta", contentIndex, delta: delta.partial_json, partial }];
				}
				return [];
			}
			case "content_block_stop": {
				const index = num(event.index);
				if (index !== undefined && this.unseenThinking.delete(index)) return [];
				const contentIndex = index === undefined ? undefined : this.blocks.get(index);
				const block = contentIndex === undefined ? undefined : content[contentIndex];
				if (contentIndex === undefined || !block) return [];
				if (block.type === "text") return [{ type: "text_end", contentIndex, content: block.text, partial }];
				if (block.type === "thinking") return [{ type: "thinking_end", contentIndex, content: block.thinking, partial }];
				parseArguments(block, this.json.get(index!) ?? "");
				return [{ type: "toolcall_end", contentIndex, toolCall: block, partial }];
			}
			case "message_delta": {
				this.usage(event.usage);
				const reason = record(event.delta)?.stop_reason;
				if (reason === "max_tokens") this.stopReason = "length";
				if (reason === "refusal") return this.fail(`Claude declined to answer this request.${NO_KEY}`);
				return [];
			}
			case "message_stop":
				return this.done(content.some((block) => block.type === "toolCall") ? "toolUse" : this.stopReason);
			default:
				return [];
		}
	}
}

function parseArguments(call: ToolCall, raw: string): void {
	if (!raw.trim()) { call.arguments = {}; return; }
	try {
		const parsed: unknown = JSON.parse(raw);
		if (record(parsed)) { call.arguments = parsed as ToolCall["arguments"]; return; }
		throw new Error("not an object");
	} catch {
		call.arguments = {};
		call.argumentsError = `The tool arguments were not a valid JSON object: ${raw.slice(0, 500)}`;
	}
}
