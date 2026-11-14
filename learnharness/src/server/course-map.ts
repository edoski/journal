/**
 * What starts the course map builder. Each is an event, never a clock:
 *
 * - a course is created with material (courses.ts);
 * - material is added to a course (`addMaterial`, below);
 * - a lesson's save registers material (a turn settles);
 * - a folder or website is linked in Context, or a linked folder gets new
 *   files (course-context.ts);
 * - the app starts: a build a quit cut short runs again.
 *
 * The builder runs on the app's default model, the conversation's, at high
 * effort (Edoardo, 14 Nov 2026: every agent runs on Opus 5.5 at high
 * effort), resolved fresh per build.
 */

import fs from "node:fs";
import path from "node:path";
import { createCourseMapBuilder, type CourseMapBuilder, type CourseMapStatus } from "../agent/subagents/course-map-builder.ts";
import { claudeEngine, type PiEngine } from "../agent/models.ts";
import { emit, subscribe, type ServerEvent } from "../core/events.ts";
import { sourcesRegisteredInLastTurn } from "../core/native-messages.ts";
import { effectiveSettings, stores } from "./stores.ts";
import { createCourseContexts, watchLinkedFolders, type CourseContexts } from "./course-context.ts";

/** The app's one model on its Claude account; undefined when that account
 *  cannot run it, so the build reports it instead of starting. */
function defaultEngine(): PiEngine | undefined {
	try {
		return claudeEngine(effectiveSettings().claude.account);
	} catch {
		return undefined;
	}
}

interface LhCourseMapServerGlobal {
	__lhCourseMapBuilder?: CourseMapBuilder;
	__lhCourseMapUnsubscribe?: () => void;
}

/** The one builder, shared by every module instance (the events.ts reason). */
export function courseMapBuilder(): CourseMapBuilder {
	const g = globalThis as typeof globalThis & LhCourseMapServerGlobal;
	return (g.__lhCourseMapBuilder ??= createCourseMapBuilder({
		courseRecords: stores.courseRecords,
		ledgers: stores.courseMapLedgers,
		engineFor: defaultEngine,
		onSaved: () => emit("courses-changed", {}),
		onStatus: () => emit("courses-changed", {}),
	}));
}

/** Build or extend a course's map in the background. */
export function startCourseMap(workspace: string): void {
	void courseMapBuilder().buildMap(workspace).catch((err: unknown) => console.error(`[course-map ${workspace}]`, err));
}

export function courseMapStatus(workspace: string): CourseMapStatus {
	return courseMapBuilder().status(workspace);
}

/** A lesson's save registered material: extend that course's map. The
 *  course's earlier material is adopted first, so only the new material is
 *  read. */
function onTurnSettled(event: ServerEvent<"turn-settled">): void {
	const record = stores.chatStore.getChat(event.chatId);
	if (!record?.course) return;
	const added = sourcesRegisteredInLastTurn(record.messages);
	if (added.length === 0) return;
	const { workspace } = record.course;
	void courseMapBuilder()
		.adopt(workspace, added)
		.then(() => startCourseMap(workspace))
		.catch((err: unknown) => console.error(`[course-map ${workspace}]`, err));
}

/** Listen for the events that start a build, once per process. */
export function listenForCourseMaps(): void {
	const g = globalThis as typeof globalThis & LhCourseMapServerGlobal;
	g.__lhCourseMapUnsubscribe ??= subscribe((event) => {
		if (event.type === "turn-settled") onTurnSettled(event as ServerEvent<"turn-settled">);
	});
}

/** At app start: run again every build a quit cut short. */
export function resumeCourseMaps(): void {
	courseMapBuilder().resumeCut();
}

export type MaterialAdded = { ok: true; added: string[] } | { ok: false; status: 400 | 404 | 500 | 502; error: string };

/** Copy files into a course's material folder, register them, and extend
 *  its map from them. */
export async function addMaterial(workspace: string, files: ReadonlyArray<{ path: string; bytes: Uint8Array }>): Promise<MaterialAdded> {
	const { materialPath, MATERIAL_FOLDER, listCourses } = await import("./courses.ts");
	const listing = await listCourses();
	if (!listing.available) return { ok: false, status: 502, error: "LearnHarness could not reach your courses. Try again." };
	if (!listing.courses.some((c) => c.workspace === workspace)) return { ok: false, status: 404, error: "That course is no longer in your list." };
	const scanned = await stores.courseRecords.run(workspace, { verb: "sources", scan: true });
	const directory = scanned.ok && typeof (scanned.json as { directory?: unknown }).directory === "string" ? (scanned.json as { directory: string }).directory : workspace;
	const copied: string[] = [];
	try {
		for (const file of files) {
			const relative = materialPath(file.path);
			if (!relative) continue;
			const target = path.join(directory, MATERIAL_FOLDER, relative);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, file.bytes);
			copied.push(`${MATERIAL_FOLDER}/${relative}`);
		}
	} catch (error) {
		console.error(`[course-map] copy material into ${directory}: ${(error as Error).message}`);
		return { ok: false, status: 500, error: "The material could not be copied into the course folder. Check there is room on the disk, then try again." };
	}
	if (copied.length === 0) return { ok: false, status: 400, error: "Pick the files to add." };
	await courseMapBuilder().adopt(workspace, copied);
	const added = await stores.courseRecords.run(workspace, { verb: "sources", add: copied });
	if (!added.ok) {
		console.error(`[course-map] sources --add in ${workspace}: ${added.message}`);
		return { ok: false, status: 502, error: "The material could not be added to the course. Try again." };
	}
	emit("courses-changed", {});
	startCourseMap(workspace);
	return { ok: true, added: copied };
}

interface LhCourseContextGlobal {
	__lhCourseContexts?: CourseContexts;
}

/** The one context service, on the builder this module owns. */
export function courseContexts(): CourseContexts {
	const g = globalThis as typeof globalThis & LhCourseContextGlobal;
	return (g.__lhCourseContexts ??= createCourseContexts({
		courseRecords: stores.courseRecords,
		adopt: (workspace, except) => courseMapBuilder().adopt(workspace, except),
		startMap: startCourseMap,
	}));
}

/** At app start: watch every course's linked folders. */
export function watchCourseFolders(): () => void {
	return watchLinkedFolders({ contexts: courseContexts(), courseRecords: stores.courseRecords });
}
