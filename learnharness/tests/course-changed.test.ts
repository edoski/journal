/**
 * A course record that changes is announced on the bus as `course-changed`:
 * the app's own writes through the engine adapter, and another host's
 * writes seen on disk. Views of the course refetch on it instead of
 * re-reading on a delay after every turn.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createCourseRecords, watchCourseRecord } from "../src/store/course-records.ts";
import { watchCourses } from "../src/server/course-watch.ts";
import { emit, subscribe, type ServerEvent } from "../src/core/events.ts";
import type { CourseVerb } from "../src/core/contracts/course.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-changed-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function fakeEngine() {
	const dir = fs.mkdtempSync(path.join(TMP, "engine-"));
	const python = path.join(dir, "python");
	fs.writeFileSync(python, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
	return { python, root: dir, env: { ...process.env } };
}

function announced(): { workspaces: string[]; stop: () => void } {
	const workspaces: string[] = [];
	const stop = subscribe((e) => {
		if (e.type === "course-changed") workspaces.push((e as ServerEvent<"course-changed">).workspace);
	});
	return { workspaces, stop };
}

describe("the app's own writes", () => {
	it("a write verb announces the course; a read, a material scan included, does not", async () => {
		const records = createCourseRecords(fakeEngine());
		const { workspaces, stop } = announced();
		const verbs: CourseVerb[] = [
			{ verb: "resume" },
			{ verb: "show", handles: ["rank"] },
			{ verb: "save", changes: { topics: { rank: { gap: "x" } } } },
			{ verb: "sources", add: ["notes.pdf"] },
			{ verb: "sources", scan: true },
		];
		for (const verb of verbs) await records.run("/courses/linalg", verb);
		await records.map("/courses/linalg");
		stop();
		assert.deepEqual(workspaces, ["/courses/linalg", "/courses/linalg"]);
	});
});

describe("another host's writes", () => {
	it("a record replaced on disk is seen without a poll", { timeout: 10_000 }, async () => {
		const workspace = fs.mkdtempSync(path.join(TMP, "course-"));
		fs.mkdirSync(path.join(workspace, ".study"));
		let seen = false;
		const unwatch = watchCourseRecord(workspace, () => (seen = true));
		// macOS starts delivering a new watch's events after a short delay,
		// so the save is repeated until the watch reports it.
		for (let n = 0; !seen; n++) {
			const temp = path.join(workspace, ".study", "course.json.tmp");
			fs.writeFileSync(temp, JSON.stringify({ n }));
			fs.renameSync(temp, path.join(workspace, ".study", "course.json"));
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		unwatch();
	});

	it("the watched courses follow the course list", async () => {
		let courses = ["/a"];
		const watching = new Set<string>();
		const triggers = new Map<string, () => void>();
		const listed = () => new Promise((resolve) => setImmediate(resolve));
		const stopWatch = watchCourses({
			courseRecords: { list: async () => ({ available: true, courses: courses.map((workspace) => ({ workspace }) as never), unreadable: [] }) },
			watch: (workspace, onChange) => {
				watching.add(workspace);
				triggers.set(workspace, onChange);
				return () => watching.delete(workspace);
			},
		});
		await listed();
		assert.deepEqual([...watching], ["/a"]);
		courses = ["/b"];
		emit("courses-changed", {});
		await listed();
		assert.deepEqual([...watching], ["/b"]);
		const { workspaces, stop } = announced();
		triggers.get("/b")!();
		stop();
		assert.deepEqual(workspaces, ["/b"]);
		stopWatch();
		assert.equal(watching.size, 0);
	});
});
