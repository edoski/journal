/**
 * The course map builder's ledgers: one JSON map in the app's data folder,
 * course workspace → what its builds read (core/course-map-build.ts). The
 * map itself lives in the engine's course record; this file only keeps
 * which material a build already read, so material is read once.
 */

import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";
import type { CourseMapLedger } from "../core/course-map-build.ts";
import type { CourseMapLedgers } from "../core/ports.ts";
import { writeFileAtomicSync } from "./atomic-write.ts";

const FILE = () => path.join(PATHS.data, "course-maps.json");

function readAll(): Record<string, CourseMapLedger> {
	try {
		const parsed = JSON.parse(fs.readFileSync(FILE(), "utf-8")) as unknown;
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, CourseMapLedger>) : {};
	} catch {
		return {};
	}
}

export const courseMapLedgers: CourseMapLedgers = {
	get(workspace) {
		const ledger = readAll()[workspace];
		return ledger && Array.isArray(ledger.done) ? ledger : undefined;
	},
	workspaces() {
		return Object.keys(readAll());
	},
	save(workspace, ledger) {
		const all = readAll();
		all[workspace] = ledger;
		fs.mkdirSync(path.dirname(FILE()), { recursive: true });
		writeFileAtomicSync(FILE(), JSON.stringify(all, null, "\t"), { allowInPlaceFallback: true });
	},
	forget(workspace) {
		const all = readAll();
		if (!(workspace in all)) return;
		delete all[workspace];
		writeFileAtomicSync(FILE(), JSON.stringify(all, null, "\t"), { allowInPlaceFallback: true });
	},
};
