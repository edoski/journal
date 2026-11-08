/**
 * The course brief: a field projection of the engine's resume, re-sent only
 * when its key changes, and injected by the turn handler after the input.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createFauxCore, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-brief-"));
const PYTHON = path.join(TMP, "python");
fs.writeFileSync(PYTHON, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
process.env.LH_DATA_DIR = path.join(TMP, "data");
process.env.LH_LEARNING_ENGINE = TMP;
process.env.LH_LEARNING_PYTHON = PYTHON;
process.env.OPENROUTER_API_KEY ??= "test-key-presence-gate";

const { projectCourseBrief } = await import("../src/core/course-brief.ts");
const { visibleCourseBriefKey, newCourseContextMessage } = await import("../src/core/native-messages.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { createProberAgent } = await import("../src/agent/teacher-agent.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// The real engine's resume on a throwaway course: no focus among two open
// tasks, the current topic's gap and review keys written once under
// `topics`, and a run-up that pushes the most overdue review past the five.
const ENGINE_ROOT = path.resolve(HERE, "..", "..");
const ENGINE_PYTHON = path.join(ENGINE_ROOT, ".venv", "bin", "python");
const realEngine = fs.existsSync(ENGINE_PYTHON);

type Resume = Record<string, unknown>;

/** `resume` with no task in focus, then with ex-5 in focus. */
function realResumes(): { open: Resume; focused: Resume } {
	const home = fs.mkdtempSync(path.join(TMP, "home-"));
	const workspace = fs.mkdtempSync(path.join(TMP, "course-"));
	const engine = (day: string, args: string[], input?: unknown) =>
		execFileSync(ENGINE_PYTHON, ["-m", "learning", "--workspace", workspace, ...args], {
			cwd: ENGINE_ROOT,
			env: { ...process.env, HOME: home, LEARNING_TODAY: day, PYTHONPATH: ENGINE_ROOT },
			input: input === undefined ? undefined : JSON.stringify(input),
		}).toString();
	engine("2026-11-04", ["init"]);
	engine("2026-11-04", ["save"], {
		title: "Linear Algebra",
		exam: { date: "2026-11-17" },
		topics: {
			systems: { title: "Linear systems" },
			pivots: {},
			rank: { title: "Rank", needs: ["systems"], gap: "counts vectors, not independent ones" },
			eigen: { gap: "confuses eigenvalue with eigenvector" },
			t1: {}, t2: {}, t3: {}, t4: {},
		},
		path: { current: "rank", order: ["systems", "pivots", "rank", "eigen", "t1", "t2", "t3", "t4"] },
		tasks: {
			"ex-5": { title: "Exercise 5", goal: "justify uniqueness", step: "eliminate the second row", help: "long help text" },
			"ex-6": { title: "Exercise 6", step: "check the base case" },
		},
		knowledge: { notation: { text: "rows first", pinned: true }, other: { text: "unpinned fact" } },
		preferences: { explanation_length: "short" },
		observations: [
			{ topics: ["systems"], text: "Solve a 2x2 system", help: "none", result: "correct" },
			{ topics: ["rank"], text: "Rank of [[1,2],[2,4]]?", response: "2", help: "none", result: "incorrect", sure: "confident", chose: "pivots" },
		],
	});
	const due = { due: "2026-11-07" };
	engine("2026-11-07", ["save"], {
		topics: {
			systems: { review: { due: "2026-10-29" } },
			rank: { review: { ...due, prompt: "Why is rank the dimension of the column space?", points: ["span", "independence"] } },
			t1: { review: due }, t2: { review: due }, t3: { review: due }, t4: { review: due },
		},
	});
	const open = JSON.parse(engine("2026-11-07", ["resume"])) as Resume;
	engine("2026-11-07", ["save"], { focus: "ex-5" });
	return { open, focused: JSON.parse(engine("2026-11-07", ["resume"])) as Resume };
}

// CI sets LH_REQUIRE_REAL_ENGINE, so a moved venv fails the gate instead of skipping these.
describe("course brief projection of the real engine's resume", { skip: !realEngine && !process.env.LH_REQUIRE_REAL_ENGINE && "learning engine not installed" }, () => {
	let RESUME: Resume = {};
	let FOCUSED: Resume = {};
	before(() => {
		({ open: RESUME, focused: FOCUSED } = realResumes());
	});

	it("teach: the weekday, levels, due topics without review keys, every weak gap, every open task's step, preferences and pinned knowledge", () => {
		const { text } = projectCourseBrief(RESUME, "teach");
		assert.match(text, /^\[Course record\] Linear Algebra · today 2026-11-07 \(Saturday\) · exam in 10 days/);
		assert.match(text, /Path, current rank: systems \(independent\), pivots \(new\), rank \(attempted\)/);
		assert.match(text, /- rank \(attempted\)\n/);
		assert.doesNotMatch(text, /prompt:|points:/, "the teacher fetches review keys on demand");
		assert.match(text, /- rank \(attempted\): counts vectors, not independent ones; sure but wrong ×1/, "the current topic keeps its gap");
		assert.match(text, /- eigen \(new\): confuses eigenvalue with eigenvector/);
		assert.match(text, /Open tasks, none in focus:\n- ex-6: Exercise 6\n {2}next step: check the base case\n- ex-5: Exercise 5\n {2}next step: eliminate the second row/);
		assert.match(text, /- explanation_length: short/);
		assert.match(text, /- notation: rows first/);
		assert.doesNotMatch(text, /unpinned fact|long help text/);
	});

	it("the due backlog shows its total and the most overdue review past the five", () => {
		const { text } = projectCourseBrief(RESUME, "teach");
		assert.match(text, /Due: 6 topics; today's review is the 5 below, 1 more wait, the most overdue among them systems \(9 days overdue\):/);
	});

	it("practice adds the current topic's review prompt, points and gap, and its wrongly chosen method", () => {
		const { text } = projectCourseBrief(RESUME, "practice");
		assert.match(text, /- rank \(attempted\)\n {2}prompt: Why is rank the dimension of the column space\?\n {2}points: span; independence\n {2}gap: counts vectors/);
		assert.match(text, /wrongly chose pivots ×1/);
	});

	it("a focused task shows its goal and step and names the other open tasks", () => {
		const { text } = projectCourseBrief(FOCUSED, "teach");
		assert.match(text, /Open task ex-5: Exercise 5\n {2}goal: justify uniqueness\n {2}next step: eliminate the second row\nOther open tasks: ex-6/);
	});

	it("the key moves with what the brief shows: the day, the due set and backlog, the tasks' steps; not with levels or task order", () => {
		const base = projectCourseBrief(RESUME, "teach").key;
		const tasks = RESUME.tasks as Resume[];
		assert.equal(projectCourseBrief({ ...RESUME, path: { ...(RESUME.path as object), topics: [["rank", "independent"]] } }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, today: "2026-11-08" }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, due: [] }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, tasks: [{ ...tasks[0], step: "next" }, tasks[1]] }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, due_more: undefined, due_oldest: undefined }, "teach").key, base, "clearing the hidden oldest review re-sends the brief");
		assert.equal(projectCourseBrief({ ...RESUME, tasks: [tasks[1], tasks[0]] }, "teach").key, base);
		const focusedKey = projectCourseBrief(FOCUSED, "teach").key;
		const others = FOCUSED.tasks as Resume[];
		assert.equal(projectCourseBrief({ ...FOCUSED, tasks: others.map((t) => ({ ...t, step: "unseen" })) }, "teach").key, focusedKey, "a step the brief does not print leaves the key");
	});
});

describe("course brief markers", () => {
	it("a compaction hides earlier briefs", () => {
		const brief = newCourseContextMessage("b", "k1");
		const compaction = { ...newCourseContextMessage("", "x"), customType: "compaction" as const, details: {} };
		assert.equal(visibleCourseBriefKey([brief as never]), "k1");
		assert.equal(visibleCourseBriefKey([brief as never, compaction as never]), null);
	});
});

describe("course brief injection", () => {
	it("a linked session's learner turn carries one brief; the next turn with the same key adds none", async () => {
		const chat = chatStore.createChat("rank", undefined, { workspace: "/study/linalg", title: "Linear Algebra" });
		chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
		const faux = createFauxCore({});
		faux.setResponses([fauxAssistantMessage([fauxText("Where shall we start?")]), fauxAssistantMessage([fauxText("Go on.")])]);
		const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
		const factory = (opts: never) =>
			createProberAgent({ chatId: chat.id, chatStore, deliver: () => {}, jobStore: {} as never, spawn: () => {} }, { ...(opts as object), engine });
		for (const text of ["teach me rank", "ok"]) {
			const ack = await handleChatRequest(new Request("http://t/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { type: "text", text } }) }), factory as never);
			assert.equal(ack.status, 200);
			const handle = runningTurn(chat.id);
			if (handle) await new Response(handle.subscribe()).text();
		}
		const messages = chatStore.getChat(chat.id)!.messages;
		const briefs = messages.filter((m) => (m as { customType?: string }).customType === "course-context");
		assert.equal(briefs.length, 1);
		const firstUser = messages.findIndex((m) => m.role === "user");
		assert.equal(messages.indexOf(briefs[0]!), firstUser - 1, "the brief precedes the learner's words");
		assert.match((briefs[0] as { content: string }).content, /Due today:\n- rank \(assisted\)/);
	});

	it("an unlinked session gets no brief", async () => {
		const chat = chatStore.createChat("plain");
		const { fetchCourseBrief } = await import("../src/server/course-brief.ts");
		assert.equal(await fetchCourseBrief(chatStore.getChat(chat.id)!), null);
	});
});
