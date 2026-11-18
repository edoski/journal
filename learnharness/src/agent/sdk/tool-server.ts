import { randomUUID } from "node:crypto";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { runToolCall, type AgentContext, type AgentTool, type AgentToolCallOutcome, type AgentToolResult } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolCall } from "@earendil-works/pi-ai";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SDK_TOOL_SERVER } from "./engine.ts";

/** What a run needs from the tool server: the streamed call a tool_use id
 *  names (it carries the assistant message pi's tool contract takes), and
 *  where each call's start, progress and outcome go. */
export interface ToolRunHooks {
	callFor(toolUseId: string): { call: ToolCall; assistant: AssistantMessage } | undefined;
	context(): AgentContext;
	signal: AbortSignal;
	onStart(call: ToolCall): void;
	onUpdate(call: ToolCall, partial: AgentToolResult<unknown>): void;
	onEnd(outcome: AgentToolCallOutcome): void;
	/** Whether this finished call ends the turn (a question, a problem pose,
	 *  a mode handoff): the learner or the next agent answers. Asked right
	 *  after onEnd, so siblings that finished earlier are already known. */
	endsTurn(call: ToolCall, outcome: AgentToolCallOutcome): boolean;
}

/** Claude Code names the tool_use a call answers here. */
const TOOL_USE_ID = "claudecode/toolUseId";

/**
 * The app's tools as one in-process MCP server. Each call runs through pi's
 * tool contract (`runToolCall`: argument heal, schema check, execute,
 * progress), so a tool behaves exactly as it does anywhere in the app. The
 * schemas are served as the JSON Schema TypeBox already is, and every tool
 * is always loaded, never deferred behind tool search. A call that ends the
 * turn returns `claude/endTurn`: Claude Code finishes the batch and makes no
 * further model call. `tools` are the schemas Claude Code is given; each
 * call runs on the turn `bound` names, which a process started before its
 * turn waits for (prestart.ts): the same tools, built for that turn.
 */
export function sdkToolServer(tools: readonly AgentTool<any>[], bound: () => Promise<{ tools: readonly AgentTool<any>[]; hooks: ToolRunHooks }>): McpSdkServerConfigWithInstance {
	const server = new Server({ name: SDK_TOOL_SERVER, version: "1" }, { capabilities: { tools: {} } });
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters as { type: "object" }, _meta: { "anthropic/alwaysLoad": true } })),
	}));
	server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
		const { tools, hooks } = await bound();
		const meta = request.params._meta as Record<string, unknown> | undefined;
		const toolUseId = typeof meta?.[TOOL_USE_ID] === "string" ? meta[TOOL_USE_ID] as string : `call_${randomUUID()}`;
		const streamed = hooks.callFor(toolUseId);
		const call: ToolCall = { type: "toolCall", id: toolUseId, name: request.params.name, arguments: (request.params.arguments ?? {}) as ToolCall["arguments"] };
		const assistant = streamed?.assistant ?? ({ role: "assistant", content: [call] } as unknown as AssistantMessage);
		hooks.onStart(call);
		const outcome = await runToolCall(call, {
			tools,
			assistantMessage: assistant,
			context: hooks.context(),
			signal: hooks.signal,
			onUpdate: (partial) => hooks.onUpdate(call, partial),
		});
		hooks.onEnd(outcome);
		const endTurn = hooks.endsTurn(call, outcome);
		return {
			content: outcome.result.content.map((part) => part.type === "text" ? { type: "text" as const, text: part.text } : { type: "image" as const, data: part.data, mimeType: part.mimeType }),
			...(outcome.isError ? { isError: true } : {}),
			...(endTurn ? { _meta: { "claude/endTurn": true } } : {}),
		};
	});
	return { type: "sdk", name: SDK_TOOL_SERVER, instance: server as unknown as McpSdkServerConfigWithInstance["instance"] };
}
