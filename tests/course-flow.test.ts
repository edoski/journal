/**
 * The course-record bridge through the real turn: POST /api/chats links a
 * session to a course the engine lists (and refuses one it does not), and a
 * course-linked practice turn's save reaches the engine for that course.
 * The engine is the fake CLI (tests/fixtures/fake-learning-engine.mjs);
 * the data dir is isolated, so the seams are set before any config import.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-flow-"));
const LOG = path.join(TMP, "engine-calls.jsonl");
const PYTHON = path.join(TMP, "python");
fs.writeFileSync(PYTHON, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
process.env.LH_DATA_DIR = path.join(TMP, "data");
process.env.LH_LEARNING_ENGINE = TMP;
process.env.LH_LEARNING_PYTHON = PYTHON;
process.env.FAKE_ENGINE_LOG = LOG;
process.env.FAKE_ENGINE_PLAN = JSON.stringify({
	today: "2026-11-07",
	courses: [{ workspace: "/study/linalg", title: "Linear Algebra", due: [{ topic: "rank" }], current: "rank" }],
});
process.env.OPENROUTER_API_KEY ??= "test-key-presence-gate";

const { POST: createChatRoute } = await import("../app/api/chats/route.ts");
const { GET: coursesRoute } = await import("../app/api/courses/route.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { createPracticeAgent, createProberAgent } = await import("../src/agent/teacher-agent.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

type Factory = NonNullable<Parameters<typeof handleChatRequest>[1]>;

function engineCalls(): Array<{ args: string[]; stdin: string }> {
	return fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf-8").trim().split("\n").map((l) => JSON.parse(l)) : [];
}

async function createChat(body: Record<string, unknown>): Promise<Response> {
	return createChatRoute(new Request("http://test/api/chats", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	}));
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
	it("GET /api/courses lists the engine's courses", async () => {
		const listing = await (await coursesRoute()).json();
		assert.deepEqual(listing, {
			available: true,
			courses: [{ workspace: "/study/linalg", title: "Linear Algebra", due: 1, current: "rank", task: null }],
		});
	});

	it("POST /api/chats links a listed course with its title, and refuses an unknown one", async () => {
		const res = await createChat({ title: "rank again", kind: "practice", course: { workspace: "/study/linalg" } });
		assert.equal(res.status, 200);
		const { id } = (await res.json()) as { id: string };
		assert.deepEqual(chatStore.getChat(id)?.course, { workspace: "/study/linalg", title: "Linear Algebra" });

		const refused = await createChat({ title: "x", course: { workspace: "/study/vault-course" } });
		assert.equal(refused.status, 400);
		assert.deepEqual(await refused.json(), { error: "Unknown course", code: "unknown_course" });

		const plain = (await (await createChat({ title: "no course" })).json()) as { id: string };
		assert.equal(chatStore.getChat(plain.id)?.course, undefined);
	});
});

describe("a course-linked turn", () => {
	it("practice: the pose carries course topics and the attempt is saved to the linked course", async () => {
		const { id } = (await (await createChat({ title: "practice rank", kind: "practice", course: { workspace: "/study/linalg" } })).json()) as { id: string };
		chatStore.saveSettings(id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
		const observation = { topics: ["rank"], text: "Find the rank of [[1,2],[2,4]].", response: "1, the rows are dependent", help: "none", result: "correct" };
		const engine = scripted([
			() => fauxAssistantMessage([fauxToolCall("course_resume", {}, { id: "r1" })], { stopReason: "toolUse" }),
			() => fauxAssistantMessage([fauxToolCall("problem", {
				statement: "Find the rank of $\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}$.",
				mode: "recall",
				topics: ["rank"],
				modelSolution: "Row 2 is twice row 1, so the rank is 1.",
			}, { id: "p1" })], { stopReason: "toolUse" }),
			() => fauxAssistantMessage([
				fauxToolCall("course_save", { changes: { observations: [observation] } }, { id: "s1" }),
				fauxToolCall("conclude", { outcome: "solved", verdict: "Correct and justified.", rung: null, missClass: null, retest: false }, { id: "c1" }),
			], { stopReason: "toolUse" }),
			() => fauxAssistantMessage([fauxText("Clean.")]),
		]);
		let seenCourse: unknown;
		const factory: Factory = (opts) => {
			seenCourse = opts.course?.course;
			return createPracticeAgent({ chatId: id, chatStore, courseLinked: true }, { ...opts, engine });
		};
		await turn(id, { type: "text", text: "practice rank" }, factory);
		await turn(id, { type: "thinking", problemCallId: "p1", text: "1, the rows are dependent" }, factory);

		assert.deepEqual(seenCourse, { workspace: "/study/linalg", title: "Linear Algebra" });
		const linked = engineCalls().filter((c) => c.args[0] === "--workspace");
		assert.deepEqual(linked.map((c) => c.args.slice(0, 3)), [
			["--workspace", "/study/linalg", "resume"],
			["--workspace", "/study/linalg", "save"],
		]);
		assert.deepEqual(JSON.parse(linked[1]!.stdin), { observations: [observation] });
		const saveResult = chatStore.getChat(id)!.messages.find((m) => (m as { toolName?: string }).toolName === "course_save") as { isError: boolean; content: Array<{ text: string }> };
		assert.equal(saveResult.isError, false);
		assert.deepEqual(JSON.parse(saveResult.content[0]!.text), { revision: 1, changed: true, observations: ["o1"] });
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
		for (const body of [{ title: "linked", course: { workspace: "/study/linalg" } }, { title: "unlinked" }]) {
			const { id } = (await (await createChat(body)).json()) as { id: string };
			chatStore.saveSettings(id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
			await turn(id, { type: "text", text: "teach me rank" }, build(id));
		}
		assert.equal(toggles[0]?.explain, true, "linked: free recall");
		assert.notEqual(toggles[1]?.explain, true, "unlinked: the settings decide");
	});
});
