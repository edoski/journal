/**
 * Round 15, P7 (app speed): opening a lesson from Home read the course map
 * again, told no lesson in progress, so the lesson page waited on its own
 * engine run (about 0.8 s, up to its 1.5 s bound) for a map Home had just
 * read. It now reads the map Home reads, the engine's kept one, and reads
 * the other only where that would name a different arc.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-lesson-place-"));
process.env.LH_DATA_DIR = TMP_DATA;
after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const { stores } = await import("../src/server/stores.ts");
const { studyStatus } = await import("../src/server/study.ts");
const { lessonPlace } = await import("../src/server/lesson-place.ts");
type CourseRecords = import("../src/core/ports.ts").CourseRecords;
type CourseMap = import("../src/core/contracts/course-map.ts").CourseMap;
type ChatListItem = import("../src/core/index.ts").ChatListItem;

const W = "/s/algebra";

function world(topics: CourseMap["topics"], current: string) {
	const asked: (string | null | undefined)[] = [];
	const records: CourseRecords = {
		list: async () => ({ available: true, courses: [{ workspace: W, title: "Algebra", due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null }], unreadable: [] }),
		map: async (workspace, here) => {
			asked.push(here);
			const arcs = [
				{ handle: "spaces", title: "Spaces", state: "learning", entry: [] },
				{ handle: "spectra", title: "Spectra", state: "new", entry: [] },
			];
			return { ok: true, map: { workspace, title: "Algebra", today: "2026-11-14", revision: 1, exam: null, current, currentArc: here ? "spectra" : "spaces", focus: null, tasks: [], topics, edges: [], arcs } as unknown as CourseMap };
		},
		run: async () => ({ ok: false, kind: "io", message: "no plan" }),
		create: async () => ({ ok: false, kind: "io", message: "unused" }),
	};
	stores.courseRecords = records;
	// A lesson in progress on eigen, as Home places "You are here".
	const lesson = { id: "c1", course: { workspace: W, title: "Algebra" }, messageCount: 4, updatedAt: "2026-11-14T10:00:00Z", kind: "teach", pendingQuestion: true, ownTopics: ["eigen"] } as unknown as ChatListItem;
	stores.chatStore = { ...stores.chatStore, listChats: () => [lesson] };
	return asked;
}

describe("a lesson opens on the map Home read (round 15, P7)", () => {
	it("asks the engine for the very map Home asked for, so the kept read answers", async () => {
		const asked = world([{ handle: "kernel", title: "Kernel", arc: "spaces" }, { handle: "eigen", title: "Eigen", arc: "spectra" }] as unknown as CourseMap["topics"], "kernel");
		await studyStatus();
		const place = await lessonPlace({ course: { workspace: W, title: "Algebra" }, topics: ["kernel"], messages: [] });
		assert.deepEqual(asked, ["eigen", "eigen"], "Home and the lesson asked for one map");
		assert.deepEqual(place, { topic: { handle: "kernel", title: "Kernel" }, arc: { number: 1, handle: "spaces", title: "Spaces" } });
	});

	it("reads the map without the lesson in progress where the place's arc would come from it", async () => {
		const asked = world([{ handle: "kernel", title: "Kernel" }, { handle: "eigen", title: "Eigen", arc: "spectra" }] as unknown as CourseMap["topics"], "kernel");
		const place = await lessonPlace({ course: { workspace: W, title: "Algebra" }, topics: ["kernel"], messages: [] });
		assert.deepEqual(asked, ["eigen", null]);
		assert.deepEqual(place?.arc, { number: 1, handle: "spaces", title: "Spaces" }, "the course's own current arc, as before");
	});
});

describe("a lesson its review took up sits on that lesson's topic (round 16, M4)", () => {
	it("names the topic its plan teaches, not the review's, in the top bar", async () => {
		world([{ handle: "kernel", title: "Kernel", arc: "spaces" }, { handle: "eigen", title: "Eigen", arc: "spectra" }] as unknown as CourseMap["topics"], "kernel");
		const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
		const plan = [
			{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "p1", name: "plan_init", arguments: { mermaid: "graph TD\n  a[Why] --> b[How]", goal: { title: "Eigen", topic: "eigen" } } }], api: "faux", provider: "test", model: "test", usage, stopReason: "toolUse", timestamp: 1 },
			{ id: "r1", role: "toolResult", toolCallId: "p1", toolName: "plan_init", content: [{ type: "text", text: "{}" }], details: {}, isError: false, timestamp: 1 },
		];
		const place = await lessonPlace({ course: { workspace: W, title: "Algebra" }, topics: ["kernel"], messages: plan as never });
		assert.deepEqual(place?.topic, { handle: "eigen", title: "Eigen" });
	});
});
