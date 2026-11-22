/**
 * The course-record bridge through the real routes and turn: every session
 * is created with a course the engine lists, a new course is created
 * through the engine, an older session without a course is linked before
 * it takes a turn, and a course-linked practice turn's save reaches the
 * engine for that course. The engine is the fake CLI
 * (tests/fixtures/fake-learning-engine.mjs); the data dir and the study
 * folders are temporary, so the seams are set before any config import.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxText,
	fauxToolCall,
	type AssistantMessage,
	type FauxResponseFactory,
	type FauxResponseStep,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import { newThinkingMessage } from "../src/core/native-messages.ts";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";
import { fakeEngine, fakeFor, onFake, sendToUser, type ScriptedModel } from "./helpers/fake-sdk.ts";
import { signInTestClaude, TEST_MODEL } from "./claude-fixture.ts";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-flow-")));
const STUDY = path.join(TMP, "vault", "study");
const LEARN = path.join(TMP, "vault", "learn");
const LINALG = path.join(STUDY, "linalg");
const RUST = path.join(LEARN, "rust");
for (const dir of [LINALG, RUST]) fs.mkdirSync(dir, { recursive: true });
const COURSES = [
	{ workspace: LINALG, title: "Linear Algebra", due: [{ topic: "rank" }], current: "rank" },
	{ workspace: RUST, title: "Rust" },
];
const engineFake = useFakeEngine(TMP, COURSES);
process.env.LH_DATA_DIR = path.join(TMP, "data");
await signInTestClaude();

const { POST: createChatRoute } = await import("../app/api/chats/route.ts");
const { GET: coursesRoute, PATCH: renameCourseRoute, DELETE: deleteCourseRoute } = await import("../app/api/courses/route.ts");
const { createCourse: createCourseServer } = await import("../src/server/courses.ts");
const { PUT: linkCourseRoute } = await import("../app/api/chats/[id]/course/route.ts");
const { POST: chatTurnRoute } = await import("../app/api/chat/route.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { createPracticeAgent, createProberAgent } = await import("../src/agent/teacher-agent.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));
afterEach(() => {
	engineFake.setPlan(COURSES);
	delete process.env.FAKE_ENGINE_FAIL;
});

type Factory = NonNullable<Parameters<typeof handleChatRequest>[1]>;

const engineCalls = engineFake.calls;

function post(url: string, body: unknown): Request {
	return new Request(`http://test${url}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function createChat(body: Record<string, unknown>): Promise<Response> {
	return createChatRoute(post("/api/chats", body));
}

/** A new course as the setup conversation makes one (server/setup.ts), its
 *  answer as a response. */
async function createCourse(body: { root?: string; title: string }): Promise<Response> {
	const made = await createCourseServer({ root: body.root ?? "", title: body.title });
	return made.ok ? Response.json(made.course) : Response.json({ error: made.error, code: made.code }, { status: made.status });
}

function send(method: "PATCH" | "DELETE", body: unknown): Request {
	return new Request("http://test/api/courses", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function listed(): Promise<Array<{ workspace: string; title: string }>> {
	return ((await (await coursesRoute()).json()) as { courses: Array<{ workspace: string; title: string }> }).courses;
}

async function linkCourse(id: string, body: unknown): Promise<Response> {
	return linkCourseRoute(
		new Request(`http://test/api/chats/${id}/course`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
		{ params: Promise.resolve({ id }) },
	);
}

async function turn(chatId: string, input: unknown, factory: Factory): Promise<void> {
	const ack = await handleChatRequest(new Request("http://test/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chatId, input }),
	}), factory);
	assert.equal(ack.status, 200, await ack.clone().text());
	const handle = runningTurn(chatId);
	if (handle) await new Response(handle.subscribe()).text();
}

function scripted(steps: FauxResponseStep[]): ScriptedModel {
	const faux = createFauxCore({});
	faux.setResponses(steps.map((step) => async (context: TranscriptContext): Promise<AssistantMessage> =>
		typeof step === "function" ? await (step as FauxResponseFactory)(context, undefined, undefined as never, undefined as never) : step));
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

describe("course chooser routes", () => {
	it("GET /api/courses lists the engine's courses and their parent folders as study roots", async () => {
		const listing = await (await coursesRoute()).json();
		assert.deepEqual(listing, {
			available: true,
			courses: [
				{ workspace: LINALG, title: "Linear Algebra", due: 1, reviews: [{ title: "rank", overdue: 0, gap: null }], current: "rank", currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null },
				{ workspace: RUST, title: "Rust", due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null },
			],
			unreadable: [],
			roots: [LEARN, STUDY],
		});
	});

	it("POST /api/chats links a listed course with its title, and refuses an unknown one or none", async () => {
		const res = await createChat({ title: "rank again", kind: "practice", course: { workspace: LINALG } });
		assert.equal(res.status, 200);
		const { id } = (await res.json()) as { id: string };
		assert.deepEqual(chatStore.getChat(id)?.course, { workspace: LINALG, title: "Linear Algebra" });

		const before = chatStore.listChats().length;
		const unknown = await createChat({ title: "x", course: { workspace: "/study/vault-course" } });
		assert.equal(unknown.status, 400);
		assert.deepEqual(await unknown.json(), { error: "Unknown course", code: "unknown_course" });
		for (const body of [{ title: "no course" }, { title: "empty", course: { workspace: "" } }]) {
			const refused = await createChat(body);
			assert.equal(refused.status, 400);
			assert.deepEqual(await refused.json(), { error: "Pick a course first", code: "course_required" });
		}
		assert.equal(chatStore.listChats().length, before, "a refused creation creates nothing");
	});

	it("POST /api/chats names a lesson opened on a topic after it, keeps a review's words, and the list knows a review by its opening (round 8, 1 D9 and 2 m5)", async () => {
		const lesson = (await (await createChat({ title: "Start Rank and the column space", course: { workspace: LINALG }, topics: ["rank"] })).json()) as { id: string; title: string };
		assert.equal(lesson.title, "Rank and the column space lesson", "named as its task will be (round 16, m4)");
		const review = (await (await createChat({ title: "Review Rank and the column space", course: { workspace: LINALG }, topics: ["rank"] })).json()) as { id: string; title: string };
		assert.equal(review.title, "Review Rank and the column space");
		chatStore.saveMessages(review.id, [{ id: "u1", role: "user", content: "Review Rank and the column space", timestamp: 1 } as never]);
		chatStore.renameChat(review.id, "Rank check");
		const listed = chatStore.listChats().find((c) => c.id === review.id);
		assert.equal(listed?.review, true, "renamed, it is still a review");
		assert.equal(chatStore.listChats().find((c) => c.id === lesson.id)?.review, false);
	});
});

/** Resolves once `check` holds, re-checked on every server event (the map
 *  build announces itself in Activity); the cap only bounds a broken build. */
async function untilEvent(check: () => boolean): Promise<void> {
	if (check()) return;
	const { subscribe } = await import("../src/core/events.ts");
	await new Promise<void>((resolve) => {
		const cap = setTimeout(done, 10_000);
		const stop = subscribe(() => check() && done());
		function done() {
			clearTimeout(cap);
			stop();
			resolve();
		}
	});
}

describe("new course", () => {
	it("makes <root>/<slug> a course with its title alone: init and the title save", async () => {
		const res = await createCourse({ root: LEARN, title: "Topology basics" });
		assert.equal(res.status, 200, await res.clone().text());
		const directory = path.join(LEARN, "topology-basics");
		const writes = engineCalls().filter((c) => c.args[1] === directory);
		assert.deepEqual(writes.map((c) => c.args.slice(2)), [["init"], ["save"]]);
		assert.deepEqual(JSON.parse(writes[1]!.stdin), { title: "Topology basics" });
	});

	it("slugs to at most 48 characters", async () => {
		const long = await createCourse({ root: LEARN, title: `${"a".repeat(47)} b c` });
		assert.equal(((await long.json()) as { workspace: string }).workspace, path.join(LEARN, "a".repeat(47)));
	});

	it("says what is wrong in plain words, and runs no engine write for a refused course", async () => {
		const before = engineCalls().length;
		const refusals: Array<[Parameters<typeof createCourse>[0], number, string]> = [
			[{ root: STUDY, title: "linear algebra" }, 409, "You already have a course called Linear Algebra."],
			[{ root: STUDY, title: "Linalg" }, 409, "Linear Algebra already uses the folder for this title. Pick another title."],
			[{ root: STUDY, title: "???" }, 400, "Use letters or numbers in the title."],
			[{ root: STUDY, title: "   " }, 400, "Give the course a title."],
			[{ root: TMP, title: "Elsewhere" }, 400, "Pick where the course goes."],
			[{ title: "No folder picked" }, 400, "Pick where the course goes."],
		];
		for (const [body, status, error] of refusals) {
			const res = await createCourse(body);
			assert.equal(res.status, status, body.title);
			assert.equal(((await res.json()) as { error: string }).error, error);
		}
		assert.deepEqual([...new Set(engineCalls().slice(before).map((c) => c.args[0]))], ["plan"], "only listings ran");
		assert.equal(fs.existsSync(path.join(TMP, "elsewhere")), false);
	});

	it("an engine failure gives a plain sentence and leaves the folder, and creating again finishes it", async () => {
		process.env.FAKE_ENGINE_FAIL = "save";
		const res = await createCourse({ root: STUDY, title: "Topology" });
		assert.equal(res.status, 502);
		const { error } = (await res.json()) as { error: string };
		assert.equal(error, "LearnHarness could not reach your courses. Try again, and restart the app if it keeps happening.");
		assert.ok(fs.existsSync(path.join(STUDY, "topology")));

		// The real init leaves its manifest and no course record; creating
		// again finishes the job instead of refusing the folder forever.
		fs.mkdirSync(path.join(STUDY, "topology", ".study"));
		fs.writeFileSync(path.join(STUDY, "topology", ".study", "workspace.json"), "{}");
		delete process.env.FAKE_ENGINE_FAIL;
		const retried = await createCourse({ root: STUDY, title: "Topology" });
		assert.equal(retried.status, 200, await retried.clone().text());
	});
});

describe("rename and delete a course", () => {
	it("PATCH saves the new title through the engine; the folder keeps its name", async () => {
		const res = await renameCourseRoute(send("PATCH", { workspace: RUST, title: "  Rust in practice " }));
		assert.equal(res.status, 200, await res.clone().text());
		const save = engineCalls().filter((c) => c.args[1] === RUST && c.args[2] === "save").at(-1)!;
		assert.deepEqual(JSON.parse(save.stdin), { title: "Rust in practice" });
		assert.ok((await listed()).some((c) => c.workspace === RUST && c.title === "Rust in practice"));
	});

	it("PATCH refuses another course's title, a bare title and a course not listed, in plain words", async () => {
		const cases: Array<[unknown, number, string]> = [
			[{ workspace: RUST, title: "LINEAR ALGEBRA" }, 409, "You already have a course called Linear Algebra."],
			[{ workspace: RUST, title: "--" }, 400, "Use letters or numbers in the title."],
			[{ workspace: "/nowhere", title: "Anything" }, 404, "That course is no longer in your list."],
		];
		for (const [body, status, error] of cases) {
			const res = await renameCourseRoute(send("PATCH", body));
			assert.equal(res.status, status);
			assert.equal(((await res.json()) as { error: string }).error, error);
		}
	});

	it("DELETE has the engine forget the course record; it leaves the list and its folder stays", async () => {
		const { stores } = await import("../src/server/stores.ts");
		stores.courseMapLedgers.save(RUST, { done: [{ fingerprint: "f", files: ["notes.md"], at: "2026-11-08T10:00:00Z" }] } as never);
		const { subscribe } = await import("../src/core/events.ts");
		const changes: unknown[] = [];
		const off = subscribe((e) => {
			if (e.type === "courses-changed") changes.push(e);
		});
		const res = await deleteCourseRoute(send("DELETE", { workspace: RUST }));
		off();
		assert.equal(res.status, 200, await res.clone().text());
		assert.deepEqual(changes, [{ type: "courses-changed", deleted: RUST }], "the change names the course, so its open lessons say so with no read of the list (round 13, 4 #4)");
		assert.deepEqual(engineCalls().filter((c) => c.args[1] === RUST).at(-1)!.args.slice(2), ["forget", "--course"]);
		assert.ok(!(await listed()).some((c) => c.workspace === RUST));
		assert.ok(fs.existsSync(RUST));
		assert.equal(stores.courseMapLedgers.get(RUST), undefined, "a course made again in this folder reads its material afresh");
		const again = await deleteCourseRoute(send("DELETE", { workspace: RUST }));
		assert.equal(again.status, 404);
	});
});

describe("a session without a course", () => {
	it("PUT /api/chats/:id/course links a listed course and refuses an unknown one", async () => {
		const chat = chatStore.createChat("from before courses");
		const unknown = await linkCourse(chat.id, { workspace: "/nowhere" });
		assert.equal(unknown.status, 400);
		assert.equal(chatStore.getChat(chat.id)?.course, undefined);
		assert.equal((await linkCourse("chat_missing", { workspace: LINALG })).status, 404);

		const linked = await linkCourse(chat.id, { workspace: LINALG });
		assert.equal(linked.status, 200);
		const record = chatStore.getChat(chat.id)!;
		assert.deepEqual(record.course, { workspace: LINALG, title: "Linear Algebra" });
		assert.equal(record.updatedAt, chat.updatedAt, "linking is not conversation activity");

		const relinked = await linkCourse(chat.id, { workspace: RUST });
		assert.equal(relinked.status, 200, "a session whose course is gone can be linked again");
		assert.deepEqual(chatStore.getChat(chat.id)?.course, { workspace: RUST, title: "Rust" });
	});

	it("POST /api/chat refuses its learner turns with 409 course_required", async () => {
		const chat = chatStore.createChat("from before courses");
		const refused = await chatTurnRoute(post("/api/chat", { chatId: chat.id, input: { type: "text", text: "hello" } }));
		assert.equal(refused.status, 409);
		assert.deepEqual(await refused.json(), { error: "This session has no course yet", code: "course_required" });
		assert.equal(chatStore.getChat(chat.id)!.messages.length, 0);
		const unknown = await chatTurnRoute(post("/api/chat", { chatId: "chat_missing", input: { type: "text", text: "hello" } }));
		assert.equal(unknown.status, 404, "an unknown session still reaches the turn handler");
	});
});

describe("a course-linked turn", () => {
	it("practice: the pose carries course topics and the attempt is saved to the linked course", async () => {
		const { id } = (await (await createChat({ title: "practice rank", kind: "practice", course: { workspace: LINALG } })).json()) as { id: string };
		const engine = scripted([
			() => fauxAssistantMessage([fauxToolCall("course_resume", {}, { id: "r1" })], { stopReason: "toolUse" }),
			() => fauxAssistantMessage([fauxToolCall("problem", {
				statement: "Find the rank of $\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}$.",
				mode: "recall",
				topics: ["rank"],
				modelSolution: "Row 2 is twice row 1, so the rank is 1.",
			}, { id: "p1" })], { stopReason: "toolUse" }),
			() => fauxAssistantMessage([
				fauxToolCall("conclude", {
					outcome: "solvedWithHints", verdict: "Correct after one nudge.", rung: "R1", missClass: "cue", retest: false,
					result: "correct", response: "1, the rows are dependent", record: "Found the rank as 1 after the nudge", firstTry: { result: "incorrect", response: "2", record: "Counted both rows, missing that row 2 is twice row 1", sure: "guessing" },
				}, { id: "c1" }),
			], { stopReason: "toolUse" }),
			() => fauxAssistantMessage([fauxText("Clean.")]),
		]);
		let seenCourse: unknown;
		const factory: Factory = (opts) => {
			seenCourse = opts.course?.course;
			return createPracticeAgent({ chatId: id, chatStore }, { ...opts, ...onFake(engine, opts) });
		};
		await turn(id, { type: "text", text: "practice rank" }, factory);
		// His first try and the nudge, which the conclude's firstTry names (round 16, M2: a first try is an answer of his the session holds).
		const nudge = { id: "a_nudge", role: "assistant", content: [{ type: "text", text: "Not yet. What is row 2 minus twice row 1?" }], stopReason: "stop", timestamp: Date.now() };
		chatStore.saveMessages(id, [...chatStore.getChat(id)!.messages, newThinkingMessage("p1", "2", "guessing"), nudge as never]);
		await turn(id, { type: "thinking", problemCallId: "p1", text: "1, the rows are dependent", confidence: "confident" }, factory);

		assert.deepEqual(seenCourse, { workspace: LINALG, title: "Linear Algebra" });
		const linked = engineCalls().filter((c) => c.args[0] === "--workspace" && c.args[1] === LINALG);
		const verbs = linked.map((c) => c.args[2]);
		// The second turn's brief reads nothing: no course changed since the
		// first read them (round 12, 3 D8: eleven engine processes a turn).
		// The agent's own course_resume reads what the brief read, so it is the
		// brief's run (round 13, N2: one engine run per read of one state).
		assert.deepEqual(verbs.filter((v) => v !== "plan" && v !== "show" && v !== "map"), ["resume", "save"], "the turn brief's resume, which the agent's resume shares, and conclude's save");
		assert.equal(verbs.filter((v) => v === "map").length, 1, "the brief reads every course's daily plan, once");
		assert.equal(verbs.filter((v) => v === "show").length, 1, "each turn asks whether the course has arcs; no record changed between the two, so the second turn's answer is the first's run");
		assert.equal(verbs.filter((v) => v === "plan").length, 1, "the brief reads the daily plan, practice's exam run-up with it, once");
		const save = linked.find((c) => c.args[2] === "save")!;
		const statement = "Find the rank of $\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}$.";
		assert.deepEqual(JSON.parse(save.stdin), {
			observations: [
				{ topics: ["rank"], text: "Counted both rows, missing that row 2 is twice row 1", response: "2", help: "none", result: "incorrect", sure: "guess" },
				{ topics: ["rank"], text: "Found the rank as 1 after the nudge", response: "1, the rows are dependent", help: "Hint R1: re-described the pattern class", result: "correct", sure: "confident" },
			],
		}, "conclude is the single write: the first unaided try, then the assisted success");
		const ack = chatStore.getChat(id)!.messages.find((m) => (m as { toolName?: string }).toolName === "conclude") as { isError: boolean; content: Array<{ text: string }> };
		assert.equal(ack.isError, false);
		assert.match(ack.content[0]!.text, /Course record: \{"revision":1,"changed":true,"observations":\["o1","o2"\]\}/);
	});

	it("practice: Done for today pressed while his answer is graded saves it through conclude, with his Guessing, and its card shows the mark (round 13, 4 M2)", async () => {
		const { id } = (await (await createChat({ title: "practice rank", kind: "practice", course: { workspace: LINALG } })).json()) as { id: string };
		const pose = { statement: "Find the rank of $\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}$.", mode: "recall", topics: ["rank"], modelSolution: "Row 2 is twice row 1, so the rank is 1." };
		const histories: string[] = [];
		let thinking: () => void = () => {};
		const graded = new Promise<void>((resolve) => (thinking = resolve));
		const faux = createFauxCore({});
		faux.setResponses([
			() => fauxAssistantMessage([fauxToolCall("problem", pose, { id: "p1" })], { stopReason: "toolUse" }),
			// The grading turn: still thinking when he presses Done for today.
			((_ctx: unknown, opts: { signal?: AbortSignal } | undefined) =>
				new Promise((resolve) => {
					thinking();
					const cut = () => resolve(fauxAssistantMessage([], { stopReason: "aborted" }));
					if (opts?.signal?.aborted) return cut();
					opts?.signal?.addEventListener("abort", cut, { once: true });
				})) as unknown as FauxResponseStep,
			(context: TranscriptContext) => {
				histories.push(JSON.stringify(context.messages));
				return fauxAssistantMessage([fauxToolCall("conclude", { outcome: "solved", verdict: "Right: row 2 is twice row 1.", rung: null, missClass: null, retest: false, result: "correct", response: "1", record: "Found the rank as 1: row 2 is twice row 1" }, { id: "c1" })], { stopReason: "toolUse" });
			},
			() => sendToUser("Your Rank review comes back on Thursday."),
			() => fauxAssistantMessage(""),
		]);
		const engine: ScriptedModel = { model: faux.getModel(), streamFn: faux.streamSimple };
		const factory: Factory = (opts) => createPracticeAgent({ chatId: id, chatStore }, { ...opts, ...onFake(engine, opts) });
		await turn(id, { type: "text", text: "practice rank" }, factory);
		const saves = () => engineCalls().filter((c) => c.args[1] === LINALG && c.args[2] === "save");
		const before = saves().length;

		const ask = (input: unknown) => handleChatRequest(post("/api/chat", { chatId: id, input }), factory);
		assert.equal((await ask({ type: "thinking", problemCallId: "p1", text: "1, the rows are dependent", confidence: "guessing" })).status, 200);
		const grading = runningTurn(id);
		assert.ok(grading, "the tutor is grading his answer");
		const cut = new Response(grading.subscribe()).text();
		await graded;
		assert.equal((await ask({ type: "tonight" })).status, 200);
		await cut;
		const closing = runningTurn(id);
		if (closing) await new Response(closing.subscribe()).text();

		const messages = chatStore.getChat(id)!.messages;
		assert.equal(messages.some((m) => (m as { customType?: string }).customType === "problem-dismissed"), false, "the answer he sent is not left for next time");
		assert.match(histories[0]!, /UNGRADED WORK/, "the closing turn is told to grade it");
		const [observation] = JSON.parse(saves()[before]!.stdin).observations as Record<string, unknown>[];
		assert.equal(saves().length, before + 1, "one save");
		assert.equal(observation!.result, "correct");
		assert.equal(observation!.sure, "guess", "his Guessing is saved with the attempt");
		const { markLinks } = await import("../src/core/answer-marks.ts");
		const links = markLinks(chatStore.getChat(id)!);
		assert.deepEqual(Object.keys(links), ["c1"], "the attempt marks his answer's card, the problem's conclusion");
		assert.equal(links.c1!.length, 1);
	});

	it("practice: a message sent from Ask concludes nothing and carries no confidence (round 5)", async () => {
		const { id } = (await (await createChat({ title: "practice rank", kind: "practice", course: { workspace: LINALG } })).json()) as { id: string };
		const pose = { statement: "Find the rank of $\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}$.", mode: "recall", topics: ["rank"], modelSolution: "Row 2 is twice row 1, so the rank is 1." };
		const engine = scripted([
			() => fauxAssistantMessage([fauxToolCall("problem", pose, { id: "p1" })], { stopReason: "toolUse" }),
			() => sendToUser("Look at the rows."),
			() => fauxAssistantMessage(""),
			() => fauxAssistantMessage([fauxToolCall("conclude", { outcome: "solved", verdict: "Right.", rung: null, missClass: null, retest: false, result: "correct", response: "1, the rows are dependent", record: "Found the rank as 1 from the dependent rows" }, { id: "c1" })], { stopReason: "toolUse" }),
			() => sendToUser("Send it as your answer when you're ready."),
			() => fauxAssistantMessage(""),
			() => fauxAssistantMessage([fauxToolCall("conclude", { outcome: "surrendered", verdict: "Given up.", rung: null, missClass: null, retest: false, result: "incorrect", response: "no answer", record: "Gave up before finding the rank" }, { id: "c2" })], { stopReason: "toolUse" }),
			() => sendToUser("Here is the solution."),
			() => fauxAssistantMessage(""),
		]);
		const factory: Factory = (opts) => createPracticeAgent({ chatId: id, chatStore }, { ...opts, ...onFake(engine, opts) });
		const saves = () => engineCalls().filter((c) => c.args[2] === "save");
		const before = saves().length;
		await turn(id, { type: "text", text: "practice rank" }, factory);
		await turn(id, { type: "thinking", problemCallId: "p1", text: "maybe 2?", confidence: "guessing" }, factory);
		await turn(id, { type: "text", text: "it's 1, the rows are dependent", asked: true }, factory);

		const messages = chatStore.getChat(id)!.messages;
		const asked = messages.findIndex((m) => (m as { customType?: string }).customType === "asked");
		assert.ok(asked >= 0 && messages[asked + 1]?.role === "user", "an Ask message reaches the tutor marked as a question");
		assert.match(String((messages[asked] as { content: string }).content), /not his answer/);
		const refused = messages.find((m) => (m as { toolCallId?: string }).toolCallId === "c1") as { isError: boolean; content: Array<{ text: string }> };
		assert.equal(refused.isError, true, "a solved conclusion from an Ask message is refused");
		assert.match(refused.content[0]!.text, /Ask/);
		assert.equal(saves().length, before, "nothing was recorded from it");

		await turn(id, { type: "text", text: "just show me", asked: true }, factory);
		const save = saves()[before]!;
		const [observation] = JSON.parse(save.stdin).observations as Record<string, unknown>[];
		assert.equal(observation!.gave_up, true);
		assert.equal("sure" in observation!, false, "the Guessing of an earlier note is not this give-up's confidence");
	});

	it("a course session's agents read his files with Claude Code's tools, told the course folder a search starts in", async () => {
		const faux = scripted([() => fauxAssistantMessage([fauxText("ok")])]);
		const fake = fakeFor(faux);
		const agent = createPracticeAgent(
			{ chatId: "chat_files", chatStore },
			{ engine: fake.engine, course: { course: { workspace: LINALG, title: "Linear Algebra" }, records: {} as never, arcs: false } },
		);
		assert.ok(agent.state.systemPrompt.includes(`This course's folder: ${LINALG}`), "the prompt names the course folder");
		assert.ok(agent.state.systemPrompt.includes(`His home folder: ${os.homedir()}`), "and his home");
		await agent.continue();
		assert.deepEqual(fake.calls[0]!.tools, ["Read", "Grep", "Glob"], "his files are Claude Code's Read, Grep and Glob");
		assert.deepEqual(fake.calls[0]!.allowedTools?.slice(1), ["Read", "Grep", "Glob"], "which run without a permission prompt");
		assert.deepEqual(agent.state.tools.filter((t) => ["read", "ls", "find", "grep"].includes(t.name)), [], "the app has no file tools of its own");
	});

	it("each turn reads whether the course has arcs, and only a course with arcs gets the arcs doctrine (round 4)", async () => {
		const prompts: Array<{ arcs: boolean | undefined; prompt: string }> = [];
		const build = (chatId: string): Factory => (opts) => {
			const agent = createProberAgent(
				{ chatId, chatStore, deliver: () => {}, jobStore: { createJob: () => { throw new Error("unused"); } } as never, spawn: () => {} },
				{ ...opts, ...onFake(scripted([() => fauxAssistantMessage([fauxText("What do you already know about rank?")])]), opts) },
			);
			prompts.push({ arcs: opts.course?.arcs, prompt: agent.state.systemPrompt });
			return agent;
		};
		const flat = (await (await createChat({ title: "no arcs yet", course: { workspace: LINALG } })).json()) as { id: string };
		await turn(flat.id, { type: "text", text: "teach me rank" }, build(flat.id));
		// The course gains arcs the way it does for real: a save, announced.
		process.env.FAKE_ENGINE_SHOW = JSON.stringify({ arcs: { spaces: { title: "Vector spaces" } }, topics: {} });
		(await import("../src/core/events.ts")).emit("course-changed", { workspace: LINALG });
		try {
			const grouped = (await (await createChat({ title: "arcs", course: { workspace: LINALG } })).json()) as { id: string };
			await turn(grouped.id, { type: "text", text: "teach me rank" }, build(grouped.id));
		} finally {
			delete process.env.FAKE_ENGINE_SHOW;
		}
		assert.deepEqual(prompts.map((p) => p.arcs), [false, true]);
		assert.ok(!prompts[0]!.prompt.includes("\n# Arcs\n"), "a course without arcs: no arcs doctrine");
		assert.ok(prompts[1]!.prompt.includes("\n# Arcs\n"), "a course with arcs: its arcs doctrine");
	});

	it("probe phase: a course-linked prober asks by free recall", async () => {
		const tools: string[][] = [];
		const build = (chatId: string): Factory => (opts) => {
			const agent = createProberAgent(
				{ chatId, chatStore, deliver: () => {}, jobStore: { createJob: () => { throw new Error("unused"); } } as never, spawn: () => {} },
				{ ...opts, ...onFake(scripted([() => fauxAssistantMessage([fauxText("What do you already know about rank?")])]), opts) },
			);
			tools.push(agent.state.tools.map((t) => t.name));
			return agent;
		};
		const linked = (await (await createChat({ title: "linked", course: { workspace: LINALG } })).json()) as { id: string };
		await turn(linked.id, { type: "text", text: "teach me rank" }, build(linked.id));
		assert.ok(tools[0]?.includes("recall"), "free recall is the prober's graded tool");
		assert.ok(!tools[0]?.includes("probe"), "no multiple-choice tool exists");
	});
});
