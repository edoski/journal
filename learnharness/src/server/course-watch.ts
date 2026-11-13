/**
 * Announces a course record written by another host. The app's own saves
 * announce `course-changed` in the CourseRecords adapter; a tutor in Claude
 * Code or Claude Desktop saves through the engine's MCP server, so each
 * registered course's record is watched on disk (an OS event, not a poll).
 * The watched set follows the course list: it is read at the app's start
 * and again whenever the list changes.
 */

import { emit, subscribe } from "../core/events.ts";
import type { CourseRecords } from "../core/ports.ts";
import { watchCourseRecord } from "../store/course-records.ts";

export interface CourseWatchDeps {
	courseRecords: Pick<CourseRecords, "list">;
	watch?: (workspace: string, onChange: () => void) => () => void;
}

/** Start watching every registered course. Returns the stop. */
export function watchCourses({ courseRecords, watch = watchCourseRecord }: CourseWatchDeps): () => void {
	const watched = new Map<string, () => void>();
	let stopped = false;
	const sync = async () => {
		const listing = await courseRecords.list().catch(() => null);
		if (stopped || !listing?.available) return;
		const now = new Set(listing.courses.map((c) => c.workspace));
		for (const [workspace, unwatch] of watched) {
			if (now.has(workspace)) continue;
			unwatch();
			watched.delete(workspace);
		}
		for (const workspace of now) {
			if (!watched.has(workspace)) watched.set(workspace, watch(workspace, () => emit("course-changed", { workspace })));
		}
	};
	const unsubscribe = subscribe((event) => {
		if (event.type === "courses-changed") void sync();
	});
	void sync();
	return () => {
		stopped = true;
		unsubscribe();
		for (const unwatch of watched.values()) unwatch();
		watched.clear();
	};
}
