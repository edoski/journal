/**
 * The course chooser's server seam: list the engine's registered courses,
 * create a new one, turn a picked workspace into the session's CourseLink,
 * and say whether a session may take a learner turn. Only a course the
 * engine currently lists can be linked, so a session never points at a
 * directory the engine does not know.
 */

import fs from "node:fs";
import path from "node:path";
import type { CourseLink, CourseListing, CourseSummary } from "../core/contracts/course.ts";
import { courseLabel } from "../core/contracts/course.ts";
import { stores } from "./stores.ts";

/** The registered courses plus the study roots a new course can go in.
 *  Until the engine exposes its study roots, a root is the parent folder
 *  of a registered course. */
export async function listCourses(): Promise<CourseListing> {
	const listing = await stores.courseRecords.list();
	if (!listing.available) return listing;
	const roots = [...new Set(listing.courses.map((c) => path.dirname(c.workspace)))].sort();
	return { ...listing, roots };
}

/** The link for a picked workspace, or null when no registered course has it. */
export async function courseLinkFor(workspace: string): Promise<CourseLink | null> {
	const listing = await listCourses();
	if (!listing.available) return null;
	const course = listing.courses.find((c) => c.workspace === workspace);
	return course ? { workspace: course.workspace, title: courseLabel(course) } : null;
}

/** A course title as a folder name: lowercase, every run of other
 *  characters one `-`, at most 48 characters. */
export function courseSlug(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)
		.replace(/-+$/, "");
	return slug || "course";
}

export type CourseCreation =
	| { ok: true; course: CourseSummary }
	| { ok: false; status: 400 | 409 | 500 | 502; code: string; error: string };

/** Create `<root>/<slug>` and make it a titled course. The folder must be
 *  new: the engine's `init` reopens an existing course silently, and the
 *  title save would then rename it. A folder whose engine steps failed is
 *  left in place, because what `init` already wrote cannot be told apart
 *  from the learner's own files. */
export async function createCourse(root: string, title: string): Promise<CourseCreation> {
	const name = title.trim();
	if (!name) return { ok: false, status: 400, code: "title_required", error: "A course needs a title" };
	const listing = await listCourses();
	if (!listing.available) return { ok: false, status: 502, code: "engine_failed", error: listing.reason };
	if (!listing.roots.includes(root)) return { ok: false, status: 400, code: "unknown_root", error: "Unknown study root" };
	const directory = path.join(root, courseSlug(name));
	try {
		fs.mkdirSync(directory);
	} catch (error) {
		// A folder a failed creation left behind (the engine initialized it,
		// the title save never landed) has no course record to rename, so
		// creating again finishes the job.
		const unfinished =
			fs.existsSync(path.join(directory, ".study", "workspace.json")) &&
			!fs.existsSync(path.join(directory, ".study", "course.json"));
		if ((error as NodeJS.ErrnoException).code === "EEXIST" && !unfinished) {
			return { ok: false, status: 409, code: "course_exists", error: `${directory} already exists` };
		}
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
			return { ok: false, status: 500, code: "create_failed", error: (error as Error).message };
		}
	}
	const created = await stores.courseRecords.create(directory, name);
	if (!created.ok) return { ok: false, status: 502, code: "engine_failed", error: created.message };
	return { ok: true, course: { workspace: created.workspace, title: name, due: 0, current: null, task: null } };
}

/** True when the session exists and has no course: its learner turns are
 *  refused until the learner links one. */
export function courseRequired(chatId: unknown): boolean {
	if (typeof chatId !== "string") return false;
	const chat = stores.chatStore.getChat(chatId);
	return chat !== null && !chat.course;
}
