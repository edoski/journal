/**
 * The agent-split question tools (docs/probe-teach-split.md §1):
 *
 *  - teachExplainToolFor — the TEACHER's explain: the commitment check +
 *    the per-session plan-nodeId validation (position signal; a mismatched id
 *    is rejected at the call boundary and returns to the agent to fix).
 *  - createProberTools — the PROBER's recall has NO nodeId field at all,
 *    plus ask + probe_done.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { Value } from "typebox/value";
import {
	askUserQuestionTool,
	createProberTools,
	createTeacherTools,
	probeExplainTool,
	teachExplainToolFor,
	type TeacherToolContext,
} from "../src/agent/tools.ts";
import { TOGGLEABLE_TOOLS } from "../src/core/pending.ts";
import { jobStore } from "../src/store/jobs.ts";
import { explainInputObject } from "../src/core/question-core.ts";
import { chatStore } from "../src/store/chats.ts";
import { PATHS } from "../config.ts";

const createdChats: string[] = [];
after(() => {
	for (const id of createdChats) {
		try {
			fs.unlinkSync(path.join(PATHS.chats, `${id}.json`));
		} catch {
			/* scratch cleanup, best effort */
		}
	}
});

function newChat(title: string): string {
	const chat = chatStore.createChat(title);
	createdChats.push(chat.id);
	return chat.id;
}

const validExplain = {
	type: "check",
	nodeId: "arith",
	question: "What is 2 + 2, and why?",
	correctAnswer: "4 — two units joined with two more make four.",
};

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";

/** The Wave A boundary predicate (2026-09-26): pi's loop structurally
 *  validates against the TypeBox parameters, then execute re-runs the
 *  authoring refinements (the old superRefine) and returns an isError
 *  result on problems (pi 1.0 convention — invalidInputResult; the model
 *  sees both as retryable input errors). This helper replicates the old
 *  safeParse seam end to end. */
async function boundaryParse(
	// `input: never` param: contravariance lets any AgentTool's execute slot in.
	tool: { parameters: any; execute: (id: string, input: never) => Promise<unknown> },
	input: unknown,
): Promise<{ success: boolean; error?: AgentToolResult<{ tool: string; problems: string[] }> }> {
	if (!Value.Check(tool.parameters, input)) return { success: false };
	const result = (await tool.execute("tc", input as never)) as AgentToolResult<{
		tool: string;
		problems: string[];
	}>;
	if (result.isError) return { success: false, error: result };
	return { success: true };
}
const problemLines = (r?: AgentToolResult<{ tool: string; problems: string[] }>): string[] =>
	r?.details.problems ?? [];

describe("teachExplainToolFor: the dynamic plan-nodeId validation (position signal)", () => {
	it("accepts a nodeId that matches a node of the session's tree", async () => {
		const chatId = newChat("NodeId: valid");
		chatStore.saveTree(chatId, {
			nodes: [
				{ id: "arith", title: "Arithmetic" },
				{ id: "expressions", title: "Expressions" },
			],
			edges: [{ from: "arith", to: "expressions" }],
			version: 1,
		});
		const res = await boundaryParse(teachExplainToolFor({ chatId, chatStore }), {
			...validExplain,
			nodeId: "expressions",
		});
		assert.equal(res.success, true);
	});

	it("rejects a nodeId that matches no node — with a message listing the slugs", async () => {
		const chatId = newChat("NodeId: typo");
		chatStore.saveTree(chatId, {
			nodes: [{ id: "arith", title: "Arithmetic" }],
			edges: [],
			version: 1,
		});
		const res = await boundaryParse(teachExplainToolFor({ chatId, chatStore }), {
			...validExplain,
			nodeId: "arithmetic", // the typo — slug is 'arith'
		});
		assert.equal(res.success, false);
		const msg = problemLines(res.error).join("\n");
		assert.match(msg, /matches no node/);
		assert.match(msg, /arith/);
	});

	it("no tree yet: ANY nodeId is rejected — questions wait for plan_init", async () => {
		const chatId = newChat("NodeId: no tree");
		const tool = teachExplainToolFor({ chatId, chatStore });
		const res = await boundaryParse(tool, { ...validExplain, nodeId: "anything" });
		assert.equal(res.success, false);
		assert.match(problemLines(res.error).at(-1)!, /No plan map exists yet — call plan_init/);
	});

	it("missing nodeId is rejected at the boundary (owner ruling 2026-09-26: no untagged questions)", async () => {
		const chatId = newChat("NodeId: required");
		chatStore.saveTree(chatId, {
			nodes: [{ id: "arith", title: "Arithmetic" }],
			edges: [],
			version: 1,
		});
		const tool = teachExplainToolFor({ chatId, chatStore });
		const { nodeId: _dropped, ...untagged } = validExplain;
		const res = await boundaryParse(tool, untagged);
		assert.equal(res.success, false, "an untagged question must be rejected back to the model");
		// The structural pin: the SCHEMA itself names the missing field (pi's
		// boundary formats Value.Errors as the tool-input-error the model sees).
		const schemaErrors = [...Value.Errors(explainInputObject, untagged)].map((e) => e.message);
		assert.match(
			schemaErrors.join("\n"),
			/nodeId/,
			"the schema rejection names nodeId so the model can retry tagged",
		);
	});

	it("reads the LIVE record — a plan_init mutation mid-turn is honored immediately", async () => {
		const chatId = newChat("NodeId: live record");
		const tool = teachExplainToolFor({ chatId, chatStore });

		const before = await boundaryParse(tool, { ...validExplain, nodeId: "fresh-node" });
		assert.equal(before.success, false, "no tree yet → rejected");

		chatStore.saveTree(chatId, {
			nodes: [{ id: "fresh-node", title: "Just initialized" }],
			edges: [],
			version: 1,
		});
		const after = await boundaryParse(tool, { ...validExplain, nodeId: "fresh-node" });
		assert.equal(after.success, true, "the same id validates once the tree exists — same turn");
	});

	it("the commitment check chains with the nodeId check — BOTH problems surface", async () => {
		const chatId = newChat("NodeId: commitment intact");
		const res = await boundaryParse(teachExplainToolFor({ chatId, chatStore }), {
			...validExplain,
			correctAnswer: "   ",
			nodeId: "ghost",
		});
		assert.equal(res.success, false);
		const msgs = problemLines(res.error).join("\n");
		assert.match(msgs, /correctAnswer is required/);
		assert.match(msgs, /matches no node/);
	});
});

describe("the prober's registry", () => {
	it("carries the nodeId-less recall, probe_done, and the learner-filesystem set", () => {
		const chatId = newChat("Prober: registry");
		const tools = createProberTools({ chatId, chatStore, deliver: () => {}, jobStore, spawn: () => {} });
		// Fix wave (2026-09-20): the owner ruling adds research + pdf dispatch
		// to the probe phase's registry (demo/visual stay teach-only).
		assert.deepEqual(Object.keys(tools).sort(), [
			"ask_user_question", "find", "grep", "ls", "pdf", "probe_done", "read", "recall", "research",
		]);
	});
});
// ─── tool availability (2026-09 settings seam) ───────────────────────────────

describe("tool toggles (core/pending.ts + factories)", () => {
	it("TOGGLEABLE_TOOLS: the sub-agent dispatch tools; graded/ask/read stay off the list", () => {
		// THE DEFINITIVE vocabulary (adjudicated with the user 2026-09-19, P2
		// reconciliation): the job tools only. The graded tool and ask are
		// permanently always-on (the prober's assessment + teaching doctrine
		// are built on graded questions — the wedge danger), as are the
		// learner-fs set, plan tools, and probe_done. The settings WRITE side
		// validates against this list (settings-body).
		assert.deepEqual(TOGGLEABLE_TOOLS, ["research", "demo", "visual", "pdf"]);
	});

	it("createProberTools: absent record = full set; explicit false drops exactly that tool; recall and probe_done survive everything", () => {
		const chatId = newChat("Prober: toggles");
		const ctx = { chatId, chatStore, deliver: () => {}, jobStore, spawn: () => {} };
		const full = ["ask_user_question", "find", "grep", "ls", "pdf", "probe_done", "read", "recall", "research"];
		assert.deepEqual(Object.keys(createProberTools(ctx)).sort(), full);

		const noAsk = createProberTools(ctx, { ask_user_question: false });
		assert.deepEqual(Object.keys(noAsk).sort(), full.filter((t) => t !== "ask_user_question"));

		// A stored `explain: false` from the retired quizzing switch (or any
		// hand-written false on the graded tool) never drops it.
		assert.deepEqual(Object.keys(createProberTools(ctx, { explain: false, recall: false })).sort(), full);
		assert.ok(createProberTools(ctx, { probe_done: false }).probe_done, "probe_done always-on");
	});

	it("createTeacherTools: {research: false} removes exactly research; unknown keys are no-ops", () => {
		const chatId = newChat("Teacher: toggles");
		const ctx: TeacherToolContext = {
			chatId,
			chatStore,
			jobStore,
			spawn: () => {},
		};
		const full = Object.keys(createTeacherTools(ctx)).sort();
		assert.deepEqual(full, ["ask_user_question", "demo", "explain", "find", "grep", "ls", "pdf", "plan_init", "read", "research", "visual"]);

		const noResearch = Object.keys(createTeacherTools(ctx, { research: false })).sort();
		assert.deepEqual(noResearch, full.filter((t) => t !== "research"));

		// absent = enabled: an empty record and undefined behave identically
		assert.deepEqual(
			Object.keys(createTeacherTools(ctx, {})).sort(),
			full,
			"absent keys mean enabled — old records behave exactly as today",
		);

		// A stored `explain: false` from the retired quizzing switch never
		// drops the only graded tool.
		assert.deepEqual(Object.keys(createTeacherTools(ctx, { explain: false })).sort(), full);
	});
});


// ─── prepareArguments: the GLM string-encoded options guard (2026-09-26) ────

describe("prepareQuestionArguments (the string-encoded options wobble)", () => {
	// The gradient-descent session (chat_muhskq6p): 6 of 7 question validation
	// failures were `options` arriving as a JSON-encoded STRING. pi runs
	// prepareArguments BEFORE schema validation — the coerced call lands
	// instead of bouncing back as a wasted retry turn.
	const goodOptions = [
		{ label: "The slope of the tangent line", value: "slope" },
		{ label: "The value of the curve", value: "value" },
	];
	const asString = JSON.stringify(goodOptions);

	it("coerces string-encoded options on ask_user_question", () => {
		const prepare = (askUserQuestionTool as unknown as { prepareArguments: (a: unknown) => unknown }).prepareArguments;
		const out = prepare({ question: "q", options: asString });
		assert.deepEqual((out as { options: unknown }).options, goodOptions);
	});

	it("passes everything else through UNTOUCHED (identity — pi's fast path)", () => {
		const prepare = (askUserQuestionTool as unknown as { prepareArguments: (a: unknown) => unknown }).prepareArguments;
		const arrayArgs = { question: "q", options: goodOptions };
		assert.equal(prepare(arrayArgs), arrayArgs, "array args return the SAME object (no defensive copies)");
		const unparseable = { question: "q", options: "not json" };
		assert.equal(prepare(unparseable), unparseable, "unparseable strings pass through — validation reports honestly");
	});
});

describe("the prober's explain: no nodeId field at all", () => {
	it("the probe schema carries no nodeId; the commitment contract still binds", async () => {
		assert.ok(!("nodeId" in probeExplainTool.parameters.properties));
		const res = await boundaryParse(probeExplainTool, {
			question: "Explain what a derivative measures.",
			correctAnswer: "The instantaneous rate of change at a point — the limit the slopes converge to.",
		});
		assert.equal(res.success, true);
		const empty = await boundaryParse(probeExplainTool, {
			question: "q",
			correctAnswer: " ",
		});
		assert.equal(empty.success, false);
	});
});

// ─── descriptions are MECHANICS (owner 2026-10-03) ────────────────────────
// Question-design doctrine lives in the system prompt (shared craft chunk +
// teacher fragments), NOT in tool descriptions. A description that teaches
// the model how to write questions drifts the moment a new variant (prober,
// future adaptive practice) reuses the tool with a different doctrine.
describe("tool descriptions carry mechanics only, no question-craft", () => {
	it("the explain tools keep the COMMITMENT rule (the grading contract) and drop the softer doctrine", () => {
		for (const [name, tool] of [
			["teach explain", teachExplainToolFor({ chatId: "chat_x", chatStore: undefined as never })],
			["probe recall", probeExplainTool],
		] as const) {
			assert.ok(tool.description.includes("COMMITTED"), `${name} keeps the commitment rule`);
			assert.ok(tool.description.includes("`confidence`"), `${name} names the confidence field it returns`);
			assert.ok(!tool.description.includes("near-miss"), `${name} drops the doctrine (now in the shared prompt)`);
		}
	});
	it("only the teach explain declares `nodeId`", () => {
		assert.ok(teachExplainToolFor({ chatId: "chat_x", chatStore: undefined as never }).description.includes("`nodeId`"));
		assert.ok(!probeExplainTool.description.includes("`nodeId`"));
	});
	it("the craft now lives in the shared prompt chunk (both agents compose it)", async () => {
		const shared = await fs.promises.readFile(
			path.join(PATHS.root, "src/agent/prompts/shared/20-question-tools.md"),
			"utf-8",
		);
		assert.ok(shared.includes("**Grading.**"), "the grading craft lives here");
		assert.ok(shared.includes("TRANSCRIBED SPEECH"), "the spoken-thinking leniency note lives here");
	});
});
