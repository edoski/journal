/**
 * Round 15, P7 (app speed): on a cold start Home's read began only when the
 * window asked for it, about 1.5 s after the server was up, and then waited
 * for the engine. The server now starts that read as it starts, and the
 * window's read takes the engine's kept runs: no engine run of its own. The
 * course pages' reads (each course's standing, the calendar's plans) follow
 * it, so a first visit to a course page waits for no engine run either.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-boot-read-"));
process.env.LH_DATA_DIR = path.join(TMP, "data");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { stores } = await import("../src/server/stores.ts");
const { studyStatus } = await import("../src/server/study.ts");
const { readAhead } = await import("../src/server/read-ahead.ts");
const { courseStandingRead } = await import("../src/server/course-standing.ts");
const { calendarRead } = await import("../src/server/calendar.ts");
const { createCourseRecords } = await import("../src/store/course-records.ts");

describe("Home's read starts with the server (round 15, P7)", () => {
	it("the server's start begins Home's read, then the course pages'", () => {
		const source = fs.readFileSync(path.join(HERE, "..", "instrumentation.ts"), "utf-8");
		const register = source.slice(source.indexOf("export async function register"));
		assert.match(register, /void readAhead\(\)/);
	});

	it("the window's read after the server's runs no engine", async () => {
		const home = path.join(TMP, "home");
		const support = path.join(home, "Library", "Application Support", "Learning");
		const workspace = path.join(TMP, "courses", "algebra");
		fs.mkdirSync(support, { recursive: true });
		fs.mkdirSync(path.join(workspace, ".study"), { recursive: true });
		fs.writeFileSync(path.join(support, "workspaces.json"), JSON.stringify({ schema: 2, workspaces: { [workspace]: {} } }));
		fs.writeFileSync(path.join(workspace, ".study", "course.json"), "{}");
		const python = path.join(TMP, "python");
		fs.writeFileSync(python, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
		const log = path.join(TMP, "calls.jsonl");
		const plan = { today: "2026-11-10", courses: [{ workspace, title: "Algebra" }] };
		const map = { workspace, title: "Algebra", today: "2026-11-10", revision: 1, topics: [] };
		const env = { ...process.env, HOME: home, VAULT_DIR: path.join(TMP, "vault"), LEARNING_TODAY: "2026-11-10", FAKE_ENGINE_LOG: log, FAKE_ENGINE_PLAN: JSON.stringify(plan), FAKE_ENGINE_MAP: JSON.stringify(map) };
		stores.courseRecords = createCourseRecords({ python, root: TMP, env });
		const calls = () => fs.readFileSync(log, "utf-8").trim().split("\n").length;

		await readAhead();
		const runs = calls();
		const window = await studyStatus();
		assert.ok(window.available && window.courses.length === 1);
		assert.equal(calls(), runs, "the window's read was the server's");
		const standing = await courseStandingRead(workspace);
		assert.equal(standing.status, 200);
		const calendar = await calendarRead();
		assert.ok(calendar.available);
		assert.equal(calls(), runs, "a first visit to a course page or the calendar runs no engine either");
	});
});
