import { test } from "node:test";
import assert from "node:assert/strict";
import type { AssistantMessage, AssistantMessageEvent, Message, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import {
	CLAUDE_API_KEY_REFUSAL,
	CLAUDE_TRANSCRIPT_INTRO,
	ClaudeStreamMapper,
	claudeEffort,
	claudeResetTime,
	claudeSubscriptionModel,
	claudeSubscriptionModels,
	claudeTranscriptBlocks,
	claudeTurnError,
} from "../src/agent/claude-stream.ts";
import { CLAUDE_MODEL_IDS } from "../src/core/contracts/claude.ts";
import { subscriptionLabel } from "../src/core/prices.ts";

const model = claudeSubscriptionModel("claude-sonnet-5-5")!;
const NO_KEY = "No API key was used.";

const init = { type: "system", subtype: "init", apiKeySource: "none", model: "claude-sonnet-5-5", tools: ["mcp__lh__plan_init", "mcp__lh__quiz"] };
const se = (event: unknown) => ({ type: "stream_event", event, parent_tool_use_id: null });
const messageStart = se({ type: "message_start", message: { id: "msg_1", model: "claude-sonnet-5-5", usage: { input_tokens: 12, cache_read_input_tokens: 9000, cache_creation_input_tokens: 300, output_tokens: 1 } } });

function run(lines: unknown[]): { events: AssistantMessageEvent[]; mapper: ClaudeStreamMapper; fedAfterFinish: number } {
	const mapper = new ClaudeStreamMapper(model, 1);
	const events: AssistantMessageEvent[] = [];
	let fedAfterFinish = 0;
	for (const line of lines) {
		if (mapper.finished) fedAfterFinish++;
		events.push(...mapper.feed(line));
	}
	return { events, mapper, fedAfterFinish };
}
const terminal = (events: AssistantMessageEvent[]) => events.at(-1)!;

test("text plus two tool calls in one message map to pi events and stop at tool_use", () => {
	const { events, mapper } = run([
		init,
		messageStart,
		se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
		se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Let's plan " } }),
		se({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "this." } }),
		se({ type: "content_block_stop", index: 0 }),
		{ type: "assistant", message: { content: [{ type: "text", text: "Let's plan this." }] } },
		se({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_a", name: "mcp__lh__plan_init", input: {} } }),
		se({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"nodes\":[\"a\"," } }),
		se({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "\"b\"]}" } }),
		se({ type: "content_block_stop", index: 1 }),
		se({ type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_b", name: "mcp__lh__quiz", input: {} } }),
		se({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{\"question\":\"Q?\"}" } }),
		se({ type: "content_block_stop", index: 2 }),
		se({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 87 } }),
		se({ type: "message_stop" }),
		{ type: "result", subtype: "success", is_error: false, result: "" },
	]);
	assert.deepEqual(events.map((e) => e.type), [
		"start", "text_start", "text_delta", "text_delta", "text_end",
		"toolcall_start", "toolcall_delta", "toolcall_delta", "toolcall_end",
		"toolcall_start", "toolcall_delta", "toolcall_end", "done",
	]);
	const done = terminal(events);
	assert(done.type === "done");
	assert.equal(done.reason, "toolUse");
	assert(mapper.finished, "the caller kills the child once finished");
	assert.deepEqual(done.message.content, [
		{ type: "text", text: "Let's plan this." },
		{ type: "toolCall", id: "toolu_a", name: "plan_init", arguments: { nodes: ["a", "b"] } },
		{ type: "toolCall", id: "toolu_b", name: "quiz", arguments: { question: "Q?" } },
	]);
	assert.deepEqual(done.message.usage, { input: 12, output: 87, cacheRead: 9000, cacheWrite: 300, totalTokens: 12 + 87 + 9000 + 300, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
	assert.equal(done.message.provider, "claude-subscription");
	assert.equal(done.message.responseId, "msg_1");
});

test("thinking streams as thinking and an end_turn finishes with stop", () => {
	const { events } = run([
		init, messageStart,
		se({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
		se({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Consider the learner." } }),
		se({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } }),
		se({ type: "content_block_stop", index: 0 }),
		se({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
		se({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello." } }),
		se({ type: "content_block_stop", index: 1 }),
		se({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } }),
		se({ type: "message_stop" }),
	]);
	assert.deepEqual(events.map((e) => e.type), ["start", "thinking_start", "thinking_delta", "thinking_end", "text_start", "text_delta", "text_end", "done"]);
	const done = terminal(events);
	assert(done.type === "done");
	assert.equal(done.reason, "stop");
	assert.deepEqual(done.message.content[0], { type: "thinking", thinking: "Consider the learner.", thinkingSignature: "sig" });
});

test("max_tokens finishes with length", () => {
	const { events } = run([init, messageStart, se({ type: "message_delta", delta: { stop_reason: "max_tokens" } }), se({ type: "message_stop" })]);
	const done = terminal(events);
	assert(done.type === "done" && done.reason === "length");
});

test("an error result fails the turn with curated text; synthetic assistant text is never model output", () => {
	const { events } = run([
		init,
		{ type: "assistant", message: { model: "<synthetic>", content: [{ type: "text", text: "API Error: 500 internal" }] }, error: "server_error" },
		{ type: "result", subtype: "success", is_error: true, api_error_status: 500, result: "API Error: 500 internal" },
	]);
	assert.equal(events.length, 1);
	const error = terminal(events);
	assert(error.type === "error");
	assert.equal(error.reason, "error");
	assert.deepEqual(error.error.content, []);
	assert.match(error.error.errorMessage!, /Claude request failed/);
	assert(error.error.errorMessage!.endsWith(NO_KEY));
	assert(!error.error.errorMessage!.includes("500 internal"), "raw provider text stays out");
});

test("a rejected rate-limit event makes the failure say the plan limit and when it resets", () => {
	const resetsAt = 1_800_000_000;
	const { events } = run([
		init,
		{ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt, rateLimitType: "five_hour" } },
		{ type: "assistant", message: { model: "<synthetic>", content: [{ type: "text", text: "You've hit your limit" }] }, error: "rate_limit" },
		{ type: "result", subtype: "success", is_error: true, api_error_status: 429, result: "You've hit your limit" },
	]);
	const error = terminal(events);
	assert(error.type === "error");
	assert.match(error.error.errorMessage!, /usage limit is reached/);
	assert(error.error.errorMessage!.includes(claudeResetTime(resetsAt)));
	assert(error.error.errorMessage!.includes("https://claude.ai/settings/usage"));
	assert(error.error.errorMessage!.endsWith(NO_KEY));
});

test("signed-out and unknown-model failures get their own guidance", () => {
	const signedOut = terminal(run([init, { type: "assistant", message: { content: [] }, error: "authentication_failed" }, { type: "result", is_error: true, result: "Not logged in · Please run /login" }]).events);
	assert(signedOut.type === "error");
	assert.match(signedOut.error.errorMessage!, /not signed in.*run `claude`/i);
	const model404 = terminal(run([init, { type: "result", is_error: true, api_error_status: 404, result: "There's an issue with the selected model" }]).events);
	assert(model404.type === "error");
	assert.match(model404.error.errorMessage!, /model is not available/);
});

test("an init that reports an API key source fails at once, before any model output", () => {
	const { events, mapper, fedAfterFinish } = run([
		{ ...init, apiKeySource: "ANTHROPIC_API_KEY" },
		messageStart,
		se({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
	]);
	assert(mapper.finished);
	assert.equal(fedAfterFinish, 2);
	assert.equal(events.length, 1);
	const error = terminal(events);
	assert(error.type === "error");
	assert.equal(error.error.errorMessage, CLAUDE_API_KEY_REFUSAL);
	const missing = terminal(run([{ type: "system", subtype: "init" }]).events);
	assert(missing.type === "error" && missing.error.errorMessage === CLAUDE_API_KEY_REFUSAL, "an absent source is not proof of plan billing");
});

test("a child that exits without a result fails with a stderr tail; abort reports aborted", () => {
	const mapper = new ClaudeStreamMapper(model);
	mapper.feed(init);
	const [exit] = mapper.exit(1, null, "boom: something broke\n");
	assert(exit?.type === "error");
	assert.match(exit.error.errorMessage!, /exited with code 1 before finishing the reply\. boom: something broke/);
	const aborted = new ClaudeStreamMapper(model).abort()[0];
	assert(aborted?.type === "error" && aborted.reason === "aborted");
});

test("subagent stream events and malformed tool JSON are handled without inventing output", () => {
	const { events } = run([
		init, messageStart,
		{ type: "stream_event", parent_tool_use_id: "toolu_x", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
		se({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_c", name: "mcp__lh__quiz", input: {} } }),
		se({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"question\":" } }),
		se({ type: "content_block_stop", index: 0 }),
		se({ type: "message_delta", delta: { stop_reason: "tool_use" } }),
	]);
	const done = terminal(events);
	assert(done.type === "done");
	const call = done.message.content[0];
	assert(call?.type === "toolCall");
	assert.deepEqual(call.arguments, {});
	assert.match(call.argumentsError!, /not a valid JSON object/);
});

test("loop-level failures keep curated Claude text and mask everything else", () => {
	assert.equal(claudeTurnError(CLAUDE_API_KEY_REFUSAL), CLAUDE_API_KEY_REFUSAL);
	assert.match(claudeTurnError("TypeError: x is undefined"), /^Claude request failed/);
});

test("plan models clone pi's Anthropic entries with zero cost and keep the thinking map", () => {
	const models = claudeSubscriptionModels();
	assert.deepEqual(models.map((m) => m.id), [...CLAUDE_MODEL_IDS]);
	for (const m of models) {
		assert.equal(m.provider, "claude-subscription");
		assert.deepEqual(m.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
		assert(m.thinkingLevelMap, `${m.id} keeps its thinking map`);
	}
	assert.equal(claudeSubscriptionModel("claude-opus-4-1"), undefined, "only the verified ids are offered");
	assert.equal(subscriptionLabel("claude-subscription:claude-opus-5-5"), "Claude");
});

test("effort follows the model's thinking map and is omitted when the map has no value", () => {
	assert.equal(claudeEffort(model, "high"), "high");
	assert.equal(claudeEffort(model, "xhigh"), "xhigh");
	assert.equal(claudeEffort(model, "minimal"), undefined);
	assert.equal(claudeEffort(model, undefined), undefined);
	const fable = claudeSubscriptionModel("claude-fable-5-1")!;
	assert.equal(claudeEffort(fable, "max"), "max");
	assert.equal(claudeEffort(fable, "low"), undefined);
});

const user = (content: UserMessage["content"]): UserMessage => ({ role: "user", content, timestamp: 0 });
const assistant = (content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "toolUse"): AssistantMessage => ({
	role: "assistant", content, stopReason, api: model.api, provider: model.provider, model: model.id, timestamp: 0,
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
});
const toolResult = (content: ToolResultMessage["content"], isError = false): ToolResultMessage => ({ role: "toolResult", toolCallId: "toolu_a", toolName: "plan_init", content, isError, timestamp: 0 });

test("transcript blocks lead with the intro, skip system messages and thinking, and keep images in place", () => {
	const blocks = claudeTranscriptBlocks([
		{ role: "system", content: "You are a tutor.", timestamp: 0 },
		user([{ type: "text", text: "Teach me hash tables." }, { type: "image", data: "AAAA", mimeType: "image/png" }]),
		assistant([{ type: "thinking", thinking: "private" }, { type: "text", text: "Sure." }, { type: "toolCall", id: "toolu_a", name: "plan_init", arguments: { nodes: ["a"] } }]),
		toolResult([{ type: "text", text: "Plan created" }, { type: "image", data: "BBBB", mimeType: "image/jpeg" }]),
	]);
	assert.deepEqual(blocks, [
		{ type: "text", text: CLAUDE_TRANSCRIPT_INTRO },
		{ type: "text", text: "<user>\nTeach me hash tables.\n</user>" },
		{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
		{ type: "text", text: "<you_said>\nSure.\n</you_said>" },
		{ type: "text", text: "<you_called tool=\"plan_init\" id=\"toolu_a\">\n{\"nodes\":[\"a\"]}\n</you_called>" },
		{ type: "text", text: "<tool_result tool=\"plan_init\" id=\"toolu_a\">\nPlan created\n</tool_result>" },
		{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "BBBB" } },
	]);
	assert(!JSON.stringify(blocks).includes("private"));
	assert(!JSON.stringify(blocks).includes("You are a tutor."));
});

test("errored tool results are marked and errored or aborted assistant turns are not replayed", () => {
	const blocks = claudeTranscriptBlocks([
		user("Hi"),
		assistant([{ type: "text", text: "half a reply" }], "error"),
		assistant([{ type: "text", text: "cut off" }], "aborted"),
		toolResult([{ type: "text", text: "bad args" }], true),
	]);
	assert.deepEqual(blocks.slice(1), [
		{ type: "text", text: "<user>\nHi\n</user>" },
		{ type: "text", text: "<tool_result tool=\"plan_init\" id=\"toolu_a\" error=\"true\">\nbad args\n</tool_result>" },
	]);
});

test("a grown transcript's blocks strictly extend the previous call's, so the prompt cache can hit", () => {
	const history: Message[] = [{ role: "system", content: "prompt", timestamp: 0 }, user("Teach me hash tables.")];
	const steps: Message[] = [
		assistant([{ type: "text", text: "Planning." }, { type: "toolCall", id: "toolu_a", name: "plan_init", arguments: { nodes: ["a"] } }]),
		toolResult([{ type: "text", text: "Plan created" }]),
		assistant([{ type: "text", text: "half" }], "error"),
		user([{ type: "text", text: "go on" }, { type: "image", data: "CCCC", mimeType: "image/png" }]),
		{ role: "system", content: "more instructions", timestamp: 0 },
		assistant([{ type: "text", text: "Done." }], "stop"),
	];
	let previous = claudeTranscriptBlocks(history);
	for (const step of steps) {
		history.push(step);
		const next = claudeTranscriptBlocks(history);
		assert.deepEqual(next.slice(0, previous.length), previous, "earlier blocks are unchanged");
		assert(next.length >= previous.length);
		assert.deepEqual(claudeTranscriptBlocks(history), next, "deterministic");
		previous = next;
	}
});
