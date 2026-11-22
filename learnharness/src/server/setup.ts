/**
 * Setting up something new to learn, by conversation: the server side of
 * the setup agent's tools (agent/tools/setup.ts). Every step is one the app
 * already has (the course record, the material, the linked folders, the map
 * builder, the arc pass), so anything set up here can be corrected later by
 * talking to the tutor.
 *
 * What starts what, each an event:
 * - the survey's sorting, when its readers end, wakes the setup session
 *   with a setup note;
 * - creating starts the course's map build (and through it the arc pass);
 * - the map build ending wakes every setup session of that course with a
 *   setup note, so the agent writes the summary.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { courseLabel, type CourseLink } from "../core/contracts/course.ts";
import { emit } from "../core/events.ts";
import { newSetupNoteMessage, sessionModeOf } from "../core/native-messages.ts";
import { expandHome, type LearningCreated, type MaterialSurvey, type NewLearning } from "../core/setup.ts";
import { surveyMaterial } from "../agent/subagents/material-survey.ts";
import type { CourseMapStatus } from "../agent/subagents/course-map-builder.ts";
import { claudeEngine } from "../agent/models.ts";
import { createCourse, listCourses, titleProblem } from "./courses.ts";
import { addMaterial, courseContexts, startCourseMap } from "./course-map.ts";
import { deliverJobResult } from "./jobs.ts";
import { effectiveSettings, stores } from "./stores.ts";

const home = () => process.env.HOME ?? os.homedir();

/** His vault, as the engine reads it (course-records.ts journalState). */
function vault(): string {
	return expandHome(process.env.VAULT_DIR ?? path.join(home(), "Library", "Mobile Documents", "iCloud~md~obsidian", "Documents", "the-vault"), home());
}

const isFolder = (absolute: string): boolean => {
	try {
		return fs.statSync(absolute).isDirectory();
	} catch {
		return false;
	}
};

/** Where his study material is kept, for the setup agent to look in first:
 *  each folder his courses sit in, with the courses it holds; his vault's
 *  university folder; his Downloads. Only folders that exist. */
export async function studyPlaces(): Promise<string[]> {
	const listing = await listCourses();
	const courses = listing.available ? listing.courses : [];
	const roots = listing.available ? listing.roots : [];
	const places = roots.map((root) => {
		const held = courses.filter((c) => path.dirname(c.workspace) === root).map((c) => `${courseLabel(c)} (${path.basename(c.workspace)})`);
		return `${root}: his courses are kept here, each in its own folder with its material${held.length > 0 ? `: ${held.join(", ")}` : ""}`;
	});
	const university = path.join(vault(), "university");
	if (isFolder(university) && !roots.some((r) => r.startsWith(university))) places.push(`${university}: his university folders`);
	const downloads = path.join(home(), "Downloads");
	if (isFolder(downloads)) places.push(`${downloads}: his downloads`);
	return places;
}

/** The survey's sorting as the setup agent reads it. Pure. */
export function surveyNoteText(survey: MaterialSurvey | { error: string }): string {
	if ("error" in survey) return `[MATERIAL READ] The material could not be read: ${survey.error}. Tell him in one line, and carry on with what you know.`;
	const lines = survey.files.map((f) => {
		const exam = f.exam ? ` Exam: ${JSON.stringify(f.exam)}.` : "";
		return `- ${f.path}: ${f.kind}, "${f.title}", ${f.covers}${f.course ? ` (course: ${f.course})` : ""}.${exam}`;
	});
	const unread = survey.unread.map((u) => `- ${u.path}: not read (${u.reason})`);
	return ["[MATERIAL READ] Each file's reader says what it is:", ...lines, ...unread, "", "Carry on from here as your system prompt says."].join("\n");
}

/** Start the survey of these files for the setup session. Its sorting
 *  arrives as a setup note. */
export function startSurvey(chatId: string, given: readonly string[]): { started: true } | { error: string } {
	const paths = [...new Set(given.map((p) => path.resolve(expandHome(p.trim(), home()))))];
	const folders = paths.filter(isFolder);
	if (folders.length > 0) return { error: `${folders.map((f) => path.basename(f)).join(", ")} ${folders.length === 1 ? "is a folder" : "are folders"}: list the files in it with Glob and pass those` };
	const missing = paths.filter((p) => !fs.existsSync(p));
	if (missing.length > 0) return { error: `no file at ${missing.join(", ")}` };
	const label = path.basename(path.dirname(paths[0]!));
	void surveyMaterial({ engineFor: () => claudeEngine(effectiveSettings().claude.account) }, paths, { chatId, label })
		.catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }))
		.then((survey) => {
			if ((survey as { error?: string }).error?.includes("aborted")) return;
			void deliverJobResult(newSetupNoteMessage(chatId, `survey_${Date.now()}`, surveyNoteText(survey)));
		});
	return { started: true };
}

/** The folder most of his courses are kept in, for one with no folder of
 *  its own and no `where`. */
function mostUsedRoot(courses: readonly { workspace: string }[], roots: readonly string[]): string | null {
	const held = (root: string) => courses.filter((c) => path.dirname(c.workspace) === root).length;
	return [...roots].sort((a, b) => held(b) - held(a))[0] ?? null;
}

/** Make the course or the self-study the setup agent settled on, link its
 *  material, start its map, and give this session to it. */
export async function createLearning(chatId: string, input: NewLearning): Promise<LearningCreated> {
	const title = input.title.trim();
	const problem = titleProblem(title);
	if (problem) return { ok: false, error: problem };
	const listing = await listCourses();
	if (!listing.available) return { ok: false, error: "the courses could not be read; try again" };
	const twin = listing.courses.find((c) => c.title?.toLocaleLowerCase() === title.toLocaleLowerCase());
	if (twin) return { ok: false, error: `he already has ${courseLabel(twin)}: pick another name, or add the material to it from a lesson of it` };

	let workspace: string;
	if (input.folder) {
		const folder = path.resolve(expandHome(input.folder, home()));
		if (!isFolder(folder)) return { ok: false, error: `no folder at ${folder}` };
		const real = fs.realpathSync(folder);
		if (fs.existsSync(path.join(real, ".study", "course.json"))) {
			const owner = listing.courses.find((c) => c.workspace === real);
			return { ok: false, error: `${real} is already a course${owner ? `: ${courseLabel(owner)}` : ""}` };
		}
		const created = await stores.courseRecords.create(real, { title, exam: null });
		if (!created.ok) return { ok: false, error: `the course could not be made: ${created.message}` };
		workspace = created.workspace;
		// Its own folder is linked, so its files are read now and the ones he
		// adds there later are read as they arrive (course-context.ts).
		const linked = await courseContexts().linkFolder(workspace, real);
		if (!linked.ok) console.error(`[setup ${chatId}] linking ${real}: ${linked.error}`);
	} else {
		const root = input.where ? path.resolve(expandHome(input.where, home())) : mostUsedRoot(listing.courses, listing.roots);
		if (!root) return { ok: false, error: "there is no study folder yet: ask him where to keep it, then pass that folder as folder" };
		const created = await createCourse({ root, title, exam: null, material: [] });
		if (!created.ok) return { ok: false, error: created.error };
		workspace = created.course.workspace;
	}

	const facts: Record<string, unknown> = {
		...(input.goal?.trim() ? { goal: input.goal.trim() } : {}),
		...(input.kind === "self-study" ? { preferences: { kind: "self-study" } } : {}),
		...(input.kind === "course" && input.exam && Object.keys(input.exam).length > 0 ? { exam: input.exam } : {}),
	};
	if (Object.keys(facts).length > 0) {
		const saved = await stores.courseRecords.run(workspace, { verb: "save", changes: facts });
		// It exists now: what the engine refused is said, and corrected with course_save.
		if (!saved.ok) console.error(`[setup ${chatId}] facts refused in ${workspace}: ${saved.message}`);
	}
	const more: string[] = [];
	if (input.files?.length) {
		const files = input.files.map((f) => path.resolve(expandHome(f, home()))).filter((f) => fs.existsSync(f) && !isFolder(f));
		const added = await addMaterial(workspace, files.map((f) => ({ path: path.basename(f), bytes: fs.readFileSync(f) })));
		if (!added.ok) more.push(`the files could not be added: ${added.error}`);
	}
	for (const folder of input.folders ?? []) {
		const linked = await courseContexts().linkFolder(workspace, folder);
		if (!linked.ok) more.push(`${folder}: ${linked.error}`);
	}
	for (const site of input.websites ?? []) {
		const linked = await courseContexts().addWebsite(workspace, site.address, site.title);
		if (!linked.ok) more.push(`${site.address}: ${linked.error}`);
	}
	// The arcs may form even once he has begun studying: he asked for it set up.
	const ledger = stores.arcPassLedgers.get(workspace);
	stores.arcPassLedgers.save(workspace, { state: "new", at: ledger?.at ?? new Date().toISOString(), topics: ledger?.topics ?? 0, asked: input.asked.trim() });
	const link: CourseLink = { workspace, title };
	stores.chatStore.linkCourse(chatId, link);
	emit("courses-changed", {});
	emit("record-changed", { chatId });
	startCourseMap(workspace);
	if (more.length > 0) console.error(`[setup ${chatId}] ${more.join("; ")}`);
	return { ok: true, workspace, title, kind: input.kind, ...(more.length > 0 ? { problems: more } : {}) };
}

/** What the setup agent reads when its course's map build ended. Pure. */
export function mapNoteText(status: Extract<CourseMapStatus, { state: "built" | "failed" }>): string {
	return status.state === "built"
		? `[MAP READY] The topic map is built from the material (${status.outcome}). Its arcs are being cut in the background and land by themselves. Read the map with course_show if you need it, then write him the short summary your system prompt asks for.`
		: `[MAP FAILED] The topic map could not be built: ${status.reason}. Tell him in one plain line what went wrong and what he can do; the course itself is set up.`;
}

const MAP_NOTE = "steer_setup_map_";

/** A course's first map build ended: wake every setup session of that
 *  course that has not heard of its map yet, so its agent writes him the
 *  summary. Later builds (material added weeks on) wake no one. */
export function noteMapBuilt(workspace: string, status: Extract<CourseMapStatus, { state: "built" | "failed" }>): void {
	for (const chat of stores.chatStore.listChats()) {
		if (chat.course?.workspace !== workspace) continue;
		const record = stores.chatStore.getChat(chat.id);
		if (!record || sessionModeOf(record.messages, record.kind) !== "setup") continue;
		if (record.messages.some((m) => m.id.startsWith(MAP_NOTE))) continue;
		void deliverJobResult(newSetupNoteMessage(chat.id, `map_${status.at.replace(/\W/g, "")}`, mapNoteText(status)));
	}
}
