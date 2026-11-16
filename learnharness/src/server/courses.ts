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
import { emit } from "../core/events.ts";
import { stores } from "./stores.ts";
import { startCourseMap } from "./course-map.ts";
import { courseRecordForgotten } from "../store/course-records.ts";

/** The registered courses plus the study roots a new course can go in.
 *  Until the engine exposes its study roots, a root is the parent folder
 *  of a registered course. A course the engine could not read keeps the
 *  title its newest linked session carries, since its record cannot say. */
export async function listCourses(): Promise<CourseListing> {
	const listing = await listCoursesRead();
	if (!listing.available) return listing;
	if (!("plan" in listing)) return listing;
	const { plan: _plan, ...courses } = listing;
	return courses;
}

/** `listCourses` with the engine's `plan --all --days 1` output it came
 *  from, when the engine gave one: every course's day plan, read once. */
export async function listCoursesRead(): Promise<CourseListing | (Extract<CourseListing, { available: true }> & { plan?: unknown })> {
	const listing = await stores.courseRecords.list();
	if (!listing.available) return listing;
	const chats = listing.unreadable.length > 0 ? stores.chatStore.listChats() : [];
	const unreadable = listing.unreadable.map((c) => ({
		...c,
		title: chats.find((chat) => chat.course?.workspace === c.workspace)?.course?.title ?? c.title,
	}));
	const roots = [...new Set([...listing.courses, ...unreadable].map((c) => path.dirname(c.workspace)))].sort();
	return { ...listing, unreadable, roots };
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

/** A file of the course's material as the picker gave it: its path under
 *  the picked folder (or its bare name) and its bytes. */
export interface MaterialFile {
	path: string;
	bytes: Uint8Array;
}

export interface NewCourse {
	/** The folder the course goes in; may be empty when only one is known. */
	root: string;
	title: string;
	/** The exam day, YYYY-MM-DD, or null when none is set yet. */
	exam: string | null;
	material: readonly MaterialFile[];
}

/** Where a new course's material is copied, inside its folder. */
export const MATERIAL_FOLDER = "material";

export type CourseFailure = { ok: false; status: 400 | 404 | 409 | 500 | 502; code: string; error: string };
export type CourseCreation = { ok: true; course: CourseSummary } | CourseFailure;

/** Every error reads as a sentence the learner can act on; the engine's own
 *  words go to the server log. */
const ENGINE_FAILED = "LearnHarness could not reach your courses. Try again, and restart the app if it keeps happening.";

function engineFailure(what: string, message: string): CourseFailure {
	console.error(`[courses] ${what}: ${message}`);
	return { ok: false, status: 502, code: "engine_failed", error: ENGINE_FAILED };
}

/** The title's problem in plain words, or null when it can be a course. */
export function titleProblem(title: string): string | null {
	if (!title) return "Give the course a title.";
	if (!/[\p{L}\p{N}]/u.test(title)) return "Use letters or numbers in the title.";
	return null;
}

/** The registered course already titled `title` (letter case ignored), else null. */
function sameTitle(courses: readonly CourseSummary[], title: string, except?: string): CourseSummary | null {
	const wanted = title.toLocaleLowerCase();
	return courses.find((c) => c.workspace !== except && c.title?.toLocaleLowerCase() === wanted) ?? null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A material path made safe to write under the material folder: its
 *  folders kept, nothing hidden, nothing that climbs out. Null when nothing
 *  of it is left. */
export function materialPath(given: string): string | null {
	const parts = given.split(/[\\/]+/).filter((part) => part && part !== "." && part !== "..");
	if (parts.length === 0 || parts.some((part) => part.startsWith("."))) return null;
	return parts.join("/");
}

/** Create `<root>/<slug>`, copy the material into it, make it a course with
 *  its title and exam day, and register the material with the engine. The
 *  folder must be new: the engine's `init` reopens an existing course
 *  silently, and the title save would then rename it. A folder whose
 *  engine steps failed is left in place, because what `init` already wrote
 *  cannot be told apart from the learner's own files; creating again
 *  finishes it. */
export async function createCourse(input: NewCourse): Promise<CourseCreation> {
	const title = input.title.trim();
	const problem = titleProblem(title);
	if (problem) return { ok: false, status: 400, code: "title_required", error: problem };
	if (input.exam !== null && !DAY.test(input.exam)) return { ok: false, status: 400, code: "bad_exam", error: "Pick the exam day from the calendar." };
	const listing = await listCourses();
	if (!listing.available) return engineFailure("list", listing.reason);
	const root = input.root || (listing.roots.length === 1 ? listing.roots[0]! : "");
	if (!listing.roots.includes(root)) return { ok: false, status: 400, code: "unknown_root", error: "Pick where the course goes." };
	const twin = sameTitle(listing.courses, title);
	if (twin) return { ok: false, status: 409, code: "course_exists", error: `You already have a course called ${courseLabel(twin)}.` };
	const slug = courseSlug(title);
	const directory = path.join(root, slug);
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
			const owner = listing.courses.find((c) => path.basename(c.workspace) === slug);
			return {
				ok: false,
				status: 409,
				code: "course_exists",
				error: owner
					? `${courseLabel(owner)} already uses the folder for this title. Pick another title.`
					: `Your courses folder already has a folder called ${slug}. Pick another title.`,
			};
		}
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
			console.error(`[courses] mkdir ${directory}: ${(error as Error).message}`);
			return { ok: false, status: 500, code: "create_failed", error: "The course folder could not be made. Check that your courses folder can be written to." };
		}
	}
	const copied: string[] = [];
	try {
		for (const file of input.material) {
			const relative = materialPath(file.path);
			if (!relative) continue;
			const target = path.join(directory, MATERIAL_FOLDER, relative);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, file.bytes);
			copied.push(`${MATERIAL_FOLDER}/${relative}`);
		}
	} catch (error) {
		console.error(`[courses] copy material into ${directory}: ${(error as Error).message}`);
		return { ok: false, status: 500, code: "material_failed", error: "The material could not be copied into the course folder. Check there is room on the disk, then try again." };
	}
	const created = await stores.courseRecords.create(directory, { title, exam: input.exam });
	if (!created.ok) return engineFailure("create", created.message);
	if (copied.length > 0) {
		const added = await stores.courseRecords.run(created.workspace, { verb: "sources", add: copied });
		if (!added.ok) {
			// No half-made course: without its record the folder is unfinished,
			// so creating it again picks up where this stopped.
			await stores.courseRecords.run(created.workspace, { verb: "forget-course" });
			console.error(`[courses] sources --add in ${created.workspace}: ${added.message}`);
			return { ok: false, status: 502, code: "material_failed", error: "The material could not be added to the course. Try again with the files that matter most." };
		}
	}
	// A course the app makes may get its arcs from the grouping pass.
	stores.arcPassLedgers.save(created.workspace, { state: "new", at: new Date().toISOString(), topics: 0 });
	emit("courses-changed", {});
	if (copied.length > 0) startCourseMap(created.workspace);
	// The engine's own entry, so the exam countdown is the engine's count.
	const fresh = await listCourses();
	const listed = fresh.available ? fresh.courses.find((c) => c.workspace === created.workspace) : undefined;
	return { ok: true, course: listed ?? { workspace: created.workspace, title, due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null } };
}

export type CourseChange = { ok: true } | CourseFailure;

/** The listed course with this workspace, or a failure that says so. */
async function listedCourse(workspace: string): Promise<{ ok: true; course: CourseSummary; courses: CourseSummary[] } | CourseFailure> {
	const listing = await listCourses();
	if (!listing.available) return engineFailure("list", listing.reason);
	const course = listing.courses.find((c) => c.workspace === workspace);
	if (!course) return { ok: false, status: 404, code: "unknown_course", error: "That course is no longer in your list." };
	return { ok: true, course, courses: listing.courses };
}

/** Give a course a new title: the engine saves it. Its folder keeps its
 *  name, so its sessions stay linked. */
export async function renameCourse(workspace: string, title: string): Promise<CourseChange> {
	const name = title.trim();
	const problem = titleProblem(name);
	if (problem) return { ok: false, status: 400, code: "title_required", error: problem };
	const found = await listedCourse(workspace);
	if (!found.ok) return found;
	const twin = sameTitle(found.courses, name, workspace);
	if (twin) return { ok: false, status: 409, code: "course_exists", error: `You already have a course called ${courseLabel(twin)}.` };
	const saved = await stores.courseRecords.run(workspace, { verb: "save", changes: { title: name } });
	if (!saved.ok) return engineFailure("rename", saved.message);
	emit("courses-changed", {});
	return { ok: true };
}

/** Delete a course's record: the engine forgets it, so it leaves every
 *  list. The folder, its material and its notes stay on disk. */
export async function deleteCourse(workspace: string): Promise<CourseChange> {
	const found = await listedCourse(workspace);
	if (!found.ok) return found;
	const forgotten = await stores.courseRecords.run(workspace, { verb: "forget-course" });
	if (!forgotten.ok) return engineFailure("delete", forgotten.message);
	stores.courseMapLedgers.forget(workspace);
	stores.arcPassLedgers.forget(workspace);
	emit("courses-changed", {});
	return { ok: true };
}

/** The words for a lesson whose course was deleted: the lesson shows them
 *  and a turn there is refused with them. */
export const COURSE_DELETED = "This course was deleted. Its lessons stay as history.";

/** True when the session's course record is gone: the course was deleted.
 *  A turn there would write a fresh record and bring the course back, so
 *  the lesson is history. */
export function courseDeleted(chatId: string): boolean {
	const workspace = stores.chatStore.getChat(chatId)?.course?.workspace;
	return !!workspace && courseRecordForgotten(workspace);
}

/** The same fact for a listed session, from its course link: true when
 *  its course was deleted. */
export function courseGone(course: { workspace: string } | undefined): boolean {
	return !!course && courseRecordForgotten(course.workspace);
}

/** True when the session exists and has no course: its learner turns are
 *  refused until the learner links one. */
export function courseRequired(chatId: unknown): boolean {
	if (typeof chatId !== "string") return false;
	const chat = stores.chatStore.getChat(chatId);
	return chat !== null && !chat.course;
}
