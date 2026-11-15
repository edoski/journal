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
import { fakeEngine } from "./helpers/fake-sdk.ts";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-lesson-digest-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { chatStore } = await import("../src/store/chats.ts");
const { emit, subscribe } = await import("../src/core/events.ts");
const { newSessionModeMessage, newUserMessage } = await import("../src/core/native-messages.ts");
const { digestArcs, digestChanges, digestProblems, digestWindow, knowledgeHandle, placedIn } = await import("../src/core/lesson-digest.ts");
const { learnerWords } = await import("../src/core/session-markdown.ts");
const { createLessonDigest, DIGEST_INSTRUCTIONS } = await import("../src/agent/subagents/lesson-digest.ts");
const { backgroundRuns } = await import("../src/agent/subagents/background-runs.ts");
const { onLessonEvents, resumeCutDigests } = await import("../src/server/lesson-finish.ts");
type LhMessage = import("../src/core/native-messages.ts").LhMessage;
type CourseRecords = import("../src/core/ports.ts").CourseRecords;
type CourseMap = import("../src/core/contracts/course-map.ts").CourseMap;
type SdkEngine = import("../src/agent/models.ts").SdkEngine;

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

/** The tutor's close: `lesson_progress` with `close: true`, then its last words. */
const close = (done: string[] = ["rank-picture"]): LhMessage[] => [
	assistant([call("lp", "lesson_progress", { done, close: true })]),
	result("lp", "lesson_progress", { ok: true }),
	assistant([text(FINISHED)], "stop"),
];
/** A lesson the tutor closed for today. */
const closedLesson = (): LhMessage[] => [...lesson("Pivots it is."), ...close()];

/** A tutor turn that ends on a quiz question he has not answered yet, its
 *  words sent ahead of it, as the live tutor does. */
const asks = (id: string, question: string, before: unknown[] = []): LhMessage[] => [
	assistant([...before, call(`m${id}`, "send_to_user", { message: "Next one." }), call(id, "explain", { type: "check", nodeId: "rank-picture", question, correctAnswer: "Pivots." })]),
	result(`m${id}`, "send_to_user", null),
];
/** His answer to a question. */
const answers = (id: string, question: string, words: string): LhMessage =>
	result(id, "explain", { kind: "explain", tool: "explain", questionText: question, options: [], answers: [], text: words, confidence: "confident", answeredAt: "2026-11-13T20:00:00Z" });
const Q1 = "What does rank count?";
const Q2 = "What is the rank of $\\begin{pmatrix} 1 & 2 \\\\ 2 & 4 \\end{pmatrix}$?";
const Q3 = "How many free variables does a rank-1 2x2 system have?";
/** A lesson as its turns settle: a right answer, then a wrong one, then
 *  "stop for today" and the tutor's close. Each entry is the record when
 *  a turn settles. */
function lessonTurns(): LhMessage[][] {
	const opening: LhMessage[] = [
		newUserMessage("Rank, please."),
		assistant([call("pd", "probe_done", { strands: [{ strand: "rank", assessment: "new" }], summary: "ready" })]),
		result("pd", "probe_done", { ok: true }),
		assistant([text("Two steps."), call("plan", "plan_init", { mermaid: "graph TD" })]),
		result("plan", "plan_init", { ok: true, tree: TREE }),
		assistant([text("Say go.")], "stop"),
		newUserMessage("Go."),
	];
	const turn1 = [...opening, ...asks("q1", Q1)];
	const turn2 = [...turn1, answers("q1", Q1, "Pivots."), ...asks("q2", Q2)];
	const turn3 = [...turn2, answers("q2", Q2, "2, because both rows are nonzero."), ...asks("q3", Q3)];
	const turn4 = [...turn3, newUserMessage("I have to stop for today, sorry."), ...close([])];
	return [turn1, turn2, turn3, turn4];
}

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
	tasks: [{ key: "sheet-2", title: "Sheet 2", step: "Exercise 1", updated: null }],
	topics: [
		{ handle: "rank", title: "Rank", level: "assisted", introduced: "2026-11-13", review: null, weak: false, signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false }, tasks: ["sheet-2"] },
		{ handle: "nullity", title: "Nullity", level: "none", introduced: null, review: null, weak: false, signals: { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false }, tasks: [] },
	] as never,
	edges: [],
};

const KNOWN = { handle: "rank-notation", text: "The course writes rank as $r(A)$", topics: ["rank"] };

/** An in-memory engine: the map above, one note and one knowledge entry, and every save kept. */
function memoryCourse(refuse: (changes: Record<string, unknown>) => string | null = () => null, arcs?: { whole: Record<string, unknown>; receipt: Record<string, unknown> }) {
	const saves: Array<Record<string, unknown>> = [];
	const records: CourseRecords = {
		list: async () => ({ available: true, courses: [], unreadable: [] }),
		map: async () => ({ ok: true, map: MAP }),
		create: async () => ({ ok: true, workspace: "/courses/linalg" }),
		run: async (_workspace, verb) => {
			if (verb.verb === "show" && verb.handles === "all") {
				return { ok: true, json: { topics: { rank: { note: "Reads matrices by rows" } }, knowledge: { [KNOWN.handle]: { text: KNOWN.text, topics: KNOWN.topics } }, ...arcs?.whole } };
			}
			if (verb.verb === "show") return { ok: true, json: { items: { rank: { kind: "topic", note: "Reads matrices by rows" } } } };
			if (verb.verb === "save") {
				const refused = refuse(verb.changes as Record<string, unknown>);
				if (refused) return { ok: false, kind: "validation", message: refused };
				saves.push(verb.changes as Record<string, unknown>);
				return { ok: true, json: { saved: true, ...arcs?.receipt } };
			}
			return { ok: false, kind: "io", message: `unexpected ${verb.verb}` };
		},
	};
	return { records, saves };
}

const SUBMIT = {
	topics: [
		{ handle: "rank", gap: "You count rows instead of pivots", shows: "does rank count the rows?", note: "Reads matrices by rows", step: "rank-picture" },
		{ handle: "nullity", introduced: true, step: "rank-picture" },
	],
	knowledge: [{ text: "Pivots are circled in the notes", topics: ["rank"], step: "rank-picture" }],
	task: { key: "sheet-2", step: "Exercise 2: find the rank of $B$" },
};

/** A scripted model that answers every run with the digest's submit for
 *  the prompt it read; `onCall` fires at the moment of each call. */
function submitEngine(input: unknown | ((prompt: string) => unknown), onCall?: (prompt: string) => void): SdkEngine {
	const faux = createFauxCore({});
	const answer = (context: unknown) => {
		const prompt = JSON.stringify(context);
		onCall?.(prompt);
		const submit = typeof input === "function" ? (input as (p: string) => unknown)(prompt) : input;
		return fauxAssistantMessage([fauxToolCall("submit_digest", submit as ToolCall["arguments"], { id: `digest-call-${++n}` })], { stopReason: "toolUse" });
	};
	faux.setResponses(Array.from({ length: 8 }, () => answer));
	return fakeEngine({ model: faux.getModel(), streamFn: faux.streamSimple });
}

describe("the digest and predictions (round 8, 1 D2)", () => {
	it("is told a prediction's miss is never a gap, and reads each prediction as one", () => {
		assert.match(DIGEST_INSTRUCTIONS, /Never write what a prediction got wrong as a `gap`, on its topic or any other/);
	});
});

describe("a background gap rests on his own words, never on a prediction's (the fix round's open J2 item)", () => {
	const call = (id: string, callId: string, name: string, args: unknown) =>
		({ id, role: "assistant", content: [{ type: "toolCall", id: callId, name, arguments: args }], api: "x", provider: "x", model: "x", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stopReason: "toolUse", timestamp: 0 }) as unknown as LhMessage;
	const answer = (id: string, callId: string, name: string, text: string) =>
		({ id, role: "toolResult", toolCallId: callId, toolName: name, content: [], details: { questionText: "Q", text }, isError: false, timestamp: 0 }) as unknown as LhMessage;
	const messages = [
		call("a1", "p1", "explain", { type: "predict", question: "Which matrices can be made diagonal?" }),
		answer("r1", "p1", "explain", "Only symmetric matrices can be made diagonal"),
		call("a2", "c1", "explain", { type: "check", question: "Find a vector of $E_2$." }),
		answer("r2", "c1", "explain", "(1, 2) works, since 2x + y = 0"),
		newUserMessage("why does the trace equal the sum of the eigenvalues?"),
	];
	const view = {
		topics: [{ handle: "diagonalization", title: "Diagonalization", introduced: true, gap: null, note: null }],
		current: "diagonalization",
		tasks: [],
		planFinished: false,
		knowledge: [],
		reached: null,
		said: learnerWords(messages),
	};
	const gap = (text: string, shows?: string) => ({ topics: [{ handle: "diagonalization", gap: text, ...(shows !== undefined ? { shows } : {}), step: "warm-up" }], knowledge: [] });

	it("reads which of his words were a prediction's answer", () => {
		assert.deepEqual(view.said, [
			{ text: "Only symmetric matrices can be made diagonal", predicted: true },
			{ text: "(1, 2) works, since 2x + y = 0", predicted: false },
			{ text: "why does the trace equal the sum of the eigenvalues?", predicted: false },
		]);
	});

	it("refuses a gap resting on a prediction's answer, even when the lesson also has a counted miss on the topic", () => {
		assert.match(digestProblems(gap("You think only symmetric matrices diagonalize", "only symmetric matrices"), view) ?? "", /diagonalization's gap quotes his answer to a prediction/);
	});

	it("refuses a new gap that quotes none of his words", () => {
		assert.match(digestProblems(gap("You plug in vectors without checking"), view) ?? "", /diagonalization's gap: quote in shows/);
		assert.match(digestProblems(gap("You plug in vectors without checking", "I never check"), view) ?? "", /diagonalization's gap: "I never check" is not in his words/);
	});

	it("takes a gap quoting his counted answer or his own message, and a gap cleared needs no quote", () => {
		assert.equal(digestProblems(gap("You read $(1,2)$ as a solution of $2x+y=0$", "(1, 2) works,  since"), view), null);
		assert.equal(digestProblems(gap("You don't see why the trace sums the eigenvalues", "Why does the trace"), view), null);
		assert.equal(digestProblems({ topics: [{ handle: "diagonalization", gap: null, step: "warm-up" }], knowledge: [] }, view), null);
	});
});

describe("the digest's patch", () => {
	const view = {
		topics: [
			{ handle: "rank", title: "Rank", introduced: true, gap: "Old gap", note: "Same note" },
			{ handle: "nullity", title: "Nullity", introduced: false, gap: null, note: null },
		],
		current: "rank",
		tasks: ["sheet-2"],
		planFinished: false,
		knowledge: [KNOWN],
		reached: ["warm-up", "rank-picture"],
	};

	it("merges by handle, keeps what is unchanged out, and never carries observations", () => {
		const patch = digestChanges(
			{
				topics: [
					{ handle: "rank", gap: "Old gap", note: "Same note", introduced: true, step: "rank-picture" },
					{ handle: "nullity", introduced: true, gap: "You forget the free columns", step: "rank-picture" },
					{ handle: "ghost", step: "rank-picture" },
				],
				knowledge: [{ text: "Pivots are circled in the notes", topics: ["rank", "ghost"], step: "warm-up" }],
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

	it("after the lesson's close it introduces no topic and creates none, so no day the close named moves; gaps, knowledge and the task still save", () => {
		const patch = digestChanges(
			{
				topics: [
					{ handle: "nullity", introduced: true, gap: "You forget the free columns", step: "rank-picture" },
					{ handle: "pivot", title: "Pivots", needs: ["rank"], step: "rank-picture" },
				],
				knowledge: [{ text: "Pivots are circled in the notes", topics: ["rank", "pivot"], step: "warm-up" }],
				task: { key: "sheet-2", step: "Exercise 2" },
			},
			{ ...view, closed: true },
		);
		assert.deepEqual(patch?.changes, {
			topics: { nullity: { gap: "You forget the free columns" } },
			knowledge: { [knowledgeHandle("Pivots are circled in the notes")]: { text: "Pivots are circled in the notes", topics: ["rank"] } },
			tasks: { "sheet-2": { step: "Exercise 2" } },
		});
	});

	it("is null when nothing changes", () => {
		assert.equal(digestChanges({ topics: [{ handle: "rank", gap: "Old gap", step: "rank-picture" }], knowledge: [], current: "rank" }, view), null);
	});

	it("a new topic needs a title and takes its place after its prerequisite", () => {
		const patch = digestChanges({ topics: [{ handle: "pivot", title: "Pivots", needs: ["rank"], step: "rank-picture" }, { handle: "untitled", step: "rank-picture" }], knowledge: [] }, view);
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

	it("a known fact, restated or reworded, adds no entry: a rewording updates the entry by its handle", () => {
		const restated = { text: "the course writes rank as  $r(A)$.", topics: ["rank"], step: "rank-picture" };
		assert.equal(digestChanges({ topics: [], knowledge: [restated, { ...KNOWN, step: "rank-picture" }] }, view), null);
		const reworded = { handle: KNOWN.handle, text: "Rank is written $r(A)$ in this course, never $\\operatorname{rk}$", topics: ["rank"], step: "rank-picture" };
		const patch = digestChanges({ topics: [], knowledge: [reworded, { ...reworded, handle: undefined, text: `  ${reworded.text}` }] }, view);
		assert.deepEqual(patch?.changes, { knowledge: { [KNOWN.handle]: { text: reworded.text, topics: ["rank"] } } });
	});

	it("states nothing about a plan step the lesson did not reach", () => {
		const patch = digestChanges(
			{
				topics: [
					{ handle: "nullity", note: "You will find the free columns easy", step: "rank-rule" },
					{ handle: "rank", note: "You counted pivots once shown", step: "rank-picture" },
				],
				knowledge: [
					{ text: "The rule: rank plus nullity is the number of columns", topics: ["rank"], step: "rank-rule" },
					{ text: "Rank counts pivots", topics: ["rank"], step: "no-such-step" },
				],
			},
			view,
		);
		assert.deepEqual(patch?.changes, { topics: { rank: { note: "You counted pivots once shown" } } });
		const unplanned = digestChanges({ topics: [{ handle: "nullity", note: "Seen in passing", step: "" }], knowledge: [] }, { ...view, reached: null });
		assert.deepEqual(unplanned?.changes, { topics: { nullity: { note: "Seen in passing" } } }, "a lesson with no plan has no steps to check");
	});

	it("knowledge handles come from the text, so a repeat merges into the same entry", () => {
		assert.equal(knowledgeHandle("The course writes rank as $r(A)$"), knowledgeHandle("The course writes rank as $r(A)$ "));
		assert.notEqual(knowledgeHandle("Rank is r(A)"), knowledgeHandle("Rank is rk(A)"));
	});
});

describe("the digest in a course with arcs", () => {
	const RECORD = {
		arcs: { spaces: { title: "Vector spaces" }, systems: { title: "Linear systems" }, spectra: { title: "Eigenvalues" } },
		path: { arcs: ["spaces", "systems", "spectra"] },
		topics: {
			basis: { title: "Basis", arc: "spaces" },
			rank: { title: "Rank", arc: "systems" },
			nullity: { title: "Nullity", arc: "systems", aliases: ["Dimension of the kernel"] },
			eigen: { title: "Eigenvalues", arc: "spectra" },
		},
	};
	const plain = {
		topics: [
			{ handle: "basis", title: "Basis", introduced: true, gap: null, note: null },
			{ handle: "rank", title: "Rank", introduced: true, gap: null, note: null },
			{ handle: "nullity", title: "Nullity", introduced: false, gap: null, note: null },
			{ handle: "eigen", title: "Eigenvalues", introduced: false, gap: null, note: null },
		],
		current: "rank",
		tasks: [],
		planFinished: false,
		knowledge: [],
		reached: null,
	};
	const arcs = digestArcs(RECORD, ["rank"])!;
	const view = { ...plain, arcs };

	it("reads the arcs and the arc of the lesson's own topics", () => {
		assert.equal(arcs.ownArc, "systems");
		assert.deepEqual(arcs.order.map((a) => a.title), ["Vector spaces", "Linear systems", "Eigenvalues"]);
		assert.equal(digestArcs({ topics: {} }, ["rank"]), undefined, "a course without arcs");
	});

	it("a new topic joins the lesson's arc when its prerequisites allow; otherwise it carries no arc and the engine places it", () => {
		const patch = digestChanges(
			{
				topics: [
					{ handle: "pivots", title: "Pivots", needs: ["rank", "basis"], step: "warm-up" },
					{ handle: "spectral", title: "Spectral radius", needs: ["eigen"], step: "warm-up" },
					{ handle: "power", title: "Power method", needs: ["spectral"], step: "warm-up" },
				],
				knowledge: [],
			},
			view,
		);
		const topics = patch?.changes.topics as Record<string, { arc?: string }>;
		assert.equal(topics.pivots?.arc, "systems");
		assert.equal(topics.spectral?.arc, undefined, "its prerequisite sits in a later arc");
		assert.equal(topics.power?.arc, undefined, "nor can a topic that needs it");
		assert.equal(patch?.summary, "new topic pivots in Linear systems; new topic spectral; new topic power");
		assert.equal(placedIn(patch!.summary, { spectral: "spectra", power: "spectra" }, view), "new topic pivots in Linear systems; new topic spectral in Eigenvalues; new topic power in Eigenvalues");
	});

	it("a new topic that names a course topic it could join is that topic, before anything is created", () => {
		const patch = digestChanges(
			{ topics: [{ handle: "kernel-dimension", title: "Dimension of the kernel", needs: ["rank"], gap: "You count pivots, not free columns", step: "warm-up" }, { handle: "free", title: "Free variables", needs: ["kernel-dimension"], step: "warm-up" }], knowledge: [], current: "kernel-dimension" },
			view,
		);
		assert.deepEqual(patch?.changes.topics, {
			nullity: { introduced: true, gap: "You count pivots, not free columns" },
			free: { title: "Free variables", introduced: true, needs: ["nullity"], arc: "systems" },
		});
		assert.deepEqual((patch?.changes.path as { current: string }).current, "nullity");
		assert.equal(digestProblems({ topics: [{ handle: "kernel-dimension", title: "Dimension of the kernel", step: "warm-up" }], knowledge: [] }, view), null);
	});

	it("a twin in an arc the new topic cannot join goes back to the agent, never folded", () => {
		const answer = { topics: [{ handle: "eigen-basis", title: "Basis", needs: ["eigen"], step: "warm-up" }], knowledge: [] };
		assert.match(digestProblems(answer, view) ?? "", /eigen-basis \("Basis"\) has the name of the course's topic basis \("Basis"\) in "Vector spaces"/);
	});

	it("a course without arcs digests exactly as before: no arc, no fold, no problem", () => {
		const answer = { topics: [{ handle: "kernel-dimension", title: "Dimension of the kernel", needs: ["rank"], step: "warm-up" }], knowledge: [] };
		assert.deepEqual(digestChanges(answer, plain)?.changes.topics, { "kernel-dimension": { title: "Dimension of the kernel", introduced: true, needs: ["rank"] } });
		assert.equal(digestProblems(answer, plain), null);
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
		const chatId = chatWith(closedLesson());
		const course = memoryCourse();
		const seen: string[] = [];
		const stop = subscribe((e) => void seen.push(e.type));
		let dockRow: unknown;
		let prompt = "";
		const digest = createLessonDigest({
			chatStore,
			courseRecords: course.records,
			engine: submitEngine(SUBMIT, (p) => {
				prompt = p;
				dockRow = backgroundRuns().find((r) => r.chatId === chatId);
			}),
		});
		const before = chatStore.getChat(chatId)!.messages;
		const outcome = await digest.digestLesson(chatId);
		stop();
		assert.equal(outcome.status, "saved");
		assert.deepEqual(course.saves, [
			{
				topics: { rank: { gap: "You count rows instead of pivots" } },
				knowledge: { [knowledgeHandle("Pivots are circled in the notes")]: { text: "Pivots are circled in the notes", topics: ["rank"] } },
				tasks: { "sheet-2": { step: "Exercise 2: find the rank of $B$" } },
			},
		]);
		assert.match(prompt, /rank-notation: The course writes rank as/, "the agent reads the course's knowledge with its handles");
		assert.equal((dockRow as { kind?: string; phase?: string })?.kind, "digest");
		assert.equal((dockRow as { phase?: string }).phase, "digesting");
		assert.equal(backgroundRuns().some((r) => r.chatId === chatId), false, "the row leaves when the run ends");
		const after = chatStore.getChat(chatId)!;
		assert.deepEqual(after.messages, before, "nothing posted into the chat");
		assert.equal(after.digest?.done.length, 1);
		assert.equal(after.digest?.pending, undefined);
		assert.deepEqual([...new Set(seen)], ["activity-changed"], "no turn and no record-changed: the tutor is never woken");

		const again = createLessonDigest({ chatStore, courseRecords: course.records, engine: submitEngine(SUBMIT) });
		assert.equal((await again.digestLesson(chatId)).status, "nothing");
		assert.equal(course.saves.length, 1, "the same stretch is never saved twice");
	});

	it("a text the engine refuses goes back to the agent, which rewrites it, and only the rewrite is saved", async () => {
		const chatId = chatWith(closedLesson());
		const REFUSAL = 'topics.rank.gap speaks of the learner as "He", but the learner reads it in their study app: write it to them, as "you", and save again';
		const course = memoryCourse((changes) => (JSON.stringify(changes).includes("He counts") ? REFUSAL : null));
		const thirdPerson = { ...SUBMIT, topics: [{ ...SUBMIT.topics[0]!, gap: "He counts rows instead of pivots" }, SUBMIT.topics[1]!] };
		const digest = createLessonDigest({
			chatStore,
			courseRecords: course.records,
			engine: submitEngine((prompt: string) => (prompt.includes("speaks of the learner") ? SUBMIT : thirdPerson)),
		});
		assert.equal((await digest.digestLesson(chatId)).status, "saved");
		assert.equal(course.saves.length, 1);
		assert.deepEqual((course.saves[0]!.topics as Record<string, unknown>).rank, { gap: "You count rows instead of pivots" });
	});

	it("in a course with arcs, a new topic from a lesson left partway joins the lesson's arc, and the summary names the arc the engine placed the others in", async () => {
		const record = chatStore.createChat("Bases", { workspace: "/courses/linalg", title: "Linear algebra" }, ["basis"]);
		chatStore.saveMessages(record.id, lesson("Pivots it is."));
		chatStore.saveTree(record.id, TREE);
		const course = memoryCourse(() => null, {
			whole: {
				arcs: { spaces: { title: "Vector spaces" }, systems: { title: "Linear systems" } },
				path: { arcs: ["spaces", "systems"] },
				topics: { rank: { title: "Rank", arc: "systems", note: "Reads matrices by rows" }, nullity: { title: "Nullity", arc: "systems" }, basis: { title: "Basis", arc: "spaces" } },
			},
			receipt: { arcs_placed: { pivots: "systems" } },
		});
		const answer = { topics: [{ handle: "pivots", title: "Pivots", needs: ["rank"], step: "rank-picture" }, { handle: "span", title: "Span", step: "rank-picture" }], knowledge: [] };
		const outcome = await createLessonDigest({ chatStore, courseRecords: course.records, engine: submitEngine(answer) }).digestLesson(record.id);
		assert.deepEqual(outcome, { status: "saved", summary: "new topic pivots in Linear systems; new topic span in Vector spaces" });
		const topics = course.saves[0]!.topics as Record<string, { arc?: string }>;
		assert.equal(topics.span?.arc, "spaces", "the lesson's own arc");
		assert.equal(topics.pivots?.arc, undefined, "its prerequisite sits later, so the engine places it");
	});

	it("skips practice sessions and chats with no course", async () => {
		const course = memoryCourse();
		const digest = createLessonDigest({ chatStore, courseRecords: course.records, engine: submitEngine(SUBMIT) });
		const loose = chatStore.createChat("No course");
		chatStore.saveMessages(loose.id, closedLesson());
		assert.equal((await digest.digestLesson(loose.id)).status, "skipped");
		const practice = chatStore.createChat("Drill", { workspace: "/courses/linalg", title: "Linear algebra" });
		chatStore.saveMessages(practice.id, [newSessionModeMessage("practice") as LhMessage, ...closedLesson()]);
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
		const stop = onLessonEvents({
			chatStore,
			digest: { digestLesson: async (id) => (digested.push(id), { status: "nothing" }) },
		});
		return { digested, stop };
	}

	it("a turn that closes a lesson starts the digest, however short the lesson", () => {
		const finished = chatWith(closedLesson());
		const partway = chatWith(lesson(PARTWAY));
		const signedOff = chatWith(lesson(FINISHED));
		const { digested, stop } = listen();
		emit("turn-settled", { chatId: partway });
		emit("turn-settled", { chatId: signedOff });
		emit("turn-settled", { chatId: finished });
		stop();
		assert.deepEqual(digested, [finished], "only the tutor's close finishes a lesson, not words that sound final");
	});

	it("a quiz question waiting on his answer never starts it; the close starts it once", () => {
		const turns = lessonTurns();
		const chatId = chatWith(turns[0]!);
		const { digested, stop } = listen();
		for (const messages of turns) {
			chatStore.saveMessages(chatId, messages);
			emit("turn-settled", { chatId });
		}
		stop();
		assert.deepEqual(digested, [chatId]);
	});

	it("reads the whole lesson at its close, so a gap a later turn showed is never called smooth", async () => {
		const turns = lessonTurns();
		const chatId = chatWith(turns[0]!);
		const course = memoryCourse();
		const prompts: string[] = [];
		const engine = submitEngine((prompt: string) => ({
			topics: [
				prompt.includes("both rows are nonzero")
					? { handle: "rank", gap: "You count nonzero rows instead of pivots", shows: "because both rows are nonzero", note: "Step 1 needed a correction", step: "rank-picture" }
					: { handle: "rank", note: "Step 1 went smoothly", step: "rank-picture" },
			],
			knowledge: [],
		}), (p) => void prompts.push(p));
		const real = createLessonDigest({ chatStore, courseRecords: course.records, engine });
		const runs: Promise<unknown>[] = [];
		const stop = onLessonEvents({ chatStore, digest: { digestLesson: (id) => { const run = real.digestLesson(id); runs.push(run); return run; } } });
		for (const messages of turns) {
			chatStore.saveMessages(chatId, messages);
			emit("turn-settled", { chatId });
			await Promise.all(runs);
		}
		stop();
		assert.equal(prompts.length, 1, "one digest run, at the close");
		assert.equal(JSON.stringify(course.saves).includes("went smoothly"), false);
		assert.deepEqual(course.saves, [{ topics: { rank: { gap: "You count nonzero rows instead of pivots", note: "Step 1 needed a correction" } } }]);
	});

	it("the next lesson of the course digests the one left partway, a waiting quiz question included", () => {
		const partway = chatWith(lesson(PARTWAY));
		const otherCourse = chatWith([newUserMessage("Hi")], "/courses/other");
		const next = chatWith([newUserMessage("Eigenvalues today.")]);
		const { digested, stop } = listen();
		emit("turn-started", { chatId: otherCourse });
		emit("turn-started", { chatId: next });
		const quiz = chatWith(lessonTurns()[1]!);
		const after = chatWith([newUserMessage("Kernels today.")]);
		emit("turn-started", { chatId: after });
		stop();
		assert.deepEqual(digested, [partway, quiz]);
	});

	it("the app's start finishes a digest a quit cut short", () => {
		const cut = chatWith(closedLesson());
		chatStore.saveDigestLedger(cut, { done: [], pending: { fingerprint: "f", throughMessageId: "m" } });
		chatWith(closedLesson());
		const digested: string[] = [];
		resumeCutDigests({ chatStore, digest: { digestLesson: async (id) => (digested.push(id), { status: "nothing" }) } });
		assert.deepEqual(digested, [cut]);
	});
});
