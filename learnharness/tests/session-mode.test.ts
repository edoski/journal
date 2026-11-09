/**
 * SESSION MODE: what a session is doing (teach or practice) is folded over
 * its transcript. A session-mode marker sets the starting mode (the Current
 * design's Practice switch); a concluded handoff call (`practice` or
 * `teach`) switches it. Records made before the fold carry a stored `kind`,
 * read as the starting mode. Runs under an isolated LH_DATA_DIR (the seam is
 * set before any config-loading import, so every app-module import is
 * dynamic).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

// ── the seam, BEFORE any config-loading import ──────────────────────────────
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-session-mode-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { chatStore } = await import("../src/store/chats.ts");
const { PATHS } = await import("../config.ts");
const {
	PRACTICE_PROBLEM_TOOL,
	PRACTICE_CONCLUDE_TOOL,
	newProblemDismissedMarker,
	newSessionModeMessage,
	newThinkingMessage,
	newUserMessage,
	sessionModeOf,
	sessionModesOf,
} = await import("../src/core/native-messages.ts");

type LhMessage = import("../src/core/native-messages.ts").LhMessage;

function callPair(name: string, callId: string, opts: { isError?: boolean; details?: { ok: boolean }; stopReason?: "toolUse" | "error" | "aborted" } = {}): LhMessage[] {
	return [
		{
			id: `msg_a_${callId}`,
			role: "assistant",
			content: [{ type: "toolCall", id: callId, name, arguments: name === PRACTICE_PROBLEM_TOOL
				? { statement: "Show that…", mode: "recall", modelSolution: "Show that…" }
				: name === PRACTICE_CONCLUDE_TOOL ? { outcome: "solved" } : { scope: "rank", reason: "asked for problems" } }],
			api: "faux",
			provider: "test",
			model: "test-model",
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			stopReason: opts.stopReason ?? "toolUse",
			timestamp: 1,
		},
		{
			id: `msg_r_${callId}`,
			role: "toolResult",
			toolCallId: callId,
			toolName: name,
			content: [{ type: "text", text: opts.isError ? "Tool refused" : "Tool completed" }],
			details: opts.details ?? null,
			isError: opts.isError ?? false,
			timestamp: 2,
		},
	];
}
const practicePair = (name: typeof PRACTICE_PROBLEM_TOOL | typeof PRACTICE_CONCLUDE_TOOL, callId: string, isError = false) => callPair(name, callId, { isError });

/** A record as sessions made before the fold stored it: `kind` at creation. */
function legacyPracticeChat(title: string): string {
	const chat = chatStore.createChat(title);
	const file = path.join(PATHS.chats, `${chat.id}.json`);
	fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf-8")), kind: "practice" }));
	return chat.id;
}

function practiceChat(title: string, messages: LhMessage[] = []): string {
	const chat = chatStore.createChat(title);
	chatStore.saveMessages(chat.id, [newSessionModeMessage("practice"), ...messages]);
	return chat.id;
}

const listedMode = (id: string) => chatStore.listChats().find((c) => c.id === id)?.kind;

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

describe("the mode fold", () => {
	it("a session starts in teaching, with no stored kind", () => {
		const chat = chatStore.createChat("plain session");
		assert.equal("kind" in chat, false, "new records never store a kind");
		assert.equal(listedMode(chat.id), "teach");
	});

	it("a session-mode marker starts the session in practice", () => {
		assert.equal(listedMode(practiceChat("practice session")), "practice");
	});

	it("a concluded practice handoff moves the session to practice, and a teach handoff back", () => {
		const opening = [newUserMessage("give me problems on rank")];
		const toPractice = [...opening, ...callPair("practice", "h1", { details: { ok: true } })];
		assert.deepEqual(sessionModesOf(toPractice), ["teach", "teach", "teach"], "the handoff call and its result are written in teaching");
		assert.equal(sessionModeOf(toPractice), "practice");
		const back = [...toPractice, newUserMessage("actually just explain it"), ...callPair("teach", "h2", { details: { ok: true } })];
		assert.deepEqual(sessionModesOf(back).slice(3), ["practice", "practice", "practice"]);
		assert.equal(sessionModeOf(back), "teach");
	});

	it("a refused, errored, failed or dangling handoff switches nothing", () => {
		const cases: LhMessage[][] = [
			callPair("practice", "r1", { details: { ok: false } }),
			callPair("practice", "r2", { isError: true }),
			callPair("practice", "r3", { stopReason: "error" }),
			callPair("practice", "r4", { stopReason: "aborted" }),
			callPair("practice", "r5").slice(0, 1),
		];
		for (const messages of cases) assert.equal(sessionModeOf(messages), "teach");
	});

	it("a result must match its call's tool: another tool's result under the call id switches nothing", () => {
		const [call, result] = callPair("practice", "x1");
		assert.equal(sessionModeOf([call!, { ...result!, toolName: "read" } as LhMessage]), "teach");
	});

	it("a record that stored kind practice starts there, and the teach handoff still moves it", () => {
		const id = legacyPracticeChat("older practice record");
		assert.equal(listedMode(id), "practice");
		chatStore.saveMessages(id, [newUserMessage("explain it instead"), ...callPair("teach", "l1")]);
		assert.equal(listedMode(id), "teach");
	});
});

describe("the list's problem status", () => {
	it("marks a practice session with a posed problem as pendingProblem", () => {
		const waiting = practiceChat("problem waiting", practicePair(PRACTICE_PROBLEM_TOOL, "call_p1"));
		const idle = practiceChat("no problem yet");
		const listed = chatStore.listChats();
		assert.equal(listed.find((c) => c.id === waiting)?.pendingProblem, true);
		assert.equal(listed.find((c) => c.id === idle)?.pendingProblem, false);
	});

	it("teaching summaries carry false without persisting the derived field", () => {
		const chat = chatStore.createChat("teaching conversation");
		chatStore.saveMessages(chat.id, [newUserMessage("Explain the material")]);
		const listed = chatStore.listChats().find((c) => c.id === chat.id);
		assert.equal(listed?.kind, "teach");
		assert.equal(listed?.pendingProblem, false);
		assert.equal("pendingProblem" in chatStore.getChat(chat.id)!, false);
	});

	const pose = () => practicePair(PRACTICE_PROBLEM_TOOL, "p1");
	const conclude = () => practicePair(PRACTICE_CONCLUDE_TOOL, "c1");
	const cases: Array<{ name: string; messages: LhMessage[]; pending: boolean }> = [
		{ name: "thinking keeps the posed problem waiting", messages: [...pose(), newThinkingMessage("p1", "My attempt")], pending: true },
		{ name: "a clean conclusion clears the waiting status", messages: [...pose(), ...conclude()], pending: false },
		{ name: "dismissal clears the stored waiting status before conclusion synthesis", messages: [...pose(), newProblemDismissedMarker("p1")], pending: false },
		{ name: "a failed pose never waits for input", messages: practicePair(PRACTICE_PROBLEM_TOOL, "p1", true), pending: false },
		{ name: "a dangling pose never waits for input", messages: pose().slice(0, 1), pending: false },
		{ name: "a failed conclusion keeps the problem waiting", messages: [...pose(), ...practicePair(PRACTICE_CONCLUDE_TOOL, "c1", true)], pending: true },
		{ name: "a dangling conclusion keeps the problem waiting", messages: [...pose(), ...conclude().slice(0, 1)], pending: true },
		{ name: "a rejected newer pose leaves the prior problem waiting", messages: [...pose(), ...practicePair(PRACTICE_PROBLEM_TOOL, "p2", true)], pending: true },
		{ name: "a new problem after a conclusion waits again", messages: [...pose(), ...conclude(), ...practicePair(PRACTICE_PROBLEM_TOOL, "p2")], pending: true },
	];

	for (const { name, messages, pending } of cases) {
		it(`the list projection: ${name}`, () => {
			const id = practiceChat(name, messages);
			const listed = chatStore.listChats().find((c) => c.id === id);
			assert.equal(listed?.pendingProblem, pending);
			assert.equal(listed?.pendingQuestion, false, "practice status does not manufacture a teaching question");
		});
	}

	for (const stopReason of ["aborted", "error"] as const) {
		it(`an ${stopReason} generation with no pose acknowledgement never waits for input`, () => {
			const [call] = pose();
			assert.ok(call?.role === "assistant");
			const id = practiceChat(stopReason, [{ ...call, stopReason }]);
			assert.equal(chatStore.listChats().find((c) => c.id === id)?.pendingProblem, false);
		});
	}
});
