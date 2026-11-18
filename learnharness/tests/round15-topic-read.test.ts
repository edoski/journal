/**
 * Round 15, P7 (app speed): the topic page's read showed its one topic, and
 * the engine replays the course's plan to show a topic, so every topic page
 * waited for its own engine run (about 0.8 s, 1.3 s at his courses' size).
 * The engine's item for a topic is the same whatever else is shown beside
 * it, so the page now takes it from one read of every topic of the course,
 * kept until a record changes, and reads the tasks that hold it beside that.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-topic-read-"));
process.env.LH_DATA_DIR = TMP_DATA;
after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const { stores } = await import("../src/server/stores.ts");
const { topicRead } = await import("../src/server/topic.ts");
const { createCourseRecords } = await import("../src/store/course-records.ts");
const HERE = path.dirname(fileURLToPath(import.meta.url));
type CourseRecords = import("../src/core/ports.ts").CourseRecords;
type CourseMap = import("../src/core/contracts/course-map.ts").CourseMap;

const W = "/s/algebra";

function world() {
	const shows: string[][] = [];
	const records: CourseRecords = {
		list: async () => ({ available: true, courses: [{ workspace: W, title: "Algebra", due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null }], unreadable: [] }),
		map: async (workspace) => ({ ok: true, map: { workspace, title: "Algebra", today: "2026-11-14", revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [{ handle: "rank" }, { handle: "kernel" }], edges: [] } as unknown as CourseMap }),
		run: async (_workspace, verb) => {
			if (verb.verb !== "show" || verb.handles === "all") return { ok: false, kind: "io", message: "unused" };
			shows.push([...verb.handles]);
			const items = Object.fromEntries(verb.handles.map((h) => [h, h.startsWith("sheet") ? { kind: "task", updated: "2026-11-10" } : { kind: "topic", observations: [`o-${h}`], refs: [] }]));
			const evidence = Object.fromEntries(verb.handles.filter((h) => !h.startsWith("sheet")).map((h) => [`o-${h}`, { kind: "attempt", result: "correct", date: "2026-11-10", text: `On ${h}`, help: "none", topics: [h] }]));
			return { ok: true, json: { items, evidence, sources: {} } };
		},
		create: async () => ({ ok: false, kind: "io", message: "unused" }),
	};
	stores.courseRecords = records;
	return shows;
}

describe("a topic page reads its course's topics once (round 15, P7)", () => {
	it("two topic pages of one course run one engine show, of every topic", async () => {
		const home = path.join(TMP_DATA, "home");
		const support = path.join(home, "Library", "Application Support", "Learning");
		const workspace = path.join(TMP_DATA, "courses", "algebra");
		fs.mkdirSync(support, { recursive: true });
		fs.mkdirSync(path.join(workspace, ".study"), { recursive: true });
		fs.writeFileSync(path.join(support, "workspaces.json"), JSON.stringify({ schema: 2, workspaces: { [workspace]: {} } }));
		fs.writeFileSync(path.join(workspace, ".study", "course.json"), "{}");
		const python = path.join(TMP_DATA, "python");
		fs.writeFileSync(python, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
		const log = path.join(TMP_DATA, "calls.jsonl");
		const env = {
			...process.env,
			HOME: home,
			VAULT_DIR: path.join(TMP_DATA, "vault"),
			LEARNING_TODAY: "2026-11-10",
			FAKE_ENGINE_LOG: log,
			FAKE_ENGINE_PLAN: JSON.stringify({ today: "2026-11-10", courses: [{ workspace, title: "Algebra" }] }),
			FAKE_ENGINE_MAP: JSON.stringify({ workspace, title: "Algebra", today: "2026-11-10", revision: 1, topics: [{ topic: "rank", title: "Rank", level: "assisted" }, { topic: "kernel", title: "Kernel", level: "new" }] }),
			FAKE_ENGINE_SHOW: JSON.stringify({ items: { rank: { kind: "topic", observations: [] }, kernel: { kind: "topic", observations: [] } } }),
		};
		stores.courseRecords = createCourseRecords({ python, root: TMP_DATA, env });
		const shows = () => fs.readFileSync(log, "utf-8").trim().split("\n").map((l) => (JSON.parse(l) as { args: string[] }).args).filter((a) => a.includes("show")).map((a) => a.slice(a.indexOf("show") + 1).filter((x) => x !== "--"));
		await topicRead(workspace, "rank", [], []);
		await topicRead(workspace, "kernel", [], []);
		assert.deepEqual(shows(), [["rank", "kernel"]]);
	});

	it("takes the topic from the course's read and the tasks that hold it from their own, and shows a topic the map does not list alone", async () => {
		const shows = world();
		const held = await topicRead(W, "rank", ["sheet-4"], []);
		assert.ok(held.body.ok);
		assert.deepEqual(held.body.record?.tasks, [{ key: "sheet-4", updated: "2026-11-10" }]);
		assert.deepEqual(held.body.record?.attempts.map((a) => a.text), ["On rank"]);
		assert.deepEqual(shows.map((s) => s.join(" ")).sort(), ["rank kernel", "sheet-4"], "the course's show, and the tasks' beside it");
		await topicRead(W, "limits", [], []);
		assert.deepEqual(shows.at(-1), ["limits"]);
	});
});
