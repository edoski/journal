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
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

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
process.env.OPENROUTER_API_KEY ??= "test-key-presence-gate";

const { POST: createChatRoute } = await import("../app/api/chats/route.ts");
const { GET: coursesRoute, POST: createCourseRoute } = await import("../app/api/courses/route.ts");
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

async function createCourse(body: Record<string, unknown>): Promise<Response> {
	return createCourseRoute(post("/api/courses", body));
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

function scripted(steps: FauxResponseStep[]) {
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
				{ workspace: LINALG, title: "Linear Algebra", due: 1, current: "rank", task: null },
				{ workspace: RUST, title: "Rust", due: 0, current: null, task: null },
			],
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
});

describe("new course", () => {
	it("creates <root>/<slug>, runs init there, saves the title, and the course is listed", async () => {
		const res = await createCourse({ root: STUDY, title: "  Measure Theory & Probability!  " });
		assert.equal(res.status, 200, await res.clone().text());
		const directory = path.join(STUDY, "measure-theory-probability");
		assert.deepEqual(await res.json(), { workspace: directory, title: "Measure Theory & Probability!", due: 0, current: null, task: null });
		assert.ok(fs.statSync(directory).isDirectory());
		const writes = engineCalls().filter((c) => c.args[0] === "--workspace" && c.args[1] === directory);
		assert.deepEqual(writes.map((c) => c.args.slice(2)), [["init"], ["save"]]);
		assert.deepEqual(JSON.parse(writes[1]!.stdin), { title: "Measure Theory & Probability!" });

		const listing = (await (await coursesRoute()).json()) as { courses: Array<{ workspace: string; title: string }> };
		assert.ok(listing.courses.some((c) => c.workspace === directory && c.title === "Measure Theory & Probability!"));
		const chat = await createChat({ title: "start", course: { workspace: directory } });
		assert.equal(chat.status, 200, "a new course can start a session at once");
	});

	it("slugs to at most 48 characters, and to `course` when the title has no letters or digits", async () => {
		const long = await createCourse({ root: LEARN, title: `${"a".repeat(47)} b c` });
		assert.equal(((await long.json()) as { workspace: string }).workspace, path.join(LEARN, "a".repeat(47)));
		const bare = await createCourse({ root: LEARN, title: "???" });
		assert.equal(((await bare.json()) as { workspace: string }).workspace, path.join(LEARN, "course"));
	});

	it("refuses an existing folder without running the engine, an unknown root, and an empty title", async () => {
		const before = engineCalls().length;
		const exists = await createCourse({ root: STUDY, title: "Linalg" });
		assert.equal(exists.status, 409);
		assert.equal(((await exists.json()) as { code: string }).code, "course_exists");
		assert.deepEqual(engineCalls().slice(before).map((c) => c.args[0]), ["plan"], "only the listing ran: no init on an existing folder");

		const unknownRoot = await createCourse({ root: TMP, title: "Elsewhere" });
		assert.equal(unknownRoot.status, 400);
		assert.equal(((await unknownRoot.json()) as { code: string }).code, "unknown_root");
		assert.equal(fs.existsSync(path.join(TMP, "elsewhere")), false);

		const untitled = await createCourse({ root: STUDY, title: "   " });
		assert.equal(untitled.status, 400);
		assert.equal(((await untitled.json()) as { code: string }).code, "title_required");
	});

	it("an engine failure returns its message and leaves the folder", async () => {
		process.env.FAKE_ENGINE_FAIL = "save";
		const res = await createCourse({ root: STUDY, title: "Topology" });
		assert.equal(res.status, 502);
		assert.deepEqual(await res.json(), { error: "save could not write the record", code: "engine_failed" });
		assert.ok(fs.existsSync(path.join(STUDY, "topology")));
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
		chatStore.saveSettings(id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
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
					result: "correct", response: "1, the rows are dependent", firstTry: { result: "incorrect", response: "2" },
				}, { id: "c1" }),
			], { stopReason: "toolUse" }),
			() => fauxAssistantMessage([fauxText("Clean.")]),
		]);
		let seenCourse: unknown;
		const factory: Factory = (opts) => {
			seenCourse = opts.course?.course;
			return createPracticeAgent({ chatId: id, chatStore }, { ...opts, engine });
		};
		await turn(id, { type: "text", text: "practice rank" }, factory);
		await turn(id, { type: "thinking", problemCallId: "p1", text: "1, the rows are dependent" }, factory);

		assert.deepEqual(seenCourse, { workspace: LINALG, title: "Linear Algebra" });
		const linked = engineCalls().filter((c) => c.args[0] === "--workspace" && c.args[1] === LINALG);
		assert.deepEqual(linked.map((c) => c.args.slice(0, 3)), [
			["--workspace", LINALG, "resume"],
			["--workspace", LINALG, "save"],
		]);
		const statement = "Find the rank of $\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}$.";
		assert.deepEqual(JSON.parse(linked[1]!.stdin), {
			observations: [
				{ topics: ["rank"], text: statement, response: "2", help: "none", result: "incorrect" },
				{ topics: ["rank"], text: statement, response: "1, the rows are dependent", help: "Hint R1: re-described the pattern class", result: "correct" },
			],
		}, "conclude is the single write: the first unaided try, then the assisted success");
		const ack = chatStore.getChat(id)!.messages.find((m) => (m as { toolName?: string }).toolName === "conclude") as { isError: boolean; content: Array<{ text: string }> };
		assert.equal(ack.isError, false);
		assert.match(ack.content[0]!.text, /Course record: \{"revision":1,"changed":true,"observations":\["o1","o2"\]\}/);
	});

	it("probe phase: a course-linked prober quizzes by free recall; an unlinked one keeps the settings", async () => {
		const toggles: Array<Record<string, boolean> | undefined> = [];
		const build = (chatId: string): Factory => (opts) => {
			toggles.push(opts.toolToggles as Record<string, boolean> | undefined);
			return createProberAgent(
				{ chatId, chatStore, deliver: () => {}, jobStore: { createJob: () => { throw new Error("unused"); } } as never, spawn: () => {} },
				{ ...opts, engine: scripted([() => fauxAssistantMessage([fauxText("What do you already know about rank?")])]) },
			);
		};
		const linked = (await (await createChat({ title: "linked", course: { workspace: LINALG } })).json()) as { id: string };
		for (const id of [linked.id, chatStore.createChat("unlinked").id]) {
			chatStore.saveSettings(id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
			await turn(id, { type: "text", text: "teach me rank" }, build(id));
		}
		assert.equal(toggles[0]?.explain, true, "linked: free recall");
		assert.notEqual(toggles[1]?.explain, true, "unlinked: the settings decide");
	});
});
