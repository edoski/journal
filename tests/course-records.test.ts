/**
 * The course-record bridge, below the turn: the engine adapter (against a
 * fake engine with the CLI's argv and JSON shapes, and against the real
 * engine on a throwaway course when it is installed), the course tools, and
 * their composition into every agent kind.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createCourseRecords } from "../src/store/course-records.ts";
import { courseTools } from "../src/agent/tools/course.ts";
import { createPracticeAgent, createProberAgent, createTeacherAgent } from "../src/agent/teacher-agent.ts";
import { createFauxCore } from "@earendil-works/pi-ai";
import type { CourseRecords } from "../src/core/ports.ts";
import type { CourseVerb } from "../src/core/contracts/course.ts";
import type { ChatStore, JobStore } from "../src/core/ports.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-records-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** A `python` that runs the fake engine, plus the log of its calls. */
function fakeEngine(plan?: unknown) {
	const dir = fs.mkdtempSync(path.join(TMP, "engine-"));
	const python = path.join(dir, "python");
	fs.writeFileSync(python, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
	const log = path.join(dir, "calls.jsonl");
	const env = { ...process.env, FAKE_ENGINE_LOG: log, ...(plan ? { FAKE_ENGINE_PLAN: JSON.stringify(plan) } : {}) };
	const calls = () =>
		fs.existsSync(log)
			? fs.readFileSync(log, "utf-8").trim().split("\n").map((l) => JSON.parse(l) as { args: string[]; stdin: string })
			: [];
	return { engine: { python, root: dir, env }, calls };
}

describe("course records adapter (fake engine)", () => {
	it("lists registered courses from plan --all, with due counts including due_more", async () => {
		const { engine, calls } = fakeEngine({
			today: "2026-11-07",
			courses: [
				{ workspace: "/s/smm", title: "SMM", due: [{ topic: "a" }, { topic: "b" }], due_more: 3, current: "rank", task: { key: "t", title: "Exercise 5" } },
				{ workspace: "/s/bare" },
				{ title: "no workspace, skipped" },
				{ workspace: "/s/broken", error: "course.json is not valid JSON" },
			],
		});
		const listing = await createCourseRecords(engine).list();
		assert.deepEqual(listing, {
			available: true,
			courses: [
				{ workspace: "/s/smm", title: "SMM", due: 5, current: "rank", task: "Exercise 5" },
				{ workspace: "/s/bare", title: null, due: 0, current: null, task: null },
			],
		});
		assert.deepEqual(calls()[0]!.args, ["plan", "--all", "--days", "1"]);
	});

	it("a save sends the patch on stdin to the selected workspace and returns the receipt", async () => {
		const { engine, calls } = fakeEngine();
		const changes = { observations: [{ topics: ["rank"], text: "Rank of [[1,2],[2,4]]?", response: "1", help: "none", result: "correct" }] };
		const result = await createCourseRecords(engine).run("/s/linalg", { verb: "save", changes });
		assert.deepEqual(result, { ok: true, json: { revision: 1, changed: true, observations: ["o1"] } });
		const call = calls()[0]!;
		assert.deepEqual(call.args, ["--workspace", "/s/linalg", "save"]);
		assert.deepEqual(JSON.parse(call.stdin), changes);
	});

	it("operands follow -- so a query or handle that looks like a flag stays an operand", async () => {
		const { engine, calls } = fakeEngine();
		const records = createCourseRecords(engine);
		await records.run("/w", { verb: "search", query: "--all eigen" });
		await records.run("/w", { verb: "show", handles: ["rank", "o3"] });
		await records.run("/w", { verb: "show", handles: "all" });
		await records.run("/w", { verb: "resume", task: "ex-5" });
		assert.deepEqual(calls().map((c) => c.args.slice(2)), [
			["search", "--", "--all eigen"],
			["show", "--", "rank", "o3"],
			["show", "--all"],
			["resume", "--task", "ex-5"],
		]);
	});

	it("maps the engine's validation error, non-JSON output, a timeout and a missing interpreter", async () => {
		const { engine } = fakeEngine();
		const records = createCourseRecords({ ...engine, timeoutMs: 1_000 });
		const refused = await records.run("/w", { verb: "save", changes: { observations: [{ topics: ["unknown"], text: "x" }] } });
		assert.equal(refused.ok, false);
		assert.equal(!refused.ok && refused.kind, "validation");
		assert.match(!refused.ok ? refused.message : "", /unknown topic "unknown"/);
		const garbled = await records.run("/w", { verb: "show", handles: ["garbled"] });
		assert.deepEqual(garbled, { ok: false, kind: "io", message: "show printed output that is not JSON" });
		const slow = await records.run("/w", { verb: "show", handles: ["slow"] });
		assert.equal(!slow.ok && slow.kind, "io");
		assert.match(!slow.ok ? slow.message : "", /did not finish in time/);
		const moved = await records.run("/study/missing-course", { verb: "resume" });
		assert.equal(!moved.ok && moved.kind, "unavailable", "a moved workspace is not a repairable validation error");
		const missing = createCourseRecords({ python: path.join(TMP, "no-such-python"), root: TMP });
		assert.equal((await missing.run("/w", { verb: "resume" })).ok, false);
		const listing = await missing.list();
		assert.equal(listing.available, false);
	});
});

describe("course records adapter: create (fake engine)", () => {
	it("runs init in the directory, then saves the title to the workspace init reports", async () => {
		const { engine, calls } = fakeEngine();
		const created = await createCourseRecords(engine).create("/s/new", "New Course");
		assert.deepEqual(created, { ok: true, workspace: "/s/new" });
		assert.deepEqual(calls().map((c) => [c.args, c.stdin]), [
			[["--workspace", "/s/new", "init"], ""],
			[["--workspace", "/s/new", "save"], JSON.stringify({ title: "New Course" })],
		]);
	});

	it("a failed init stops before the save and returns the engine's message", async () => {
		const { engine, calls } = fakeEngine();
		const created = await createCourseRecords({ ...engine, env: { ...engine.env, FAKE_ENGINE_FAIL: "init" } }).create("/s/new", "New Course");
		assert.deepEqual(created, { ok: false, kind: "io", message: "init could not write the record" });
		assert.deepEqual(calls().map((c) => c.args[2]), ["init"]);
	});
});

/** An in-memory CourseRecords that records every verb. */
function memoryRecords(answer: (verb: CourseVerb) => Awaited<ReturnType<CourseRecords["run"]>>) {
	const seen: Array<{ workspace: string; verb: CourseVerb }> = [];
	const records: CourseRecords = {
		list: async () => ({ available: true, courses: [] }),
		run: async (workspace, verb) => {
			seen.push({ workspace, verb });
			return answer(verb);
		},
		create: async () => {
			throw new Error("unused");
		},
	};
	return { records, seen };
}

const COURSE = { workspace: "/s/linalg", title: "Linear Algebra" };

describe("course tools", () => {
	it("are bound to the session's course and return the engine JSON verbatim", async () => {
		const { records, seen } = memoryRecords(() => ({ ok: true, json: { revision: 2, observations: ["o4"] } }));
		const tools = courseTools({ course: COURSE, records });
		assert.deepEqual(Object.keys(tools).sort(), ["course_resume", "course_save", "course_search", "course_show"]);
		assert.match(tools.course_save!.description, /Linear Algebra/);
		const changes = { observations: [{ topics: ["rank"], text: "q", help: "none", result: "partial" }] };
		const result = await tools.course_save!.execute("call-1", { changes }, undefined);
		assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), { revision: 2, observations: ["o4"] });
		assert.deepEqual(seen, [{ workspace: "/s/linalg", verb: { verb: "save", changes } }]);
	});

	it("a refused save fails the call with the engine's repair message", async () => {
		const { records } = memoryRecords(() => ({ ok: false, kind: "validation", message: 'unknown topic "nope"; create it in the same patch' }));
		const tools = courseTools({ course: COURSE, records });
		await assert.rejects(
			() => tools.course_save!.execute("call-2", { changes: { observations: [] } }, undefined) as Promise<unknown>,
			/Nothing was saved or read\. unknown topic "nope"/,
		);
	});

	it("show needs handles or all", async () => {
		const { records, seen } = memoryRecords(() => ({ ok: true, json: {} }));
		const tools = courseTools({ course: COURSE, records });
		await assert.rejects(() => tools.course_show!.execute("c", {}, undefined) as Promise<unknown>, /Pass handles, or all: true/);
		await tools.course_show!.execute("c", { all: true }, undefined);
		assert.deepEqual(seen.map((s) => s.verb), [{ verb: "show", handles: "all" }]);
	});
});

describe("course composition into the agents", () => {
	const chatStore = { getChat: () => ({ messages: [] }) } as unknown as ChatStore;
	const jobStore = {} as JobStore;
	const { records } = memoryRecords(() => ({ ok: true, json: {} }));
	const faux = createFauxCore({});
	const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const builds = {
		prober: (course?: { course: typeof COURSE; records: CourseRecords }) =>
			createProberAgent({ chatId: "c1", chatStore, deliver: () => {}, jobStore, spawn: () => {} }, course ? { course, engine } : { engine }),
		teacher: (course?: { course: typeof COURSE; records: CourseRecords }) =>
			createTeacherAgent({ chatId: "c1", chatStore, jobStore, spawn: () => {} }, course ? { course, engine } : { engine }),
		practice: (course?: { course: typeof COURSE; records: CourseRecords }) =>
			createPracticeAgent({ chatId: "c1", chatStore }, course ? { course, engine } : { engine }),
	};
	for (const [kind, build] of Object.entries(builds)) {
		it(`${kind}: a linked session gets the course tools and doctrine; an unlinked one gets neither`, () => {
			const linked = build({ course: COURSE, records });
			const names = linked.state.tools.map((t) => t.name);
			for (const name of ["course_resume", "course_show", "course_search", "course_save"]) assert.ok(names.includes(name), name);
			assert.match(linked.state.systemPrompt, /## The course record/);
			const plain = build();
			assert.ok(!plain.state.tools.some((t) => t.name.startsWith("course_")));
			assert.doesNotMatch(plain.state.systemPrompt, /The course record/);
		});
	}
});

const ENGINE_ROOT = path.join(os.homedir(), "dev", "python", "journal");
const ENGINE_PYTHON = path.join(ENGINE_ROOT, ".venv", "bin", "python");
const realEngine = fs.existsSync(ENGINE_PYTHON) && fs.existsSync(path.join(ENGINE_ROOT, "learning", "cli.py"));

describe("course records adapter (the real engine, throwaway course)", { skip: !realEngine && "learning engine not installed" }, () => {
	it("a save lands under the engine's own rules and a fresh resume reflects it", async () => {
		const home = fs.mkdtempSync(path.join(TMP, "home-"));
		const workspace = fs.mkdtempSync(path.join(TMP, "course-"));
		const env = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-07" };
		execFileSync(ENGINE_PYTHON, ["-m", "learning", "--workspace", workspace, "init"], { cwd: ENGINE_ROOT, env: { ...env, PYTHONPATH: ENGINE_ROOT } });
		const records = createCourseRecords({ python: ENGINE_PYTHON, root: ENGINE_ROOT, env });

		const saved = await records.run(workspace, {
			verb: "save",
			changes: {
				title: "Scratch algebra",
				topics: { rank: { title: "Rank of a matrix", introduced: true } },
				observations: [
					{ topics: ["rank"], text: "Rank of [[1,2],[2,4]]?", response: "2", help: "none", result: "incorrect" },
					{ topics: ["rank"], text: "Rank of [[1,2],[2,4]]?", response: "1", help: "Pointed at the dependent row", result: "correct" },
				],
			},
		});
		assert.ok(saved.ok, !saved.ok ? saved.message : "");
		const receipt = saved.json as { observations: string[]; levels: Record<string, { to: string }> };
		assert.deepEqual(receipt.observations, ["o1", "o2"]);
		assert.equal(receipt.levels.rank?.to, "assisted");

		const listing = await records.list();
		assert.ok(listing.available);
		assert.deepEqual(
			listing.courses.map((c) => [fs.realpathSync(c.workspace), c.title]),
			[[fs.realpathSync(workspace), "Scratch algebra"]],
			"the temp home's registry lists only the throwaway course",
		);

		const refused = await records.run(workspace, { verb: "save", changes: { observations: [{ topics: ["nope"], text: "x", help: "none", result: "correct" }] } });
		assert.equal(!refused.ok && refused.kind, "validation");

		const resumed = await records.run(workspace, { verb: "resume" });
		assert.ok(resumed.ok);
		const text = JSON.stringify(resumed.json);
		assert.match(text, /Scratch algebra/);
		assert.match(text, /"rank"/);
	});

	it("create makes a new folder a titled course that the listing shows at once", async () => {
		const home = fs.mkdtempSync(path.join(TMP, "home-"));
		const directory = path.join(fs.mkdtempSync(path.join(TMP, "root-")), "measure-theory");
		fs.mkdirSync(directory);
		const env = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-07" };
		const records = createCourseRecords({ python: ENGINE_PYTHON, root: ENGINE_ROOT, env });
		const created = await records.create(directory, "Measure Theory");
		assert.ok(created.ok, !created.ok ? created.message : "");
		const listing = await records.list();
		assert.ok(listing.available);
		assert.deepEqual(listing.courses.map((c) => [c.workspace, c.title]), [[created.workspace, "Measure Theory"]]);
		assert.equal(fs.realpathSync(created.workspace), fs.realpathSync(directory));
	});
});
