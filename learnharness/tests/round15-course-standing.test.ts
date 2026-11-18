/**
 * Round 15, P7 (app speed): the course page's standing read ran the
 * engine's course listing, then the course's standing, one after the
 * other: each replays every course, so the page waited for two runs. A
 * course the registry names now runs its standing beside the listing; a
 * folder no course has is refused before the engine runs at all.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-standing-"));
process.env.LH_DATA_DIR = TMP_DATA;
after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const { stores } = await import("../src/server/stores.ts");
const { courseStandingRead } = await import("../src/server/course-standing.ts");
type CourseRecords = import("../src/core/ports.ts").CourseRecords;

function world() {
	const events: string[] = [];
	let release!: () => void;
	const listed = new Promise<void>((resolve) => (release = resolve));
	const records: CourseRecords = {
		registered: () => ["/s/algebra"],
		list: async () => {
			events.push("list");
			await listed;
			events.push("listed");
			return { available: true, courses: [{ workspace: "/s/algebra", title: "Algebra", due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null }], unreadable: [] };
		},
		map: async () => ({ ok: false, kind: "io", message: "unused" }),
		run: async (workspace, verb) => {
			events.push(`${verb.verb} ${workspace}`);
			return { ok: true, json: { readiness: null, mistakes: [] } };
		},
		create: async () => ({ ok: false, kind: "io", message: "unused" }),
	};
	stores.courseRecords = records;
	return { events, release };
}

describe("the course page's standing waits for one engine run (round 15, P7)", () => {
	it("runs the course's standing while the listing runs", async () => {
		const { events, release } = world();
		const read = courseStandingRead("/s/algebra");
		await new Promise((resolve) => setImmediate(resolve));
		release();
		const { status, body } = await read;
		assert.equal(status, 200);
		assert.ok(body.ok);
		assert.deepEqual(events, ["standing /s/algebra", "list", "listed"]);
	});

	it("refuses a folder no registered course has without running the engine", async () => {
		const { events, release } = world();
		release();
		const { status } = await courseStandingRead("/elsewhere");
		assert.equal(status, 404);
		assert.deepEqual(events, []);
	});
});
