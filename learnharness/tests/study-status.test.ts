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

describe("a course's last study counts its sessions", async () => {
	const { withSessionStudy } = await import("../src/server/study.ts");
	it("a session he wrote in today makes the course studied today, an older one never moves it back", async () => {
		const course = { map: { today: "2026-11-08" }, lastActiveDaysAgo: 3 } as unknown as import("../src/core/contracts/study.ts").StudyCourse;
		assert.equal(withSessionStudy(course, ["2026-11-08"]).lastActiveDaysAgo, 0);
		assert.equal(withSessionStudy(course, ["2026-11-01"]).lastActiveDaysAgo, 3);
		assert.equal(withSessionStudy({ ...course, lastActiveDaysAgo: null }, ["2026-11-07"]).lastActiveDaysAgo, 1);
		assert.equal(withSessionStudy(course, []).lastActiveDaysAgo, 3);
	});
});

describe("Home's read runs no course's day plan again (round 13, N2)", () => {
	it("takes each course's day from the listing's own plan --all --days 1, the entry that course's plan prints", async () => {
		const verbs: string[] = [];
		const entry = (workspace: string, last: number) => ({ workspace, last_studied: { date: "2026-11-12", days_ago: last }, due: [], plan: { days: [{ date: "2026-11-14", new: [] }] } });
		const plan = { today: "2026-11-14", capacity: {}, courses: [entry("/s/algebra", 2), entry("/s/geometry", 5)] };
		const records: CourseRecords = {
			list: async () => ({ available: true, courses: [summary("/s/algebra"), summary("/s/geometry")], unreadable: [], plan }),
			map: async (workspace) => ({ ok: true, map: { workspace, title: workspace, today: "2026-11-14", revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [], edges: [] } }),
			run: async (_workspace, verb) => {
				verbs.push(verb.verb);
				return { ok: false, kind: "io", message: "no plan" };
			},
			create: async () => ({ ok: false, kind: "io", message: "unused" }),
		};
		stores.courseRecords = records;

		const listing = await studyStatus();

		assert.ok(listing.available);
		assert.deepEqual(verbs, [], "nine engine runs a read became five: the list and a map per course");
		assert.deepEqual(listing.courses.map((c) => [c.map.workspace, c.lastActiveDaysAgo]), [["/s/algebra", 2], ["/s/geometry", 5]]);
	});
});
