/**
 * A fake of the Agent SDK's `query()` for tests: the seam the app's engine
 * crosses. It keeps each session's model-facing history in memory (and a
 * stand-in session file where Claude Code keeps one), asks a scripted pi
 * stream function for each model request, streams the reply as the SDK's
 * raw `stream_event`s, and runs tool calls through the app's real in-process
 * tool server over an in-memory MCP link. A tool result carrying
 * `claude/endTurn` ends the turn after its batch, as Claude Code does. A
 * session it never ran but whose file holds Claude Code's transcript format
 * (a seeded one) resumes from that file's turns. Given `compactWhen`, it
 * compacts as Claude Code's automatic compaction does before a request: its
 * PreCompact hooks' `systemMessage`s become the summary's instructions, its
 * PostCompact hooks read the summary, and the stream carries the compact
 * boundary and the summary message.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { fauxAssistantMessage, fauxToolCall, normalizeContext, type Api, type AssistantMessage, type AssistantMessageEvent, type ImageContent, type Message, type Model, type StreamFunction, type TextContent, type Tool, type ToolResultMessage } from "@earendil-works/pi-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { claudeWorkDir } from "../../src/agent/claude-cli.ts";
import type { SdkEngine, SdkPrompt, SdkQuery } from "../../src/agent/sdk/engine.ts";

export interface ScriptedModel { model: Model<Api>; streamFn: StreamFunction<any, any> }

interface Entry { uuid: string; message: Message }

export interface FakeSdk {
	engine: SdkEngine;
	/** Model-facing history per session id. */
	sessions: Map<string, Entry[]>;
	/** Every query's options, in order. */
	calls: Options[];
	configDir: string;
	/** Deletes a session the way Claude Code's 30-day sweep would. */
	forget(id: string): void;
	/** The instructions each compaction was given, in order. */
	compactions: { instructions: string }[];
}

/** Where Claude Code's automatic compaction would fire: before a request
 *  on this history. */
export type CompactWhen = (history: readonly { message: Message }[]) => boolean;

const sessionFile = (configDir: string, id: string) => join(configDir, "projects", realpathSync(claudeWorkDir()).replace(/[^a-zA-Z0-9]/g, "-"), `${id}.jsonl`);

function contentOf(message: SDKUserMessage): (TextContent | ImageContent)[] {
	const content = message.message.content;
	if (typeof content === "string") return [{ type: "text", text: content }];
	return (content as unknown as Record<string, unknown>[]).flatMap((block): (TextContent | ImageContent)[] => {
		if (block.type === "text") return [{ type: "text", text: String(block.text) }];
		if (block.type === "image") {
			const source = block.source as { media_type: string; data: string };
			return [{ type: "image", data: source.data, mimeType: source.media_type }];
		}
		return [];
	});
}

/** A session file in Claude Code's transcript format as model-facing
 *  history: its user and assistant entries along their chain. Undefined
 *  when the file is not such a transcript. */
function transcriptHistory(file: string, toolPrefix: string): Entry[] | undefined {
	const entries = readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>);
	const turns = entries.filter((e) => (e.type === "user" || e.type === "assistant") && e.message);
	if (!turns.length) return undefined;
	const names = new Map<string, string>();
	const unprefixed = (name: string) => name.startsWith(toolPrefix) ? name.slice(toolPrefix.length) : name;
	const parts = (blocks: any[]): (TextContent | ImageContent)[] => blocks.flatMap((b): (TextContent | ImageContent)[] => b.type === "text" ? [{ type: "text", text: b.text }] : b.type === "image" ? [{ type: "image", data: b.source.data, mimeType: b.source.media_type }] : []);
	const history: Entry[] = [];
	for (const e of turns) {
		const content = e.message.content;
		if (e.type === "assistant") {
			const blocks = (content as any[]).map((b) => b.type === "tool_use" ? (names.set(b.id, unprefixed(b.name)), { type: "toolCall" as const, id: b.id, name: unprefixed(b.name), arguments: b.input }) : { type: "text" as const, text: b.text });
			history.push({ uuid: e.uuid, message: { role: "assistant", content: blocks, api: "anthropic-messages", provider: "seed", model: e.message.model, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: blocks.some((b) => b.type === "toolCall") ? "toolUse" : "stop", timestamp: Date.parse(e.timestamp) } as AssistantMessage });
			continue;
		}
		if (typeof content === "string") { history.push({ uuid: e.uuid, message: { role: "user", content: [{ type: "text", text: content }], timestamp: Date.parse(e.timestamp) } }); continue; }
		for (const b of content as any[]) {
			if (b.type !== "tool_result") continue;
			history.push({ uuid: e.uuid, message: { role: "toolResult", toolCallId: b.tool_use_id, toolName: names.get(b.tool_use_id) ?? "unknown", content: parts(b.content ?? []), isError: b.is_error === true, timestamp: Date.parse(e.timestamp) } satisfies ToolResultMessage });
		}
		const rest = parts((content as any[]).filter((b) => b.type !== "tool_result"));
		if (rest.length) history.push({ uuid: e.uuid, message: { role: "user", content: rest, timestamp: Date.parse(e.timestamp) } });
	}
	return history;
}

/** The reply as the raw Anthropic events the SDK forwards. */
function streamEvents(message: AssistantMessage, toolPrefix: string): unknown[] {
	const events: unknown[] = [{ type: "message_start", message: { id: message.responseId ?? `msg_${randomUUID()}`, model: message.model, usage: { input_tokens: message.usage.input, cache_read_input_tokens: message.usage.cacheRead, cache_creation_input_tokens: message.usage.cacheWrite, output_tokens: 0 } } }];
	message.content.forEach((block, index) => {
		if (block.type === "text") {
			events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
		} else if (block.type === "thinking") {
			events.push({ type: "content_block_start", index, content_block: { type: "thinking", thinking: "" } }, { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking } });
		} else if (block.type === "toolCall") {
			events.push({ type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: `${toolPrefix}${block.name}`, input: {} } }, { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.arguments ?? {}) } });
		}
		events.push({ type: "content_block_stop", index });
	});
	const stop = message.stopReason === "toolUse" || message.content.some((b) => b.type === "toolCall") ? "tool_use" : message.stopReason === "length" ? "max_tokens" : "end_turn";
	events.push({ type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: message.usage.output } }, { type: "message_stop" });
	return events;
}

async function finalMessage(stream: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessage> {
	for await (const event of stream) {
		if (event.type === "done") return event.message;
		if (event.type === "error") return event.error;
	}
	throw new Error("the scripted stream ended without a result");
}

/** An engine whose `query()` plays the scripted model. */
export function fakeSdk(scripted: ScriptedModel, { configDir = mkdtempSync(join(tmpdir(), "lh-fake-claude-")), compactWhen }: { configDir?: string; compactWhen?: CompactWhen } = {}): FakeSdk {
	const sessions = new Map<string, Entry[]>();
	const calls: Options[] = [];
	const compactions: { instructions: string }[] = [];

	const query = ({ prompt, options }: { prompt: SdkPrompt; options: Options }): SdkQuery => {
		calls.push(options);
		let interrupted = false;
		const controller = new AbortController();
		options.abortController?.signal.addEventListener("abort", () => { interrupted = true; controller.abort(); }, { once: true });
		const inbox: SDKUserMessage[] = [];
		let inputDone = false;
		let wake: (() => void) | undefined;
		const pump = typeof prompt === "string"
			? (inbox.push({ type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null } as SDKUserMessage), inputDone = true, Promise.resolve())
			: (async () => { for await (const message of prompt) { inbox.push(message); wake?.(); } inputDone = true; wake?.(); })();
		void pump;
		const next = async (): Promise<SDKUserMessage | undefined> => {
			while (!inbox.length && !inputDone) await new Promise<void>((resolve) => (wake = resolve));
			return inbox.shift();
		};

		async function* run(): AsyncGenerator<SDKMessage> {
			const result = (subtype: string, errors?: string[]) => ({ type: "result", subtype, is_error: subtype !== "success", ...(errors ? { errors } : {}), result: "", session_id: id }) as unknown as SDKMessage;
			let id = options.resume ?? randomUUID();
			if (options.resume && !sessions.has(options.resume) && existsSync(sessionFile(configDir, options.resume))) {
				const seeded = transcriptHistory(sessionFile(configDir, options.resume), "mcp__lh__");
				if (seeded) sessions.set(options.resume, seeded);
			}
			if (options.resume && (!sessions.has(options.resume) || !existsSync(sessionFile(configDir, options.resume)))) {
				yield result("error_during_execution", [`No conversation found with session ID: ${options.resume}`]);
				return;
			}
			let history = sessions.get(id) ?? [];
			if (options.resumeSessionAt) {
				const at = history.findIndex((entry) => entry.uuid === options.resumeSessionAt);
				if (at >= 0) history = history.slice(0, at + 1);
			}
			if (options.persistSession === false) id = randomUUID();
			const save = () => {
				sessions.set(id, history);
				if (options.persistSession === false) return;
				const file = sessionFile(configDir, id);
				mkdirSync(join(file, ".."), { recursive: true });
				writeFileSync(file, `${JSON.stringify({ entries: history.length })}\n`);
			};

			const server = (options.mcpServers?.lh as { instance?: { connect(transport: unknown): Promise<void> } } | undefined)?.instance;
			const client = new Client({ name: "fake-claude", version: "1" });
			let tools: Tool[] = [];
			if (server) {
				const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
				await server.connect(serverSide);
				await client.connect(clientSide);
				tools = (await client.listTools()).tools.map((t) => ({ name: t.name, description: t.description ?? "", parameters: t.inputSchema as Tool["parameters"] }));
			}
			yield { type: "system", subtype: "init", session_id: id, apiKeySource: "none", mcp_servers: server ? [{ name: "lh", status: "connected" }] : [], uuid: randomUUID() } as unknown as SDKMessage;

			const takeUser = async (message: SDKUserMessage | undefined) => {
				if (!message) return undefined;
				const uuid = message.uuid ?? randomUUID();
				history.push({ uuid, message: { role: "user", content: contentOf(message), timestamp: Date.now() } });
				return { ...message, uuid, session_id: id, isReplay: true } as unknown as SDKMessage;
			};
			const firstReplay = await takeUser(await next());
			if (firstReplay) yield firstReplay;
			const systemPrompt = typeof options.systemPrompt === "object" && !Array.isArray(options.systemPrompt) && "prompt" in options.systemPrompt ? String(options.systemPrompt.prompt) : typeof options.systemPrompt === "string" ? options.systemPrompt : undefined;
			const maxTurns = options.maxTurns ?? Infinity;
			const hooksOf = (event: "PreCompact" | "PostCompact") => (options.hooks?.[event] ?? []).flatMap((matcher) => matcher.hooks);
			async function* compact(): AsyncGenerator<SDKMessage> {
				const base = { session_id: id, transcript_path: sessionFile(configDir, id), cwd: claudeWorkDir(), trigger: "auto" as const };
				const outputs = await Promise.all(hooksOf("PreCompact").map((hook) => hook({ ...base, hook_event_name: "PreCompact", custom_instructions: null }, undefined, { signal: controller.signal })));
				const instructions = outputs.map((out) => (out as { systemMessage?: string }).systemMessage ?? "").filter(Boolean).join("\n\n");
				compactions.push({ instructions });
				const summary = `SUMMARY #${compactions.length}: the learner maps keys to buckets.`;
				await Promise.all(hooksOf("PostCompact").map((hook) => hook({ ...base, hook_event_name: "PostCompact", compact_summary: `<analysis>\nWhat to keep.\n</analysis>\n\n<summary>\n${summary}\n</summary>` }, undefined, { signal: controller.signal })));
				yield { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 123_000 }, session_id: id, uuid: randomUUID() } as unknown as SDKMessage;
				const uuid = randomUUID();
				const text = `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\n${summary}\n\nIf you need specific details from before compaction, read the full transcript at: ${base.transcript_path}`;
				// Claude Code's automatic compaction sends its summary message as blocks (2.1.319).
				yield { type: "user", isSynthetic: true, message: { role: "user", content: [{ type: "text", text }] }, parent_tool_use_id: null, session_id: id, uuid } as unknown as SDKMessage;
				history = [{ uuid, message: { role: "user", content: [{ type: "text", text }], timestamp: Date.now() } }, ...history.slice(-1)];
			}
			let requests = 0;
			try {
				for (;;) {
					let endTurn = false;
					for (;;) {
						if (requests++ >= maxTurns) { save(); yield result("error_max_turns"); return; }
						if (interrupted) { save(); yield result("error_during_execution", ["interrupted"]); return; }
						if (compactWhen?.(history)) yield* compact();
						const reply = await finalMessage(scripted.streamFn(scripted.model, normalizeContext({ systemPrompt, messages: history.map((e) => e.message), tools }), { signal: controller.signal }) as AsyncIterable<AssistantMessageEvent>);
						if (interrupted || reply.stopReason === "aborted") { save(); yield result("error_during_execution", ["interrupted"]); return; }
						if (reply.stopReason === "error") { save(); yield result("error_during_execution", [reply.errorMessage ?? "error"]); return; }
						for (const event of streamEvents(reply, "mcp__lh__")) yield { type: "stream_event", event, parent_tool_use_id: null, session_id: id, uuid: randomUUID() } as unknown as SDKMessage;
						const replyUuid = randomUUID();
						history.push({ uuid: replyUuid, message: reply });
						yield { type: "assistant", message: { content: [] }, parent_tool_use_id: null, session_id: id, uuid: replyUuid } as unknown as SDKMessage;
						const toolCalls = reply.content.filter((b) => b.type === "toolCall");
						if (toolCalls.length === 0) break;
						for (const call of toolCalls) {
							const out = await client.callTool({ name: call.name, arguments: call.arguments, _meta: { "claudecode/toolUseId": call.id } });
							const content = (out.content as { type: string; text?: string; data?: string; mimeType?: string }[]).map((part) => part.type === "image" ? { type: "image" as const, data: part.data!, mimeType: part.mimeType! } : { type: "text" as const, text: part.text ?? "" });
							const isError = out.isError === true;
							if ((out._meta as Record<string, unknown> | undefined)?.["claude/endTurn"] === true) endTurn = true;
							const resultUuid = randomUUID();
							history.push({ uuid: resultUuid, message: { role: "toolResult", toolCallId: call.id, toolName: call.name, content, isError, timestamp: Date.now() } satisfies ToolResultMessage });
							yield { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, content: content.map((c) => c.type === "text" ? { type: "text", text: c.text } : { type: "image" }), is_error: isError }] }, parent_tool_use_id: null, session_id: id, uuid: resultUuid } as unknown as SDKMessage;
						}
						if (endTurn) break;
						while (inbox.length) yield (await takeUser(inbox.shift()))!;
					}
					save();
					yield result("success");
					// Claude Code reads the next message it is sent as the next turn of the
					// same process, until its input closes.
					if (endTurn) return;
					const more = await next();
					if (!more) return;
					yield (await takeUser(more))!;
				}
			} finally {
				await client.close().catch(() => undefined);
			}
		}

		const iterator = run();
		return {
			[Symbol.asyncIterator]: () => iterator,
			interrupt: async () => { interrupted = true; controller.abort(); },
			close: () => { inputDone = true; wake?.(); void iterator.return(undefined); },
		};
	};

	return {
		engine: { model: scripted.model, query, launch: () => ({ options: {}, configDir }) },
		sessions,
		calls,
		configDir,
		forget: (id) => { sessions.delete(id); },
		compactions,
	};
}

const fakes = new WeakMap<ScriptedModel, FakeSdk>();

/** The fake for a scripted model, made once per model so a lesson's
 *  sessions outlive its turns. */
export function fakeFor(scripted: ScriptedModel): FakeSdk {
	let fake = fakes.get(scripted);
	if (!fake) fakes.set(scripted, (fake = fakeSdk(scripted)));
	return fake;
}

/** The common case: just the engine. */
export function fakeEngine(scripted: ScriptedModel): SdkEngine {
	return fakeFor(scripted).engine;
}

/** A turn's build options on the fake: the handler's record, session map and
 *  session store, with the scripted model as the engine. */
export function onFake(scripted: ScriptedModel, opts: { messages?: unknown[]; session?: unknown; sessionStore?: unknown; compactionInstructions?: unknown }, engine = fakeEngine(scripted)) {
	return { engine, messages: opts.messages, session: opts.session, sessionStore: opts.sessionStore, compactionInstructions: opts.compactionInstructions } as {
		engine: SdkEngine;
		messages: import("@earendil-works/pi-agent-core").AgentMessage[] | undefined;
		session: import("../../src/core/sdk-session.ts").ChatSession | undefined;
		sessionStore: import("../../src/agent/sdk/session-files.ts").SessionStore | undefined;
		compactionInstructions: ((messages: import("../../src/core/native-messages.ts").LhMessage[]) => string) | undefined;
	};
}

/** The tutor's words as production sends them: a send_to_user call. The
 *  model runs once more after its ack, so a script follows it with that
 *  reply (usually `fauxAssistantMessage("")`). */
export function sendToUser(message: string, id?: string): AssistantMessage {
	return fauxAssistantMessage([fauxToolCall("send_to_user", { message }, id ? { id } : undefined)], { stopReason: "toolUse" });
}
