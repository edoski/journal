/**
 * Round 18, M4, Home's half (2 D2, 3 n1): in the Probability review, a
 * hinted right answer on Random variables moved "Start Expectation and
 * linearity", planned today, to a later day, and its line left Home and the
 * sidebar at that save, before any answer settled it and before the close
 * said where it went. A start planned today stays on Home and in the
 * sidebar until the session whose saves moved it closes.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-start-kept-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LEARNING_TODAY = "2026-11-08";
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage, newDoneTonightMessage } = await import("../src/core/native-messages.ts");
const { todayRows } = await import("../components/study-home/study-facts.ts");
const { lessonTitle, whyOf } = await import("../components/study-home/agenda-rows/row-facts.ts");
const { needsYouNow } = await import("../components/study-home/needs-you.ts");
const { map, topic } = await import("./fixtures/round8-home.ts");
after(() => {
	delete process.env.LEARNING_TODAY;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const TODAY = "2026-11-08";
const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const PROB = { workspace: "/s/prob", title: "Probability" };
const at = (hhmm: string) => new Date(`${TODAY}T${hhmm}:00`).getTime();
let n = 0;
const call = (time: number, name: string, args: unknown, result = "{}", details: unknown = {}) => {
	const id = `c${++n}`;
	return [
		{ id: `a${n}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: time },
		{ id: `r${n}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: result }], details, isError: false, timestamp: time },
	];
};
const MOVED = { expectation: { title: "Expectation and linearity", starts: "2026-11-15", moved: { from: TODAY, by: "study", day: "today", courses: ["Probability"], waits_on: ["Random variables and distributions"] } } };
/** The review up to its hinted save, which moved Expectation's start, and the question after it, waiting on him. */
const review = [
	{ ...newUserMessage("Review Random variables and distributions"), timestamp: at("10:00") },
	...call(at("10:01"), "course_save", { changes: { observations: [{ topics: ["random-variables"], text: "Found P(M = k) for two dice after the hint", result: "correct", help: "nudge" }] } }, JSON.stringify({ revision: 3, changed: true, starts_moved: MOVED })),
	{ id: "ask", role: "assistant", content: [{ type: "toolCall", id: "q2", name: "explain", arguments: { type: "check", question: "What is P(X = 2)?", correctAnswer: "1/5" } }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: at("10:02") },
];
/** The world after that save: the engine moved Expectation's start, as the save's receipt said. */
const course = {
	map: map({
		workspace: PROB.workspace,
		title: PROB.title,
		today: TODAY,
		current: "random-variables" as never,
		topics: [
			topic("random-variables", "Random variables and distributions", { level: "assisted", review: { kind: "scheduled", date: "2026-11-17" } }),
			topic("expectation", "Expectation and linearity", { level: "new", starts: "2026-11-15", moved: { from: TODAY, by: "study", courses: ["Probability"], day: "today", waitsOn: ["Random variables and distributions"] } }),
		],
	}),
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
} as never;
const listed = (id: string) => ({ ...chatStore.listChats().find((c) => c.id === id)!, busy: false });
/** Today's line for the start: never the plan's later line ("Start … · Sun 15 Nov"), which Today leaves out. */
const startLine = (rows: ReturnType<typeof todayRows>) => rows.find((row) => row.kind === "course" && row.step.kind === "topic" && row.step.on === undefined && lessonTitle(row) === "Start Expectation and linearity");

describe("a start planned today stays on Home until the session that moved it closes (round 18, M4)", () => {
	const created = chatStore.createChat("Review Random variables and distributions", PROB, ["random-variables"]);
	chatStore.saveMessages(created.id, review as never);

	it("the session list keeps the starts its saves moved", () => {
		assert.deepEqual(listed(created.id).startsMoved, ["expectation"]);
	});

	it("while the review waits on him, Home keeps Start Expectation and linearity · Planned today, and so does the sidebar", () => {
		const open = listed(created.id);
		const line = startLine(todayRows([course], [open], TODAY));
		assert.ok(line, "Home keeps the start's line");
		assert.equal(whyOf(line!)?.short, "Planned today");
		assert.ok(needsYouNow([course], [open], TODAY).lines.some((l) => l.title === "Start Expectation and linearity"), "the sidebar's card too");
	});

	it("once the review closes, the line goes: the close names where it went", () => {
		chatStore.saveMessages(created.id, [
			...review,
			{ id: "q2-left", role: "toolResult", toolCallId: "q2", toolName: "explain", content: [{ type: "text", text: JSON.stringify({ kind: "explain", dismissed: true }) }], details: { dismissed: true, reason: "tonight" }, isError: false, timestamp: at("10:03") },
			{ ...newDoneTonightMessage("teacher"), timestamp: at("10:03") },
			...call(at("10:04"), "send_to_user", { message: "Expectation and linearity now starts on Sunday 15 November." }),
			{ id: "close", role: "assistant", content: [], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "stop", timestamp: at("10:05") },
		] as never);
		assert.equal(startLine(todayRows([course], [listed(created.id)], TODAY)), undefined);
	});

	it("keeps the start while the turn that moved it still runs, before its transcript is written (integration live check)", () => {
		// Live on the merged head, the line left the sidebar at the save and came back only at the turn's end.
		const running = chatStore.createChat("Probability review", PROB, ["random-variables"]);
		chatStore.saveMessages(running.id, [{ ...newUserMessage("Probability review"), timestamp: at("12:00") }, review.at(-1)] as never);
		assert.equal(startLine(todayRows([course], [{ ...listed(running.id), busy: true }], TODAY)), undefined, "no save kept yet");
		chatStore.saveStartsMoved(running.id, ["expectation"]);
		assert.ok(startLine(todayRows([course], [{ ...listed(running.id), busy: true }], TODAY)), "the save's moved start is kept the moment the engine took it");
	});

	it("another session open today, which moved nothing, brings no line back", () => {
		const other = chatStore.createChat("Rank practice", PROB, ["rank"]);
		chatStore.saveMessages(other.id, [{ ...newUserMessage("Practice rank"), timestamp: at("11:00") }, ...call(at("11:01"), "problem", { statement: "Find rank A.", mode: "recall", topics: ["rank"], modelSolution: "2" })] as never);
		assert.equal(startLine(todayRows([course], [listed(created.id), listed(other.id)], TODAY)), undefined);
	});
});

it("course_save hands the session the starts its receipt moved, the moment the engine took it (round 18, M4, integration)", async () => {
	const { courseTools } = await import("../src/agent/tools/course.ts");
	const kept: string[][] = [];
	const ctx = {
		course: PROB,
		records: { run: async () => ({ ok: true, json: { saved: [], notes: [], starts_moved: MOVED } }) },
		arcs: false,
		onMoved: (topics: string[]) => kept.push(topics),
	};
	await courseTools(ctx as never).course_save!.execute("t1", { changes: { topics: { "random-variables": { introduced: true } } } } as never);
	assert.deepEqual(kept, [["expectation"]]);
});
