/**
 * GET /api/study's read: a course the engine could not read is never left
 * out. It is named in `failed` with what stopped it, by the title a linked
 * session carries when its record cannot say. Runs under an isolated
 * LH_DATA_DIR.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-study-status-"));
process.env.LH_DATA_DIR = TMP_DATA;
after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const { stores } = await import("../src/server/stores.ts");
const { studyStatus } = await import("../src/server/study.ts");
type CourseRecords = import("../src/core/ports.ts").CourseRecords;
type CourseSummary = import("../src/core/contracts/course.ts").CourseSummary;

const summary = (workspace: string): CourseSummary => ({
	workspace,
	title: null,
	due: 0,
	reviews: [],
	current: null,
	currentTitle: null,
	task: null,
	step: null,
	exam: null,
	lastActiveDaysAgo: null,
});

describe("the study read", () => {
	it("names every course it could not read, with why, instead of leaving it out", async () => {
		const records: CourseRecords = {
			list: async () => ({
				available: true,
				courses: [summary("/s/algebra"), summary("/s/geometry")],
				unreadable: [{ workspace: "/s/analysis", title: "analysis", problem: "damaged" }],
			}),
			map: async (workspace) =>
				workspace === "/s/algebra"
					? { ok: true, map: { workspace, title: "Algebra", today: "2026-11-14", revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [], edges: [] } }
					: { ok: false, kind: "io", message: "map failed" },
			run: async () => ({ ok: false, kind: "io", message: "no plan" }),
			create: async () => ({ ok: false, kind: "io", message: "unused" }),
		};
		stores.courseRecords = records;
		stores.chatStore.createChat("Limits", { workspace: "/s/analysis", title: "Real Analysis" });

		const listing = await studyStatus();

		assert.ok(listing.available);
		assert.deepEqual(
			listing.courses.map((c) => c.map.workspace),
			["/s/algebra"],
		);
		assert.deepEqual(listing.failed, [
			{ workspace: "/s/analysis", title: "Real Analysis", problem: "damaged" },
			{ workspace: "/s/geometry", title: "geometry", problem: "unreadable" },
		]);
	});
});
