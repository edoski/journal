/**
 * The lesson digest: finishing a lesson saves what its live saves left out
 * to the course record, in the background, once per stretch of the
 * session. It writes the engine by handle, never observations, never posts
 * into the chat, and shows in the activity dock while it runs. Runs under
 * an isolated LH_DATA_DIR.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type ToolCall } from "@earendil-works/pi-ai";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-lesson-digest-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { chatStore } = await import("../src/store/chats.ts");
const { emit, subscribe } = await import("../src/core/events.ts");
const { newSessionModeMessage, newUserMessage } = await import("../src/core/native-messages.ts");
const { digestChanges, digestModel, digestWindow, knowledgeHandle } = await import("../src/core/lesson-digest.ts");
const { createLessonDigest } = await import("../src/agent/subagents/lesson-digest.ts");
const { extractionStatuses } = await import("../src/agent/subagents/extraction.ts");
const { onLessonEvents, resumeCutDigests } = await import("../src/server/lesson-finish.ts");
type LhMessage = import("../src/core/native-messages.ts").LhMessage;
type CourseRecords = import("../src/core/ports.ts").CourseRecords;
type CourseMap = import("../src/core/contracts/course-map.ts").CourseMap;
type PiEngine = import("../src/agent/models.ts").PiEngine;

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const assistant = (content: unknown[], stopReason: "stop" | "toolUse" = "toolUse") =>
	({ id: `a${++n}`, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: n }) as unknown as LhMessage;
const result = (toolCallId: string, toolName: string, details: unknown) =>
	({ id: `r${++n}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details, isError: false, timestamp: n }) as unknown as LhMessage;
const call = (id: string, name: string, args: unknown) => ({ type: "toolCall", id, name, arguments: args });
const text = (t: string) => ({ type: "text", text: t });

const TREE = {
	nodes: [
		{ id: "rank-picture", title: "What rank means" },
		{ id: "rank-rule", title: "The rule" },
	],
	edges: [{ from: "rank-picture", to: "rank-rule" }],
	version: 1,
};

/** A lesson taught through its first step that saved one graded answer,
 *  then the tutor's last turn. */
const lesson = (last: string): LhMessage[] => [
	newUserMessage("Rank, please."),
	assistant([call("pd", "probe_done", { strands: [{ strand: "rank", assessment: "new" }], summary: "ready" })]),
	result("pd", "probe_done", { ok: true }),
	assistant([text("Two steps."), call("plan", "plan_init", { mermaid: "graph TD" })]),
	result("plan", "plan_init", { ok: true, tree: TREE }),
	assistant([text("Say go.")], "stop"),
	newUserMessage("Go. Wait, does rank count the rows?"),
	assistant([call("q", "explain", { type: "check", nodeId: "rank-picture", question: "What does rank count?", correctAnswer: "Pivots." })]),
	result("q", "explain", { kind: "explain", text: "Pivots.", confidence: "confident" }),
	assistant([call("s", "course_save", { changes: { observations: [{ topics: ["rank"], text: "Said rank counts pivots", result: "correct" }], tasks: { "sheet-2": { step: "Exercise 1" } } } })]),
	result("s", "course_save", { ok: true }),
	assistant([text(last)], "stop"),
];
const FINISHED = "Good place to stop. Practice comes next, in a day or two.";
const PARTWAY = "Right. So with rank 3 and 5 columns, how many free variables are there?";

function chatWith(messages: LhMessage[], workspace = "/courses/linalg"): string {
	const record = chatStore.createChat("Rank", { workspace, title: "Linear algebra" });
	chatStore.saveMessages(record.id, messages);
	chatStore.saveTree(record.id, TREE);
	return record.id;
}

const MAP: CourseMap = {
	workspace: "/courses/linalg",
	title: "Linear algebra",
	today: "2026-11-13",
	revision: 3,
	exam: null,
	current: "rank" as never,
	focus: null,
	tasks: [{ key: "sheet-2", title: "Sheet 2", step: "Exercise 1" }],
	topics: [
		{ handle: "rank", title: "Rank", level: "assisted", introduced: "2026-11-13", review: null, weak: false, signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false }, tasks: ["sheet-2"] },
		{ handle: "nullity", title: "Nullity", level: "none", introduced: null, review: null, weak: false, signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false }, tasks: [] },
	] as never,
	edges: [],
};

/** An in-memory engine: the map above, `show` with one note, and every save kept. */
function memoryCourse() {
	const saves: Array<Record<string, unknown>> = [];
	const records: CourseRecords = {
		list: async () => ({ available: true, courses: [] }),
		map: async () => ({ ok: true, map: MAP }),
		create: async () => ({ ok: true, workspace: "/courses/linalg" }),
		run: async (_workspace, verb) => {
			if (verb.verb === "show") return { ok: true, json: { items: { rank: { kind: "topic", note: "Reads matrices by rows" } } } };
			if (verb.verb === "save") {
				saves.push(verb.changes as Record<string, unknown>);
				return { ok: true, json: { saved: true } };
			}
			return { ok: false, kind: "io", message: `unexpected ${verb.verb}` };
		},
	};
	return { records, saves };
}

const SUBMIT = {
	topics: [
		{ handle: "rank", gap: "You count rows instead of pivots", note: "Reads matrices by rows" },
		{ handle: "nullity", introduced: true },
	],
	knowledge: [{ text: "The course writes rank as $r(A)$", topics: ["rank"] }],
	task: { key: "sheet-2", step: "Exercise 2: find the rank of $B$" },
};

/** A scripted model whose one answer is the digest's submit; `onCall`
 *  fires at the moment of the call. */
function submitEngine(input: unknown, onCall?: () => void): PiEngine {
	const faux = createFauxCore({});
	faux.setResponses([
		() => {
			onCall?.();
			return fauxAssistantMessage([fauxToolCall("submit_digest", input as ToolCall["arguments"], { id: "digest-call" })], { stopReason: "toolUse" });
		},
	]);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

describe("the digest's patch", () => {
	const view = {
		topics: [
			{ handle: "rank", title: "Rank", introduced: true, gap: "Old gap", note: "Same note" },
			{ handle: "nullity", title: "Nullity", introduced: false, gap: null, note: null },
		],
		current: "rank",
		tasks: ["sheet-2"],
		planFinished: false,
	};

	it("merges by handle, keeps what is unchanged out, and never carries observations", () => {
		const patch = digestChanges(
			{
				topics: [
					{ handle: "rank", gap: "Old gap", note: "Same note", introduced: true },
					{ handle: "nullity", introduced: true, gap: "You forget the free columns" },
					{ handle: "ghost" },
				],
				knowledge: [{ text: "Pivots are circled in the notes", topics: ["rank", "ghost"] }],
				task: { key: "sheet-2", step: "Exercise 2" },
				current: "rank",
			},
			view,
		);
		assert.deepEqual(patch?.changes, {
			topics: { nullity: { introduced: true, gap: "You forget the free columns" } },
			knowledge: { [knowledgeHandle("Pivots are circled in the notes")]: { text: "Pivots are circled in the notes", topics: ["rank"] } },
			tasks: { "sheet-2": { step: "Exercise 2" } },
		});
		assert.equal("observations" in (patch?.changes ?? {}), false);
	});

	it("is null when nothing changes", () => {
		assert.equal(digestChanges({ topics: [{ handle: "rank", gap: "Old gap" }], knowledge: [], current: "rank" }, view), null);
	});

	it("a new topic needs a title and takes its place after its prerequisite", () => {
		const patch = digestChanges({ topics: [{ handle: "pivot", title: "Pivots", needs: ["rank"] }, { handle: "untitled" }], knowledge: [] }, view);
		assert.deepEqual(patch?.changes, {
			topics: { pivot: { title: "Pivots", introduced: true, needs: ["rank"] } },
			path: { order: ["rank", "pivot", "nullity"] },
		});
	});

	it("removes a task only when the plan has nothing left, and never one the session does not hold", () => {
		const done = { topics: [], knowledge: [], task: { key: "sheet-2", finished: true } };
		assert.equal(digestChanges(done, view), null);
		assert.deepEqual(digestChanges(done, { ...view, planFinished: true })?.changes, { tasks: { "sheet-2": null } });
		assert.equal(digestChanges({ topics: [], knowledge: [], task: { key: "other", step: "x" } }, view), null);
	});

	it("knowledge handles come from the text, so a repeat merges into the same entry", () => {
		assert.equal(knowledgeHandle("The course writes rank as $r(A)$"), knowledgeHandle("The course writes rank as $r(A)$ "));
		assert.notEqual(knowledgeHandle("Rank is r(A)"), knowledgeHandle("Rank is rk(A)"));
	});
});

describe("the digest's model", () => {
	it("is Opus 5.5 at high effort, on the lesson's Claude account or the default one", () => {
		assert.deepEqual(digestModel("claude-subscription-work"), { provider: "claude-subscription-work", id: "claude-opus-5-5", thinkingLevel: "high" });
		assert.deepEqual(digestModel("openrouter"), { provider: "claude-subscription", id: "claude-opus-5-5", thinkingLevel: "high" });
		assert.deepEqual(digestModel(undefined), { provider: "claude-subscription", id: "claude-opus-5-5", thinkingLevel: "high" });
	});
});

describe("the digest's window", () => {
	it("reads what no earlier digest read, and nothing twice", () => {
		const messages = lesson(FINISHED);
		const first = digestWindow(messages, undefined)!;
		assert.equal(first.fresh.length, messages.length);
		const ledger = { done: [{ throughMessageId: first.throughMessageId, fingerprint: first.fingerprint, at: "", outcome: "" }] };
		assert.equal(digestWindow(messages, ledger), null);
		const more = [...messages, newUserMessage("One more thing."), assistant([text("Sure, rank again tomorrow.")], "stop")];
		const second = digestWindow(more, ledger)!;
		assert.equal(second.context.length, messages.length);
		assert.equal(second.fresh.length, 2);
	});
});

describe("a digest run", () => {
	beforeEach(() => {
		for (const c of chatStore.listChats()) chatStore.deleteChat(c.id);
	});

	it("saves to the engine once, shows in the dock while it runs, and leaves the chat's messages alone", async () => {
		const chatId = chatWith(lesson(FINISHED));
		const course = memoryCourse();
		const seen: string[] = [];
		const stop = subscribe((e) => void seen.push(e.type));
		let dockRow: unknown;
		const digest = createLessonDigest({
			chatStore,
			courseRecords: course.records,
			engine: submitEngine(SUBMIT, () => {
				dockRow = extractionStatuses().find((r) => r.chatId === chatId);
			}),
		});
		const before = chatStore.getChat(chatId)!.messages;
		const outcome = await digest.digestLesson(chatId);
		stop();
		assert.equal(outcome.status, "saved");
		assert.deepEqual(course.saves, [
			{
				topics: { rank: { gap: "You count rows instead of pivots" }, nullity: { introduced: true } },
				knowledge: { [knowledgeHandle("The course writes rank as $r(A)$")]: { text: "The course writes rank as $r(A)$", topics: ["rank"] } },
				tasks: { "sheet-2": { step: "Exercise 2: find the rank of $B$" } },
			},
		]);
		assert.equal((dockRow as { kind?: string; phase?: string })?.kind, "digest");
		assert.equal((dockRow as { phase?: string }).phase, "digesting");
		assert.equal(extractionStatuses().some((r) => r.chatId === chatId), false, "the row leaves when the run ends");
		const after = chatStore.getChat(chatId)!;
		assert.deepEqual(after.messages, before, "nothing posted into the chat");
		assert.equal(after.digest?.done.length, 1);
		assert.equal(after.digest?.pending, undefined);
		assert.deepEqual([...new Set(seen)], ["activity-changed"], "no turn and no record-changed: the tutor is never woken");

		const again = createLessonDigest({ chatStore, courseRecords: course.records, engine: submitEngine(SUBMIT) });
		assert.equal((await again.digestLesson(chatId)).status, "nothing");
		assert.equal(course.saves.length, 1, "the same stretch is never saved twice");
	});

	it("skips practice sessions and chats with no course", async () => {
		const course = memoryCourse();
		const digest = createLessonDigest({ chatStore, courseRecords: course.records, engine: submitEngine(SUBMIT) });
		const loose = chatStore.createChat("No course");
		chatStore.saveMessages(loose.id, lesson(FINISHED));
		assert.equal((await digest.digestLesson(loose.id)).status, "skipped");
		const practice = chatStore.createChat("Drill", { workspace: "/courses/linalg", title: "Linear algebra" });
		chatStore.saveMessages(practice.id, [newSessionModeMessage("practice") as LhMessage, ...lesson(FINISHED)]);
		assert.equal((await digest.digestLesson(practice.id)).status, "skipped");
		assert.equal(course.saves.length, 0);
	});
});

describe("what starts a digest", () => {
	beforeEach(() => {
		for (const c of chatStore.listChats()) chatStore.deleteChat(c.id);
	});

	function listen() {
		const digested: string[] = [];
		const extracted: string[] = [];
		const stop = onLessonEvents({
			chatStore,
			digest: { digestLesson: async (id) => (digested.push(id), { status: "nothing" }) },
			extractTail: (id) => void extracted.push(id),
		});
		return { digested, extracted, stop };
	}

	it("a turn that finishes a lesson starts the digest and the graph's tail, however short the lesson", () => {
		const finished = chatWith(lesson(FINISHED));
		const partway = chatWith(lesson(PARTWAY));
		const { digested, extracted, stop } = listen();
		emit("turn-settled", { chatId: partway });
		emit("turn-settled", { chatId: finished });
		stop();
		assert.deepEqual(digested, [finished]);
		assert.deepEqual(extracted, [finished], "the tail runs at lesson finish, below the chunk budget");
	});

	it("the next lesson of the course digests the one left partway", () => {
		const partway = chatWith(lesson(PARTWAY));
		const otherCourse = chatWith([newUserMessage("Hi")], "/courses/other");
		const next = chatWith([newUserMessage("Eigenvalues today.")]);
		const { digested, stop } = listen();
		emit("turn-started", { chatId: otherCourse });
		emit("turn-started", { chatId: next });
		stop();
		assert.deepEqual(digested, [partway]);
	});

	it("the app's start finishes a digest a quit cut short", () => {
		const cut = chatWith(lesson(FINISHED));
		chatStore.saveDigestLedger(cut, { done: [], pending: { fingerprint: "f", throughMessageId: "m" } });
		chatWith(lesson(FINISHED));
		const digested: string[] = [];
		resumeCutDigests({ chatStore, digest: { digestLesson: async (id) => (digested.push(id), { status: "nothing" }) } });
		assert.deepEqual(digested, [cut]);
	});
});
