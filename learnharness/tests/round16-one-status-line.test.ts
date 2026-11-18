/**
 * Round 16, m1 (3 m1): near the end of most turns two or three "Thinking…"
 * lines stacked 40 px apart, and each hand-off showed two "Planning the
 * lesson…" lines for about 10 s. Each running tool drew its own line in
 * the message, and since round 15's m37 the lesson's own line stays up
 * while a question is written, so the two stacked. Now a running tool draws
 * nothing: the lesson's one line is the turn's only status, and its words
 * follow the turn (the plan, a demo, a question, else Thinking…).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { SessionModel } from "../components/session-core.ts";
import { showsWorking } from "../components/lesson/working-sign.ts";
import { newUserMessage, streamingToolActivity, workingLine, type LhMessage, type LhViewMessage } from "../src/core/index.ts";

const COMPONENTS = path.join(import.meta.dirname, "..", "components");

function sources(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(dir, entry.name);
		if (entry.isDirectory()) return sources(file);
		return entry.name.endsWith(".tsx") ? [file] : [];
	});
}

test("the lesson draws one working line, never one per running tool (round 16, m1)", () => {
	// The dispatch card is the slot a background job's demo, figure or
	// sources fill, which outlives the turn; it is no line of the turn's.
	const sites = sources(COMPONENTS)
		.filter((file) => !file.endsWith(path.join("lesson", "activity-line.tsx")))
		.flatMap((file) => (fs.readFileSync(file, "utf8").match(/<ActivityLine\b/g) ?? []).map(() => path.relative(COMPONENTS, file)));
	assert.deepEqual(sites.sort(), ["artifacts/dispatch-card.tsx", "chat.tsx"]);
});

const reply = (content: unknown[], stopReason = "stop") => ({ role: "assistant", content, stopReason });
const call = (id: string, name: string, args: unknown) => ({ type: "toolCall", id, name, arguments: args });
const done = (id: string, name: string) => ({ type: "tool_execution_end", toolCallId: id, toolName: name, result: { content: [{ type: "text", text: "ok" }], details: null }, isError: false });

const WORDS = { message: "Right: $(1,1)$ goes to $(3,3)$." };
const DEMO = { title: "Stretching along eigenvectors", html: "<p>demo</p>" };
const QUESTION = { type: "check", nodeId: "n1", question: "What does $A$ do to $(1,-1)$?", correctAnswer: "Sends it to $(1,-1)$." };
const ALL = [call("s1", "send_to_user", WORDS), call("c1", "course_save", { observations: [] }), call("l1", "lesson_progress", { done: ["n0"] }), call("d1", "demo", DEMO), call("q1", "explain", QUESTION)];

/** A resumed lesson's first answer, as round 16's M5 measured it: one reply
 *  holding the words, the save, the progress, a demo and the next check,
 *  each run in turn after the reply ends. */
const ANSWER_TURN: [string, Record<string, unknown>][] = [
	["the reply opens", { type: "message_start", message: reply([]) }],
	["the words arrive", { type: "message_update", message: reply([call("s1", "send_to_user", { message: WORDS.message.slice(0, 10) })]) }],
	["the save is written", { type: "message_update", message: reply([...ALL.slice(0, 2)]) }],
	["the demo is written", { type: "message_update", message: reply([...ALL.slice(0, 4)]) }],
	["the check is written", { type: "message_update", message: reply(ALL) }],
	["the reply ends", { type: "message_end", message: reply(ALL, "toolUse") }],
	["the words are shown", done("s1", "send_to_user")],
	["the save runs", done("c1", "course_save")],
	["the progress runs", done("l1", "lesson_progress")],
	["the demo is built", done("d1", "demo")],
];

test("one line through the turn, its words following what he waits for (round 16, m1)", () => {
	const m = new SessionModel({ chatId: "c_m1", initialMessages: [newUserMessage("(1,1) goes to (3,3)") as LhMessage] });
	(m as unknown as { setStatus(s: string): void }).setStatus("streaming");
	const lines: string[] = [];
	for (const [step, event] of ANSWER_TURN) {
		m.applyWireEvent(event);
		const view = m.getState().messages as LhViewMessage[];
		lines.push(`${step}: ${showsWorking(view, true) ? (streamingToolActivity(view) ?? workingLine(view)) : "-"}`);
	}
	assert.deepEqual(lines, [
		"the reply opens: Thinking…",
		"the words arrive: -",
		"the save is written: Thinking…",
		"the demo is written: Building a demo…",
		"the check is written: Building a demo…",
		"the reply ends: Building a demo…",
		"the words are shown: Building a demo…",
		"the save runs: Building a demo…",
		"the progress runs: Building a demo…",
		"the demo is built: Writing a question…",
	]);
});

test("from the probe's end to the plan, the hand-off reads Planning the lesson… once (round 16, m1)", () => {
	const m = new SessionModel({ chatId: "c_m1b", initialMessages: [newUserMessage("no idea") as LhMessage] });
	(m as unknown as { setStatus(s: string): void }).setStatus("streaming");
	const steps: Record<string, unknown>[] = [
		{ type: "message_start", message: reply([]) },
		{ type: "message_end", message: reply([call("p0", "probe_done", { summary: "x" })], "toolUse") },
		done("p0", "probe_done"),
		{ type: "message_start", message: reply([]) },
		{ type: "message_update", message: reply([call("p1", "plan_init", { goal: { title: "Poisson" } })]) },
	];
	for (const event of steps) m.applyWireEvent(event);
	const view = m.getState().messages as LhViewMessage[];
	assert.equal(showsWorking(view, true), true);
	assert.equal(streamingToolActivity(view) ?? workingLine(view), "Planning the lesson…");
});
