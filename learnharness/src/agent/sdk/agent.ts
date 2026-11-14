import { randomUUID } from "node:crypto";
import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentContext, AgentEvent, AgentMessage, AgentTool, AgentToolCallOutcome } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, AssistantMessageEvent, Model, ToolCall, ToolResultMessage, Usage } from "@earendil-works/pi-ai";
import { CLAUDE_MODEL } from "../../core/contracts/claude.ts";
import { newCompactionMarker } from "../../core/compaction.ts";
import type { LhMessage } from "../../core/native-messages.ts";
import { CONTINUE_TEXT, owedMessages, sdkInputBlocks, sessionResume, type ChatSession, type SdkInputBlock, type SessionTurnEnd } from "../../core/sdk-session.ts";
import { CLAUDE_ABORTED, CLAUDE_API_KEY_REFUSAL, CLAUDE_MODEL_MISSING, CLAUDE_TOOLS_MISSING, NO_KEY, claudeErrorMessage, type ClaudeRateLimit } from "../claude-errors.ts";
import { recordClaudeModelMissing, recordClaudeRateLimit } from "../claude-usage.ts";
import { AssistantStream } from "./assistant-stream.ts";
import { SDK_TOOL_PREFIX, SDK_TOOL_SERVER, type SdkEngine, type SdkLaunch, type SdkQuery } from "./engine.ts";
import { keepSession, restoreSession, type SessionStore } from "./session-files.ts";
import { sdkToolServer } from "./tool-server.ts";

/** Shown when a lesson's model memory is gone: its session was deleted from
 *  Claude Code and from the app's copy, or the lesson predates sessions. */
export const SESSION_GONE = `This lesson's conversation with Claude is no longer stored, so it cannot continue. Pick the topic up again from its topic page: the new lesson carries this one's plan and tasks.${NO_KEY}`;

export interface SdkAgentConfig {
	engine: SdkEngine;
	systemPrompt: string;
	tools: AgentTool<any>[];
	/** The record the turn runs on (the record is what every page reads). */
	messages: AgentMessage[];
	/** A clean call of this tool ends the turn, once every such call in the
	 *  same reply resolved cleanly (a failed one is retried within the turn). */
	endsTurn: (toolName: string) => boolean;
	/** The record's map to its Claude Code session; absent on a new lesson. */
	session?: ChatSession;
	/** Where the app keeps its copy of the session; absent: no copy. */
	sessionStore?: SessionStore;
	/** Claude Code's own web search joins the app's tools. */
	webSearch?: boolean;
	/** A background job: no session file, at most this many model calls. */
	ephemeral?: { maxTurns: number };
	onUsage?: (usage: Usage) => void;
}

type Listener = (event: AgentEvent) => void;

/** A Claude Code that sends nothing for this long is stopped: background
 *  jobs have no one to press Stop. */
const IDLE_MS = 10 * 60_000;

interface Steer { message: AgentMessage; uuid: string }

const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

function userMessage(blocks: SdkInputBlock[], uuid: string, priority?: "next"): SDKUserMessage {
	return { type: "user", message: { role: "user", content: blocks as never }, parent_tool_use_id: null, uuid: uuid as SDKUserMessage["uuid"], ...(priority ? { priority } : {}) };
}

/**
 * One lesson turn on the Agent SDK: one `query()` that resumes the lesson's
 * Claude Code session, owes it the record's new inputs as one user message,
 * runs the app's tools in-process, and ends when the model ends its turn or a
 * turn-ending tool resolves. It speaks the app's turn protocol: the same
 * agent events, messages and `state.messages` the turn runner, the views and
 * the record already read. Steered messages ride the running turn and join
 * the record only once Claude Code reports reading them.
 */
export class SdkAgent {
	readonly state: { messages: AgentMessage[]; model: Model<Api>; systemPrompt: string; tools: AgentTool<any>[] };
	private readonly listeners = new Set<Listener>();
	private readonly queued: Steer[] = [];
	private readonly inFlight = new Map<string, Steer>();
	private readonly controller = new AbortController();
	private push: ((message: SDKUserMessage) => void) | undefined;
	private closeInput: (() => void) | undefined;
	private query: SdkQuery | undefined;
	private aborted = false;
	private end: SessionTurnEnd | undefined;

	constructor(private readonly config: SdkAgentConfig) {
		this.state = { messages: [...config.messages], model: config.engine.model, systemPrompt: config.systemPrompt, tools: config.tools };
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** A message for the running turn's next step; before the turn starts it
	 *  joins the turn's input. */
	steer(message: AgentMessage): void {
		const steer = { message, uuid: randomUUID() };
		if (!this.push) { this.queued.push(steer); return; }
		this.inFlight.set(steer.uuid, steer);
		this.push(userMessage(sdkInputBlocks([message as LhMessage]), steer.uuid, "next"));
	}

	abort(): void {
		if (this.aborted) return;
		this.aborted = true;
		if (this.query) void this.query.interrupt().catch(() => this.controller.abort());
		else this.controller.abort();
	}

	/** How the turn left the session, for the record's map; undefined when
	 *  no session was reached. */
	sessionEnd(): SessionTurnEnd | undefined {
		return this.end;
	}

	private emit(event: AgentEvent): void {
		for (const listener of this.listeners) listener(event);
	}

	private append(message: AgentMessage): void {
		this.state.messages.push(message);
		this.emit({ type: "message_start", message });
		this.emit({ type: "message_end", message });
	}

	async continue(): Promise<void> {
		this.emit({ type: "agent_start" });
		try { await this.run(); }
		finally { this.emit({ type: "agent_end", messages: this.state.messages }); }
	}

	private fail(text: string, reason: "error" | "aborted" = "error", stream?: AssistantStream): void {
		const failing = stream && !stream.finished ? stream : new AssistantStream(this.state.model);
		const fresh = failing !== stream;
		const events = failing.fail(text, reason);
		if (fresh) this.emit({ type: "message_start", message: failing.message });
		for (const event of events) if (event.type !== "start" && event.type !== "error") this.emit({ type: "message_update", message: failing.message, assistantMessageEvent: event });
		this.state.messages.push(failing.message);
		this.emit({ type: "message_end", message: failing.message });
	}

	private async run(): Promise<void> {
		const { engine, session, sessionStore } = this.config;
		let launch: SdkLaunch;
		if (this.aborted) return this.fail(CLAUDE_ABORTED, "aborted");
		try { launch = engine.launch(); } catch (error) { return this.fail((error as Error).message); }
		const owed = owedMessages(this.state.messages as LhMessage[], session);
		if (owed === null) return this.fail(SESSION_GONE);
		const resume = sessionResume(session);
		if (resume.resume && !restoreSession(sessionStore, launch.configDir, resume.resume)) return this.fail(SESSION_GONE);
		for (const steer of this.queued.splice(0)) this.append(steer.message);
		const queuedSteers = this.state.messages.slice(this.config.messages.length) as LhMessage[];
		const blocks = sdkInputBlocks([...owed, ...queuedSteers]);
		const prompt = userMessage(blocks.length ? blocks : [{ type: "text", text: CONTINUE_TEXT }], randomUUID());

		const calls = new Map<string, { call: ToolCall; assistant: AssistantMessage }>();
		let endedByTool = false;
		const appTools = new Set(this.config.tools.map((tool) => tool.name));
		const outcomes = new Map<string, AgentToolCallOutcome>();
		const context = (): AgentContext => ({ messages: this.state.messages, tools: this.config.tools });
		const server = sdkToolServer(this.config.tools, {
			callFor: (id) => calls.get(id),
			context,
			signal: this.controller.signal,
			onStart: (call) => afterReply(() => this.emit({ type: "tool_execution_start", toolCallId: call.id, toolName: call.name, args: call.arguments })),
			onUpdate: (call, partial) => afterReply(() => this.emit({ type: "tool_execution_update", toolCallId: call.id, toolName: call.name, args: call.arguments, partialResult: partial })),
			onEnd: (outcome) => {
				outcomes.set(outcome.toolCall.id, outcome);
				afterReply(() => this.emit({ type: "tool_execution_end", toolCallId: outcome.toolCall.id, toolName: outcome.toolCall.name, result: outcome.result, isError: outcome.isError, ...(outcome.durationMs === undefined ? {} : { durationMs: outcome.durationMs }) }));
			},
			endsTurn: (call, outcome) => {
				if (outcome.isError || !(outcome.result.terminate === true || this.config.endsTurn(call.name))) return false;
				const siblings = calls.get(call.id)?.assistant.content.filter((b): b is ToolCall => b.type === "toolCall" && b.id !== call.id && this.config.endsTurn(b.name)) ?? [];
				const ends = siblings.every((b) => outcomes.get(b.id)?.isError === false);
				if (ends) endedByTool = true;
				return ends;
			},
		});

		let closed = false;
		const pending: SDKUserMessage[] = [prompt];
		let wake: (() => void) | undefined;
		this.push = (message) => { pending.push(message); wake?.(); };
		this.closeInput = () => { closed = true; wake?.(); };
		const input = async function* (): AsyncGenerator<SDKUserMessage> {
			while (true) {
				while (pending.length) yield pending.shift()!;
				if (closed) return;
				await new Promise<void>((resolve) => (wake = resolve));
				wake = undefined;
			}
		};

		const webSearch = this.config.webSearch === true;
		const options: Options = {
			...launch.options,
			systemPrompt: { type: "custom", prompt: this.config.systemPrompt, snapshot: false },
			tools: webSearch ? ["WebSearch"] : [],
			allowedTools: [`mcp__${SDK_TOOL_SERVER}`, ...(webSearch ? ["WebSearch"] : [])],
			mcpServers: { [SDK_TOOL_SERVER]: server },
			abortController: this.controller,
			...(this.config.ephemeral ? { persistSession: false, maxTurns: this.config.ephemeral.maxTurns } : {}),
			...(resume.resume ? { resume: resume.resume } : {}),
			...(resume.at ? { resumeSessionAt: resume.at } : {}),
		};

		let sessionId = resume.resume;
		let anchor = resume.at ?? session?.anchor;
		let keptAnchor = anchor;
		let heldThrough: string | undefined;
		let stream: AssistantStream | undefined;
		let rateLimit: ClaudeRateLimit | undefined;
		let errorCode: string | undefined;
		let errorStatus: number | undefined;
		let compaction: { tokensBefore: number } | undefined;
		let outcome = "failed" as "success" | "failed";
		const provider = this.state.model.provider;

		// Claude Code starts a tool as soon as its call has streamed, before
		// the reply ends: its events and result wait for the reply's end, so
		// the record and every view read the reply before what it called.
		const held: (() => void)[] = [];
		const afterReply = (fn: () => void) => { if (stream && !stream.finished) held.push(fn); else fn(); };
		const endStream = (events: AssistantMessageEvent[]) => {
			if (!stream) return;
			for (const event of events) {
				if (event.type === "start") this.emit({ type: "message_start", message: stream.message });
				else if (event.type === "done" || event.type === "error") {
					this.state.messages.push(stream.message);
					this.emit({ type: "message_end", message: stream.message });
					if (event.type === "done") {
						this.config.onUsage?.(stream.message.usage);
						// Claude Code's own tools (WebSearch) run outside the tool server.
						for (const block of stream.message.content) if (block.type === "toolCall" && !appTools.has(block.name)) this.emit({ type: "tool_execution_start", toolCallId: block.id, toolName: block.name, args: block.arguments });
					}
					for (const fn of held.splice(0)) fn();
				} else {
					if (event.type === "toolcall_end") calls.set(event.toolCall.id, { call: event.toolCall, assistant: stream.message });
					this.emit({ type: "message_update", message: stream.message, assistantMessageEvent: event });
				}
			}
		};
		const resultMessage = (toolUseId: string, block: Record<string, unknown>): ToolResultMessage => {
			const done = outcomes.get(toolUseId);
			if (done) return {
				role: "toolResult", toolCallId: toolUseId, toolName: done.toolCall.name, content: done.result.content ?? [], details: done.result.details,
				isError: done.isError, ...(done.durationMs === undefined ? {} : { durationMs: done.durationMs }), timestamp: Date.now(),
			};
			const name = calls.get(toolUseId)?.call.name ?? "unknown";
			const text = typeof block.content === "string" ? block.content : Array.isArray(block.content) ? block.content.map((part) => record(part)?.text).filter((t): t is string => typeof t === "string").join("\n") : "";
			return { role: "toolResult", toolCallId: toolUseId, toolName: name.startsWith(SDK_TOOL_PREFIX) ? name.slice(SDK_TOOL_PREFIX.length) : name, content: [{ type: "text", text }], details: {}, isError: block.is_error === true, timestamp: Date.now() };
		};

		const handle = (message: SDKMessage): boolean => {
			const uuid = (message as { uuid?: string }).uuid;
			switch (message.type) {
				case "system": {
					if (message.subtype === "init") {
						sessionId = message.session_id;
						if (message.apiKeySource !== "none") { this.fail(CLAUDE_API_KEY_REFUSAL); return false; }
						if (!message.mcp_servers.some((s) => s.name === SDK_TOOL_SERVER && s.status === "connected")) { this.fail(CLAUDE_TOOLS_MISSING); return false; }
					} else if (message.subtype === "compact_boundary") {
						compaction = { tokensBefore: message.compact_metadata.pre_tokens };
						anchor = uuid ?? anchor;
					}
					return true;
				}
				case "rate_limit_event": {
					const info = record((message as { rate_limit_info?: unknown }).rate_limit_info);
					if (info) recordClaudeRateLimit(provider, info);
					if (info?.status === "rejected") rateLimit = { resetsAt: typeof info.resetsAt === "number" ? info.resetsAt : undefined, rateLimitType: typeof info.rateLimitType === "string" ? info.rateLimitType : undefined };
					return true;
				}
				case "stream_event": {
					if (message.parent_tool_use_id) return true;
					const event = record(message.event);
					if (event?.type === "message_start") stream = new AssistantStream(this.state.model);
					if (stream) endStream(stream.feed(event));
					return true;
				}
				case "assistant": {
					if (message.parent_tool_use_id) return true;
					if (typeof message.error === "string") errorCode = message.error;
					const status = (message as { api_error_status?: unknown }).api_error_status;
					if (typeof status === "number") errorStatus = status;
					if (uuid) anchor = uuid;
					return true;
				}
				case "user": {
					if (message.parent_tool_use_id) return true;
					if (uuid) anchor = uuid;
					if ((message as { isReplay?: boolean }).isReplay) {
						const steer = uuid ? this.inFlight.get(uuid) : undefined;
						if (steer) { this.inFlight.delete(uuid!); this.append(steer.message); }
						return true;
					}
					if ((message as { isSynthetic?: boolean }).isSynthetic && compaction) {
						const text = typeof message.message.content === "string" ? message.message.content : "";
						this.append(newCompactionMarker(compactSummary(text), { firstKeptMessageId: "", tokensBefore: compaction.tokensBefore, model: `${provider}:${CLAUDE_MODEL.id}`, at: new Date().toISOString() }) as AgentMessage);
						compaction = undefined;
						return true;
					}
					const content = message.message.content;
					if (!Array.isArray(content)) return true;
					for (const block of content) {
						const b = record(block);
						if (b?.type !== "tool_result" || typeof b.tool_use_id !== "string") continue;
						const id = b.tool_use_id;
						afterReply(() => {
							const result = resultMessage(id, b);
							if (!appTools.has(result.toolName)) this.emit({ type: "tool_execution_end", toolCallId: result.toolCallId, toolName: result.toolName, result: { content: result.content, details: {} }, isError: result.isError });
							this.append(result);
						});
						heldThrough = b.tool_use_id;
						keptAnchor = anchor;
					}
					return true;
				}
				case "result": {
					if ((!message.is_error && message.subtype === "success") || (this.config.ephemeral && message.subtype === "error_max_turns")) {
						outcome = "success";
						// A steer Claude Code has not read yet: it reads it next, so the
						// run goes on with it. A turn a question ended waits for the
						// learner instead, and the steer goes back to its queue.
						if (!endedByTool && this.inFlight.size > 0 && !this.aborted) return true;
						if (stream && !stream.finished) endStream(stream.fail(`Claude Code ended the reply midway. Retry.${NO_KEY}`));
						recordClaudeModelMissing(provider, false);
						return false;
					}
					const text = "errors" in message && Array.isArray(message.errors) ? message.errors.join("\n") : "";
					if (this.aborted) this.fail(CLAUDE_ABORTED, "aborted", stream);
					else if (/No conversation found with session ID/.test(text)) this.fail(SESSION_GONE, "error", stream);
					else {
						const failure = claudeErrorMessage({ rateLimit, status: errorStatus, code: errorCode, text });
						if (failure === CLAUDE_MODEL_MISSING) recordClaudeModelMissing(provider, true);
						this.fail(failure, "error", stream);
					}
					return false;
				}
				default:
					return true;
			}
		};

		const query = engine.query({ prompt: input(), options });
		this.query = query;
		const failedBefore = this.state.messages.length;
		let idle: ReturnType<typeof setTimeout> | undefined;
		let silent = false;
		const watch = () => {
			clearTimeout(idle);
			idle = setTimeout(() => { silent = true; this.controller.abort(); }, IDLE_MS);
			idle.unref?.();
		};
		try {
			watch();
			for await (const message of query) {
				watch();
				if (!handle(message)) break;
			}
			if (silent) this.fail(`Claude Code sent nothing for ${IDLE_MS / 60_000} minutes, so the request was stopped.${NO_KEY}`, "error", stream);
			if (outcome !== "success" && this.state.messages.length === failedBefore) this.fail(this.aborted ? CLAUDE_ABORTED : `Claude Code ended before finishing the reply.${NO_KEY}`, this.aborted ? "aborted" : "error", stream);
		} catch (error) {
			if (this.state.messages.at(-1) === stream?.message && stream?.finished) { /* already reported */ }
			else this.fail(this.aborted ? CLAUDE_ABORTED : claudeErrorMessage({ rateLimit, status: errorStatus, code: errorCode, text: (error as Error).message }), this.aborted ? "aborted" : "error", stream);
		} finally {
			clearTimeout(idle);
			for (const fn of held.splice(0)) fn();
			this.closeInput?.();
			this.push = undefined;
			this.query = undefined;
			query.close();
		}
		if (!sessionId) return;
		this.end = outcome === "success"
			? { id: sessionId, anchor, held: "all" }
			: { id: sessionId, anchor: keptAnchor, held: heldThrough ? { through: heldThrough } : "none" };
		if (sessionStore) {
			try { keepSession(sessionStore, launch.configDir, sessionId); } catch (error) { console.error("[sdk] session copy failed:", error); }
		}
	}
}

/** The summary Claude Code writes when it compacts, without its framing. */
export function compactSummary(text: string): string {
	const start = text.indexOf("Summary:");
	const body = start >= 0 ? text.slice(start + "Summary:".length) : text;
	const tail = body.search(/\n(If you need specific details from before compaction|Continue the conversation from where it left off)/);
	return (tail >= 0 ? body.slice(0, tail) : body).trim();
}
