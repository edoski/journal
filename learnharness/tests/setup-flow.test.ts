/**
 * Setting up something new to learn by conversation (agent/tools/setup.ts,
 * src/server/setup.ts): the prober hands an opening that asks for new
 * learning to the setup agent, which reads the material with fresh readers,
 * creates the course or the self-study on the real engine, links the
 * session to it, and is woken when its map is built. The model is
 * scripted; the engine is the real one, in a temporary home, so nothing
 * touches his own courses or `workspaces.json`.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type Message, type TranscriptContext } from "@earendil-works/pi-ai";
import { fakeEngine, onFake, sendToUser, type ScriptedModel } from "./helpers/fake-sdk.ts";
import { realEngineMissing } from "./helpers/real-engine.ts";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-setup-flow-")));
const HOME = path.join(TMP, "home");
const STUDY = path.join(HOME, "study");
const MLDM = path.join(HOME, "vault", "university", "msc", "MLDM");
fs.mkdirSync(STUDY, { recursive: true });
fs.mkdirSync(path.join(MLDM, "MLDM-LECTURES"), { recursive: true });
fs.writeFileSync(path.join(MLDM, "MLDM-LECTURES", "01-intro.md"), "# Machine learning and data mining\n\n## Week 1: what learning is\n");
fs.writeFileSync(path.join(MLDM, "exam-2025.md"), "# MLDM written exam, 20 January 2026\n\n1. Derive the bias-variance decomposition.\n");
process.env.HOME = HOME;
process.env.VAULT_DIR = path.join(HOME, "vault");
process.env.LEARNING_TODAY = "2026-11-22";
process.env.LH_DATA_DIR = path.join(TMP, "data");

const { signInTestClaude } = await import("./claude-fixture.ts");
await signInTestClaude();
const { LEARNING_ENGINE } = await import("../config.ts");
const { POST: createChatRoute } = await import("../app/api/chats/route.ts");
const { handleChatInput, handleChatRequest } = await import("../src/server/chat-handler.ts");
const { deliverJobResult, setTurnRunner } = await import("../src/server/jobs.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { courseRequired } = await import("../src/server/courses.ts");
const { createLearning, mapNoteText, noteMapBuilt, startSurvey, studyPlaces, surveyNoteText } = await import("../src/server/setup.ts");
const { surveyMaterial } = await import("../src/agent/subagents/material-survey.ts");
const { stores } = await import("../src/server/stores.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { createProberAgent, createSetupAgent } = await import("../src/agent/teacher-agent.ts");
const { setupTools } = await import("../src/agent/tools/setup.ts");
const { newUserMessage, sessionModeOf } = await import("../src/core/native-messages.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));
afterEach(() => setTurnRunner(async () => 200));

const engine = (args: string[], input?: unknown) =>
	JSON.parse(
		execFileSync(LEARNING_ENGINE.python, ["-m", "learning", ...args], {
			cwd: LEARNING_ENGINE.root,
			env: { ...process.env, PYTHONPATH: LEARNING_ENGINE.root },
			input: input === undefined ? undefined : JSON.stringify(input),
		}).toString(),
	);
const record = (dir: string) => engine(["--workspace", dir, "show", "--all"]);

/** A course he already has, so his study folder is known. */
function existingCourse(): string {
	const dir = path.join(STUDY, "linear-algebra");
	if (fs.existsSync(path.join(dir, ".study", "course.json"))) return dir;
	fs.mkdirSync(dir, { recursive: true });
	engine(["--workspace", dir, "init"]);
	engine(["--workspace", dir, "save"], { title: "Linear Algebra" });
	return dir;
}

function systemOf(context: TranscriptContext): { tools: string[]; prompt: string } {
	const system = context.messages.find((m) => m.role === "system");
	assert.ok(system && system.role === "system");
	const prompt = typeof system.content === "string" ? system.content : system.content.map((c) => c.text).join("");
	return { tools: (system.toolsAdded ?? []).map((t) => t.name), prompt };
}
const lastInput = (messages: Message[]) => JSON.stringify([...messages].reverse().find((m) => m.role === "user")?.content ?? "");
const call = (name: string, args: unknown, id: string) => fauxAssistantMessage([fauxToolCall(name, args as never, { id })], { stopReason: "toolUse" });

type Seen = { agent: string; tools: string[]; prompt: string; last: string };

/** One scripted model for every agent of the session, and the handler seam
 *  that builds whichever agent the handler's fold picked. */
function session(chatId: string, steps: Array<(seen: Seen) => ReturnType<typeof call>>) {
	const agents: string[] = [];
	const faux = createFauxCore({});
	faux.setResponses(steps.map((step) => (context: TranscriptContext) => step({ agent: agents.at(-1)!, ...systemOf(context), last: lastInput(context.messages) })));
	const scripted: ScriptedModel = { model: faux.getModel(), streamFn: faux.streamSimple };
	const deliver = (steer: Parameters<typeof deliverJobResult>[0]) => void deliverJobResult(steer);
	const factory: NonNullable<Parameters<typeof handleChatRequest>[1]> = (opts) => {
		agents.push(opts.agent);
		const built = { ...opts, ...onFake(scripted, opts) };
		if (opts.agent === "setup") {
			return createSetupAgent(
				{ chatId, chatStore, deliver, survey: () => ({ started: true }), create: (input) => createLearning(chatId, input), jobs: { chatId, jobStore, spawn: () => {} } },
				built,
			);
		}
		return createProberAgent({ chatId, chatStore, jobStore, spawn: () => {}, deliver, leaveCourse: () => chatStore.leaveCourse(chatId) }, built);
	};
	setTurnRunner(async (cid, input) => {
		const ack = await handleChatInput(cid, input, factory);
		const handle = runningTurn(cid);
		if (handle) await new Response(handle.subscribe()).text();
		return ack.status;
	});
	return { agents, factory };
}

async function send(chatId: string, text: string, factory: NonNullable<Parameters<typeof handleChatRequest>[1]>) {
	const ack = await handleChatRequest(new Request("http://test/api/chat", { method: "POST", body: JSON.stringify({ chatId, input: { type: "text", text } }) }), factory);
	assert.equal(ack.status, 200, await ack.clone().text());
	const handle = runningTurn(chatId);
	if (handle) await new Response(handle.subscribe()).text();
}

/** Resolves once `cond` holds, re-checked as each turn settles. */
function settled(cond: () => boolean, what: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const tick = () => (cond() ? resolve() : Date.now() - started > 15_000 ? reject(new Error(`timeout waiting for ${what}`)) : setTimeout(tick, 20));
		tick();
	});
}

describe("a setup session", () => {
	it("starts with no course and takes his turns, a lesson with no course still does not", async () => {
		const res = await createChatRoute(new Request("http://test/api/chats", { method: "POST", body: JSON.stringify({ title: "Set up my MLDM course", kind: "setup" }) }));
		assert.equal(res.status, 200);
		const { id } = (await res.json()) as { id: string };
		const chat = chatStore.getChat(id)!;
		assert.equal(chat.course, undefined);
		assert.equal(sessionModeOf(chat.messages), "setup");
		assert.equal(courseRequired(id), false, "a setup session takes his turns before it has a course");
		const lesson = chatStore.createChat("old lesson");
		assert.equal(courseRequired(lesson.id), true);
	});
});

describe("the setup tools", () => {
	it("refuse a second creation, an exam on a self-study, a self-study without its goal, and the first lesson before anything is made", async () => {
		const chat = chatStore.createChat("tools");
		let created = 0;
		const tools = setupTools({ chatId: chat.id, chatStore, deliver: () => {}, survey: () => ({ started: true }), create: async () => (created++, { ok: true, workspace: "/x", title: "X", kind: "course" }) });
		const run = (name: string, args: unknown) => tools[name]!.execute("c", args as never, undefined, undefined);
		assert.equal((await run("teach", { topic: "x", reason: "start" })).isError, true, "no first lesson before it is made");
		assert.equal((await run("create_learning", { kind: "self-study", title: "Git rebase", goal: "Rebase well", exam: { date: "2026-12-01" }, asked: "learn git rebase" })).isError, true);
		assert.equal((await run("create_learning", { kind: "self-study", title: "Git rebase", asked: "learn git rebase" })).isError, true);
		assert.equal(created, 0);
		chatStore.linkCourse(chat.id, { workspace: "/x", title: "X" });
		const again = await run("create_learning", { kind: "course", title: "Y", asked: "set up Y" });
		assert.equal(again.isError, true);
		assert.match(JSON.stringify(again.content), /set up already/);
	});

	it("survey_material refuses a folder, naming the fix", () => {
		const started = startSurvey("chat_x", [MLDM]);
		assert.ok("error" in started && /list the files in it with Glob/.test(started.error));
	});
});

describe("creating on the real engine", { skip: realEngineMissing(LEARNING_ENGINE.python) }, () => {
	it("makes the folder of his material the course, registers its files, keeps his words for the arcs and links the session", async () => {
		existingCourse();
		const chat = chatStore.createChat("Set up MLDM");
		const made = await createLearning(chat.id, {
			kind: "course",
			title: "Machine Learning and Data Mining",
			folder: MLDM,
			exam: { date: "2027-01-20" },
			asked: "Set up my MLDM course",
		});
		assert.ok(made.ok, JSON.stringify(made));
		assert.equal(made.workspace, MLDM);
		const saved = record(MLDM);
		assert.equal(saved.title, "Machine Learning and Data Mining");
		assert.equal(saved.exam.date, "2027-01-20");
		assert.deepEqual(Object.values(saved.sources as Record<string, { path: string }>).map((s) => s.path).sort(), [MLDM, "MLDM-LECTURES/01-intro.md", "exam-2025.md"], "its folder is linked, so files he adds there later are read too");
		assert.deepEqual(chatStore.getChat(chat.id)!.course, { workspace: MLDM, title: "Machine Learning and Data Mining" });
		const ledger = stores.arcPassLedgers.get(MLDM);
		assert.equal(ledger?.state, "new", "its arcs are cut once its map is built");
		assert.equal(ledger?.asked, "Set up my MLDM course", "his words let the arcs form once he has begun studying");
		const again = await createLearning(chatStore.createChat("again").id, { kind: "course", title: "MLDM again", folder: MLDM, asked: "again" });
		assert.ok(!again.ok && /already a course/.test(again.error));
	});

	it("makes a self-study in his study folder with its goal, no exam and the self-study kind", async () => {
		existingCourse();
		const chat = chatStore.createChat("Git rebase");
		const made = await createLearning(chat.id, {
			kind: "self-study",
			title: "Git rebase",
			goal: "Rebase a feature branch onto main without losing work",
			websites: [{ address: "https://git-scm.com/book/en/v2/Git-Branching-Rebasing", title: "Pro Git: Rebasing" }, { address: "git-scm.com/docs/git-rebase" }],
			asked: "I want to learn git rebase well",
		});
		assert.ok(made.ok, JSON.stringify(made));
		assert.equal(path.dirname(made.workspace), STUDY, "a self-study with no folder goes where his courses are");
		const saved = record(made.workspace);
		assert.equal(saved.preferences.kind, "self-study");
		assert.equal(saved.goal, "Rebase a feature branch onto main without losing work");
		assert.equal(saved.exam?.date, undefined);
		assert.deepEqual(Object.values(saved.sources as Record<string, { path: string }>).map((s) => s.path).sort(), ["https://git-scm.com/book/en/v2/Git-Branching-Rebasing", "https://git-scm.com/docs/git-rebase"], "its open websites, in the one save with its facts");
		assert.equal(chatStore.getChat(chat.id)?.course?.workspace, made.workspace);
	});

	it("lists his study folders, his university folder and his downloads for the agent to look in first", async () => {
		existingCourse();
		fs.mkdirSync(path.join(HOME, "Downloads"), { recursive: true });
		const places = await studyPlaces();
		assert.ok(places.some((p) => p.startsWith(`${STUDY}:`) && p.includes("Linear Algebra")), places.join("\n"));
		assert.ok(places.some((p) => p.startsWith(path.join(HOME, "vault", "university"))), places.join("\n"));
		assert.ok(places.some((p) => p.startsWith(path.join(HOME, "Downloads"))));
	});
});

describe("end to end, scripted model on the real engine", { skip: realEngineMissing(LEARNING_ENGINE.python) }, () => {
	it("his opening in a course lesson asking for something new hands off to setup, which creates it and takes over its corrections", async () => {
		const linalg = existingCourse();
		const chat = chatStore.createChat("I want to learn git bisect well", { workspace: linalg, title: "Linear Algebra" });
		chatStore.saveMessages(chat.id, []);
		const { agents, factory } = session(chat.id, [
			(seen) => {
				assert.equal(seen.agent, "prober");
				assert.ok(seen.tools.includes("setup"), "the prober can hand his opening to setup");
				return call("setup", { what: "learn git bisect well" }, "h-setup");
			},
			(seen) => {
				assert.equal(seen.agent, "setup");
				assert.match(seen.last, /\[SETUP\]/);
				for (const tool of ["survey_material", "create_learning", "teach", "research"]) assert.ok(seen.tools.includes(tool), `setup has ${tool}`);
				assert.ok(!seen.tools.includes("course_save"), "no course tools before it makes one: the lesson's course is left");
				assert.ok(seen.prompt.includes("Where his study material is kept"), "it is told where to look first");
				return call("create_learning", { kind: "self-study", title: "Git bisect", goal: "Find the commit that broke a build", asked: "I want to learn git bisect well" }, "c-create");
			},
			() => sendToUser("Git bisect is set up as a self-study: no exam and no reviews, and it's done once you've learned every topic."),
			() => fauxAssistantMessage(""),
			(seen) => {
				assert.equal(seen.agent, "setup");
				assert.ok(seen.tools.includes("course_save"), "once made, the course tools correct it");
				return sendToUser("Done.");
			},
			() => fauxAssistantMessage(""),
		]);
		await send(chat.id, "I want to learn git bisect well", factory);
		await settled(() => agents.length >= 2 && runningTurn(chat.id) === undefined && !!chatStore.getChat(chat.id)?.course, "the setup agent's creation");
		const linked = chatStore.getChat(chat.id)!;
		assert.equal(linked.course?.title, "Git bisect");
		assert.equal(sessionModeOf(linked.messages), "setup");
		assert.equal(record(linked.course!.workspace).preferences.kind, "self-study");
		await send(chat.id, "thanks", factory);
		assert.deepEqual(agents, ["prober", "setup", "setup"]);
	});
});

describe("the setup's wakes", () => {
	it("the survey's readers sort each file; the note lists them and what could not be read", async () => {
		// Each reader reads its own file and submits once; the readers run side by side.
		const reader = (context: TranscriptContext) =>
			/The file: exam/.test(lastInput(context.messages))
				? call("submit_file", { kind: "past-exam", title: "MLDM written exam", covers: "Bias and variance", exam: { date: "2026-01-20" } }, `s-${Math.random()}`)
				: call("submit_file", { kind: "slides", title: "Machine learning and data mining", covers: "Week 1: what learning is" }, `s-${Math.random()}`);
		const faux = createFauxCore({});
		faux.setResponses([reader, reader]);
		const engineFake = fakeEngine({ model: faux.getModel(), streamFn: faux.streamSimple });
		const survey = await surveyMaterial({ engineFor: () => engineFake }, [path.join(MLDM, "exam-2025.md"), path.join(MLDM, "MLDM-LECTURES", "01-intro.md"), path.join(MLDM, "missing.pdf")], { chatId: "chat_s", label: "MLDM" });
		assert.ok(!("error" in survey));
		assert.deepEqual(survey.files.map((f) => f.kind).sort(), ["past-exam", "slides"]);
		assert.equal(survey.unread.length, 1);
		const note = surveyNoteText(survey);
		assert.match(note, /past-exam, "MLDM written exam"/);
		assert.match(note, /missing\.pdf: not read/);
	});

	it("a course's first map wakes its setup session once, and no lesson", async () => {
		const workspace = path.join(TMP, "wake-course");
		const setupChat = chatStore.createChat("setup", { workspace, title: "Wake" });
		chatStore.saveMessages(setupChat.id, [{ id: "m", role: "custom", customType: "session-mode", content: "", display: false, details: { mode: "setup" }, timestamp: 1 } as never, newUserMessage("set it up")]);
		const lesson = chatStore.createChat("lesson", { workspace, title: "Wake" });
		const woken: string[] = [];
		setTurnRunner(async (cid, input) => {
			woken.push(cid);
			return handleChatInput(cid, input, () => {
				throw new Error("no agent in this test");
			}).then((r) => r.status);
		});
		const status = { state: "built" as const, outcome: "12 new topics", at: "2026-11-22T10:00:00Z" };
		noteMapBuilt(workspace, status);
		await settled(() => chatStore.getChat(setupChat.id)!.messages.some((m) => m.id.startsWith("steer_setup_map_")), "the map note");
		noteMapBuilt(workspace, { ...status, at: "2026-11-22T11:00:00Z" });
		assert.equal(chatStore.getChat(setupChat.id)!.messages.filter((m) => m.id.startsWith("steer_setup_map_")).length, 1, "a later build wakes no one");
		assert.ok(!woken.includes(lesson.id));
		assert.match(mapNoteText(status), /\[MAP READY\].*12 new topics/);
	});
});
