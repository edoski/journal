import { spawn } from "node:child_process";
import {
	getCurrentSystemPrompt,
	getCurrentTools,
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type ImageContent,
	type Message,
	type Model,
	type SimpleStreamOptions,
	type StreamFunction,
	type TextContent,
	type ThinkingLevel,
	type ToolCall,
} from "@earendil-works/pi-ai";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { CLAUDE_LIMIT_TEXT, CLAUDE_MODEL_IDS, CLAUDE_SUBSCRIPTION, CLAUDE_USAGE_URL } from "../core/contracts/claude.ts";
import { claudeLaunch, type LoadedClaudeAccount } from "./claude-accounts.ts";
import { CLAUDE_EFFORTS, CLAUDE_MCP_SERVER, CLAUDE_TOOL_PREFIX, claudeArgs, claudeChildEnv, claudeWorkDir, resolveClaudeBinary, writeClaudeCallFiles, type ClaudeEffort, type ClaudeEnv, type ClaudeLaunch } from "./claude-cli.ts";
import { claudeAccount, claudeAccountConnections } from "./claude-connection.ts";
import { recordClaudeRateLimit } from "./claude-usage.ts";

const NO_KEY = " No API key was used.";

/** Pi's Anthropic catalog entries, relabelled as one account's plan models: no
 * per-token cost, same limits and thinking map (so pi's level clamp still
 * works). The default account resolves before the first sign-in check. */
export function claudeSubscriptionModel(providerId: string, id: string): Model<Api> | undefined {
	if (!(CLAUDE_MODEL_IDS as readonly string[]).includes(id)) return undefined;
	const account = claudeAccount(providerId);
	if (!account && providerId !== CLAUDE_SUBSCRIPTION.providerId) return undefined;
	const base = (ANTHROPIC_MODELS as Record<string, Model<Api> | undefined>)[id];
	if (!base) return undefined;
	return { ...base, provider: providerId, name: account ? `${base.name} · ${account.label}` : base.name, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
}

/** Opus 5.5 once per signed-in account. */
export function claudeSubscriptionModels(): Model<Api>[] {
	return claudeAccountConnections()
		.filter((entry) => entry.connection.state === "connected")
		.flatMap((entry) => CLAUDE_MODEL_IDS.flatMap((id) => claudeSubscriptionModel(entry.account.providerId, id) ?? []));
}

const isEffort = (value: unknown): value is ClaudeEffort => typeof value === "string" && (CLAUDE_EFFORTS as readonly string[]).includes(value);

/** Pi's level → Claude Code's --effort value. The model's map wins; a level
 * the map leaves out keeps its own name (pi's convention), and minimal, which
 * Claude Code lacks, rounds up to low. Off and unsupported levels have none. */
export function claudeEffort(model: Model<Api>, level: ThinkingLevel | undefined): ClaudeEffort | undefined {
	if (!level) return undefined;
	const map = model.thinkingLevelMap as Record<string, unknown> | undefined;
	const mapped = map && level in map ? map[level] : level === "minimal" ? "low" : level;
	return isEffort(mapped) ? mapped : undefined;
}

type AnthropicBlock =
	| { type: "text"; text: string }
	| { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export const CLAUDE_TRANSCRIPT_INTRO = "The conversation so far is replayed below as a transcript, oldest first. Continue it as the assistant: take your next step now, calling tools for real when needed.";

function image(part: ImageContent): AnthropicBlock {
	return { type: "image", source: { type: "base64", media_type: part.mimeType, data: part.data } };
}

/** Each `-p` stream-json user line is a separate model turn, so the whole
 * history rides one user message. Blocks depend only on the messages, the
 * intro leads and nothing trails, so when the transcript only grew, this
 * call's blocks extend the last call's and the prompt cache hits. */
export function claudeTranscriptBlocks(messages: readonly Message[]): AnthropicBlock[] {
	const blocks: AnthropicBlock[] = [{ type: "text", text: CLAUDE_TRANSCRIPT_INTRO }];
	for (const message of messages) {
		if (message.role === "user") {
			const parts: (TextContent | ImageContent)[] = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
			for (const part of parts) blocks.push(part.type === "image" ? image(part) : { type: "text", text: `<user>\n${part.text}\n</user>` });
		} else if (message.role === "assistant") {
			// Errored or aborted turns are incomplete; pi drops them for every provider.
			if (message.stopReason === "error" || message.stopReason === "aborted") continue;
			for (const part of message.content) {
				if (part.type === "text" && part.text) blocks.push({ type: "text", text: `<you_said>\n${part.text}\n</you_said>` });
				else if (part.type === "toolCall") blocks.push({ type: "text", text: `<you_called tool="${part.name}" id="${part.id}">\n${JSON.stringify(part.arguments)}\n</you_called>` });
			}
		} else if (message.role === "toolResult") {
			const body = message.content.filter((part): part is TextContent => part.type === "text").map((part) => part.text).join("\n");
			blocks.push({ type: "text", text: `<tool_result tool="${message.toolName}" id="${message.toolCallId}"${message.isError ? ' error="true"' : ""}>\n${body}\n</tool_result>` });
			for (const part of message.content) if (part.type === "image") blocks.push(image(part));
		}
	}
	return blocks;
}

interface RateLimit { resetsAt?: number; rateLimitType?: string }

/** Curated, user-facing failure text; every variant says no API key was used. */
export function claudeErrorMessage({ rateLimit, status, code, text = "" }: { rateLimit?: RateLimit; status?: number; code?: string; text?: string }): string {
	if (rateLimit || code === "rate_limit" || /usage limit|limit reached|rate.?limit/i.test(text)) {
		const reset = rateLimit?.resetsAt ? ` It resets ${claudeResetTime(rateLimit.resetsAt)}.` : "";
		return `${CLAUDE_LIMIT_TEXT}${reset} See ${CLAUDE_USAGE_URL}.${NO_KEY}`;
	}
	if (code === "authentication_failed" || code === "oauth_org_not_allowed" || status === 401 || /not logged in|please (run \/)?log ?in|authenticat/i.test(text)) {
		return `Claude Code is not signed in. Run \`claude\` in a terminal, sign in with your Claude account, then press Refresh in Settings → Providers.${NO_KEY}`;
	}
	if (code === "model_not_found" || status === 404 || /model\b.*\b(not found|not available|unavailable|does not exist)|(invalid|unknown) model/i.test(text)) {
		return `The selected Claude model is not available on your plan or this Claude Code version. Choose another Claude model.${NO_KEY}`;
	}
	return `Claude request failed. Check that \`claude\` works in a terminal and your plan has usage left, then retry.${NO_KEY}`;
}

/** resetsAt arrives as Unix seconds. */
export function claudeResetTime(resetsAt: number): string {
	const ms = resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
	return `at ${new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
}

export const CLAUDE_API_KEY_REFUSAL = `Claude Code would bill an API key here, not your Claude plan, so LearnHarness stopped the request. Remove the API key from Claude Code's settings, then retry.${NO_KEY}`;
export const CLAUDE_MISSING = `Claude Code was not found. Install Claude Code, run \`claude\` in a terminal and sign in, then press Refresh in Settings → Providers.${NO_KEY}`;
const CLAUDE_ABORTED = "Claude request cancelled.";
/** Background jobs pass no abort signal, so a silent child would otherwise hold them forever. */
const CLAUDE_IDLE_MS = 10 * 60_000;

/** A loop-level failure on a Claude turn: keep curated text, mask the rest. */
export function claudeTurnError(message: string): string {
	return message.endsWith(NO_KEY) ? message : claudeErrorMessage({});
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Json : undefined;
const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Folds Claude Code's stream-json lines into pi events. Only `stream_event`
 * content is model output; Claude Code's own assistant snapshots, including
 * synthetic error messages, only inform the error text. Once `finished`,
 * the caller must kill the child at once. */
export class ClaudeStreamMapper {
	readonly message: AssistantMessage;
	finished = false;
	private started = false;
	private blocks = new Map<number, number>();
	private json = new Map<number, string>();
	/** Thinking blocks with no text yet. Claude Code can stream a thinking block
	 * that carries only a signature; showing it would render an empty panel. */
	private unseenThinking = new Set<number>();
	private stopReason: "stop" | "length" = "stop";
	private rateLimit: RateLimit | undefined;
	private errorCode: string | undefined;
	private errorStatus: number | undefined;

	constructor(model: Model<Api>, now = Date.now(), private readonly expectsTools = false, private readonly onRateLimit?: (info: unknown) => void) {
		this.message = {
			role: "assistant", api: model.api, provider: model.provider, model: model.id, content: [], stopReason: "stop", timestamp: now,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		};
	}

	feed(line: unknown): AssistantMessageEvent[] {
		const event = record(line);
		if (this.finished || !event) return [];
		switch (event.type) {
			case "system":
				if (event.subtype !== "init") return [];
				if (event.apiKeySource !== "none") return this.fail(CLAUDE_API_KEY_REFUSAL);
				if (this.expectsTools && !(Array.isArray(event.mcp_servers) && event.mcp_servers.some((server) => record(server)?.name === CLAUDE_MCP_SERVER && record(server)?.status === "connected"))) {
					return this.fail(`Claude Code could not load LearnHarness's tools, so the turn was stopped.${NO_KEY}`);
				}
				return [];
			case "rate_limit_event": {
				const info = record(event.rate_limit_info);
				if (info) this.onRateLimit?.(info);
				if (info?.status === "rejected") this.rateLimit = { resetsAt: num(info.resetsAt), rateLimitType: typeof info.rateLimitType === "string" ? info.rateLimitType : undefined };
				return [];
			}
			case "assistant": {
				if (typeof event.error === "string") this.errorCode = event.error;
				if (num(event.api_error_status) !== undefined) this.errorStatus = num(event.api_error_status);
				// A tool call that never streamed would reach the MCP server, which never answers: fail instead of waiting.
				const content = record(event.message)?.content;
				if (!event.parent_tool_use_id && Array.isArray(content) && content.some((block) => record(block)?.type === "tool_use") && !this.message.content.some((block) => block.type === "toolCall")) {
					return this.fail(`Claude Code returned a reply LearnHarness could not stream. Retry.${NO_KEY}`);
				}
				return [];
			}
			case "stream_event":
				if (event.parent_tool_use_id) return [];
				return this.stream(record(event.event));
			case "result":
				return this.result(event);
			default:
				return [];
		}
	}

	/** The child ended before a result line. */
	exit(code: number | null, signal: string | null, stderr: string): AssistantMessageEvent[] {
		if (this.finished) return [];
		const tail = stderr.trim().slice(-300);
		const how = signal ? `was stopped (${signal})` : `exited with code ${code}`;
		return this.fail(`Claude Code ${how} before finishing the reply.${tail ? ` ${tail}` : ""}${NO_KEY}`);
	}

	abort(): AssistantMessageEvent[] {
		if (this.finished) return [];
		return this.fail(CLAUDE_ABORTED, "aborted");
	}

	fail(errorMessage: string, reason: "error" | "aborted" = "error"): AssistantMessageEvent[] {
		this.finished = true;
		this.message.stopReason = reason;
		this.message.errorMessage = errorMessage;
		return [{ type: "error", reason, error: this.message }];
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
		u.totalTokens = u.input + u.output + u.cacheRead + u.cacheWrite;
	}

	private stream(event: Json | undefined): AssistantMessageEvent[] {
		if (!event) return [];
		const content = this.message.content;
		const partial = this.message;
		switch (event.type) {
			case "message_start": {
				const message = record(event.message);
				if (this.message.content.length) return this.fail(`Claude Code restarted its reply midway. Retry.${NO_KEY}`);
				this.blocks.clear(); this.json.clear(); this.unseenThinking.clear();
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
					const name = block.name.startsWith(CLAUDE_TOOL_PREFIX) ? block.name.slice(CLAUDE_TOOL_PREFIX.length) : block.name;
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
				if (reason === "tool_use") return this.done("toolUse");
				if (reason === "max_tokens") this.stopReason = "length";
				if (reason === "refusal") return this.fail(`Claude declined to answer this request.${NO_KEY}`);
				return [];
			}
			case "message_stop":
				return this.done(this.stopReason);
			default:
				return [];
		}
	}

	private result(event: Json): AssistantMessageEvent[] {
		if (event.is_error === true || (typeof event.subtype === "string" && event.subtype !== "success")) {
			return this.fail(claudeErrorMessage({
				rateLimit: this.rateLimit,
				status: num(event.api_error_status) ?? this.errorStatus,
				code: this.errorCode,
				text: typeof event.result === "string" ? event.result : "",
			}));
		}
		return this.done(this.stopReason);
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

export interface ClaudeStreamDeps {
	/** Resolves the `claude` binary; tests inject a fake executable here. */
	binary?: () => string | null;
	/** The base environment before the denylist is applied. */
	env?: ClaudeEnv;
	/** The account this call runs on; absent means the plain signed-in `claude`. */
	account?: LoadedClaudeAccount;
}

/** One `claude -p` process per model call. Pi's agent loop runs every tool;
 * Claude Code only produces the next assistant message. */
export function claudeSubscriptionStream({ binary = () => resolveClaudeBinary(), env = process.env, account }: ClaudeStreamDeps = {}): StreamFunction<Api, SimpleStreamOptions> {
	return (model, context, options) => {
		const output = new AssistantMessageEventStream();
		const mapper = new ClaudeStreamMapper(model, Date.now(), getCurrentTools(context.messages).length > 0, (info) => recordClaudeRateLimit(account?.providerId ?? model.provider, info));
		let stop = () => {};
		let ended = false;
		const emit = (events: AssistantMessageEvent[]) => {
			for (const event of events) output.push(event);
			if (mapper.finished && !ended) { ended = true; stop(); output.end(); }
		};
		const signal = options?.signal;
		if (signal?.aborted) { emit(mapper.abort()); return output; }
		const bin = binary();
		if (!bin) { emit(mapper.fail(CLAUDE_MISSING)); return output; }

		const tools = getCurrentTools(context.messages).map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters }));
		const effort = claudeEffort(model, options?.reasoning);
		let launch: ClaudeLaunch | undefined;
		try { launch = account ? claudeLaunch(account, claudeWorkDir()) : undefined; } catch (error) {
			emit(mapper.fail(`${(error as Error).message}${NO_KEY}`));
			return output;
		}
		let files: ReturnType<typeof writeClaudeCallFiles> | undefined;
		let child: ReturnType<typeof spawn>;
		try {
			files = writeClaudeCallFiles(getCurrentSystemPrompt(context.messages), tools);
			const args = claudeArgs({ model: model.id, effort, systemPromptFile: files.systemPromptFile, mcpConfigFile: files.mcpConfigFile });
			child = spawn(bin, args, { cwd: claudeWorkDir(), env: claudeChildEnv(env, { binary: bin, thinking: effort !== undefined, launch }), stdio: ["pipe", "pipe", "pipe"] });
		} catch (error) {
			files?.dispose();
			emit(mapper.fail(`Claude Code could not be started (${error instanceof Error ? error.message : String(error)}).${NO_KEY}`));
			return output;
		}
		const { stdin, stdout, stderr: errors } = child as ReturnType<typeof spawn> & { stdin: NonNullable<ReturnType<typeof spawn>["stdin"]>; stdout: NonNullable<ReturnType<typeof spawn>["stdout"]>; stderr: NonNullable<ReturnType<typeof spawn>["stderr"]> };
		let stderr = "";
		let buffer = "";
		let idle: ReturnType<typeof setTimeout> | undefined;
		const watch = () => {
			clearTimeout(idle);
			idle = setTimeout(() => emit(mapper.fail(`Claude Code sent nothing for ${CLAUDE_IDLE_MS / 60_000} minutes, so the request was stopped.${NO_KEY}`)), CLAUDE_IDLE_MS);
			idle.unref?.();
		};
		const onAbort = () => emit(mapper.abort());
		stop = () => {
			clearTimeout(idle);
			signal?.removeEventListener("abort", onAbort);
			if (child.exitCode !== null || child.signalCode !== null) return;
			child.kill("SIGTERM");
			setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 2000).unref();
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		const feedLine = (raw: string) => {
			const line = raw.trim();
			if (!line || mapper.finished) return;
			let parsed: unknown;
			try { parsed = JSON.parse(line); } catch { return; }
			emit(mapper.feed(parsed));
		};
		watch();
		stdout.setEncoding("utf8");
		stdout.on("data", (chunk: string) => {
			watch();
			buffer += chunk;
			let newline: number;
			while (!mapper.finished && (newline = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				feedLine(line);
			}
		});
		errors.setEncoding("utf8");
		errors.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-4000); });
		stdin.on("error", () => {});
		child.on("error", (error) => emit(mapper.fail(`Claude Code could not be started (${error.message}).${NO_KEY}`)));
		child.on("close", (code, killSignal) => {
			files?.dispose();
			feedLine(buffer);
			emit(mapper.exit(code, killSignal, stderr));
		});
		stdin.end(`${JSON.stringify({ type: "user", message: { role: "user", content: claudeTranscriptBlocks(context.messages) } })}\n`);
		return output;
	};
}
