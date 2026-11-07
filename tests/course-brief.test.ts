/**
 * The course brief: a field projection of the engine's resume, re-sent only
 * when its key changes, and injected by the turn handler after the input.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
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

const RESUME = {
	today: "2026-11-07",
	course: { title: "Linear Algebra", exam: { date: "2026-12-01", days_left: 24 } },
	path: { current: "rank", topics: [["systems", "independent"], ["rank", "assisted"]] },
	due: [{ topic: "rank", level: "assisted", overdue: 3, prompt: "Why is rank the dimension of the column space?", points: ["span", "independence"], gap: "counts vectors" }],
	weak: [{ topic: "eigen", level: "attempted", lapsed: true, gap: "confuses eigenvalue with eigenvector", choice_errors: { diagonalize: 2 } }],
	task: { key: "ex-5", title: "Exercise 5", goal: "justify uniqueness", step: "eliminate the second row", help: "long help text" },
	topics: { rank: { title: "Rank", standing: { level: "assisted" } } },
	evidence: [{ id: "o1", text: "a long evidence entry that never enters the brief" }],
	knowledge: { notation: { text: "rows first", pinned: true }, other: { text: "unpinned fact" } },
	preferences: { explanation_depth: "Short first" },
};

describe("course brief projection", () => {
	it("teach: levels, due topics without their review keys, weak gaps, the task step, preferences and pinned knowledge", () => {
		const { text } = projectCourseBrief(RESUME, "teach");
		assert.match(text, /^\[Course record\] Linear Algebra · today 2026-11-07 · exam in 24 days/);
		assert.match(text, /Path, current rank: systems \(independent\), rank \(assisted\)/);
		assert.match(text, /- rank \(assisted, 3 days overdue\)/);
		assert.doesNotMatch(text, /prompt:|points:/, "the teacher fetches review keys on demand");
		assert.match(text, /- eigen \(attempted, lapsed\): confuses eigenvalue with eigenvector/);
		assert.match(text, /next step: eliminate the second row/);
		assert.match(text, /- explanation_depth: Short first/);
		assert.match(text, /- notation: rows first/);
		assert.doesNotMatch(text, /long evidence entry|unpinned fact|long help text/);
	});

	it("practice adds each due topic's review prompt and points, and recurring wrong-method pairs", () => {
		const { text } = projectCourseBrief(RESUME, "practice");
		assert.match(text, /prompt: Why is rank the dimension of the column space\?/);
		assert.match(text, /points: span; independence/);
		assert.match(text, /wrongly chose diagonalize ×2/);
	});

	it("the key moves with the day, the due set and the task step, not with levels", () => {
		const base = projectCourseBrief(RESUME, "teach").key;
		assert.equal(projectCourseBrief({ ...RESUME, path: { ...RESUME.path, topics: [["rank", "independent"]] } }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, today: "2026-11-08" }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, due: [] }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, task: { ...RESUME.task, step: "next" } }, "teach").key, base);
	});

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
		assert.equal(messages.indexOf(briefs[0]!), firstUser + 1, "the brief follows the learner's input");
		assert.match((briefs[0] as { content: string }).content, /Due today:\n- rank \(assisted\)/);
	});

	it("an unlinked session gets no brief", async () => {
		const chat = chatStore.createChat("plain");
		const { courseBriefFor } = await import("../src/server/course-brief.ts");
		assert.equal(await courseBriefFor(chatStore.getChat(chat.id)!, []), null);
	});
});
