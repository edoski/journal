/**
 * Crash-safe file replacement for the store adapters (#403).
 *
 * writeFileAtomicSync(file, text) writes a temp beside the target, fsyncs it,
 * and renames it over the target. On this path readers see the old bytes or
 * the complete new bytes. Callers keep building the exact bytes and keep
 * their own mkdirSync.
 *
 *   writeFileAtomicSync(file, JSON.stringify(record, null, "\t"));
 *   writeFileAtomicSync(file, text, { mode: 0o600 }); // secrets
 *   removeLeftoverTemps(file); // after deleting `file`
 *
 * Limits:
 *  - The rename path protects against process interruption during writes.
 *    The folder is not fsynced: this is not a power-loss durability guarantee.
 *  - No locking: two writers of one file still race, and the last one wins.
 *  - Rename replaces the named path, including a symlink, not its referent.
 *  - Crashes can leave `<file>.tmp-<uuid>` beside the target. Store listings
 *    only read names ending in .json or .md, so they skip it.
 *  - New files get `mode` (default 0o666 minus umask), not the old file's.
 */

import fs from "node:fs"; // default import on purpose: tests patch fs.renameSync on this object, namespace imports would not see it
import path from "node:path";
import { randomUUID } from "node:crypto";

const TEMP_MARKER = ".tmp-";

/** Replace `file` with `text` (UTF-8). Throws on failure, with the old file untouched. */
export function writeFileAtomicSync(file: string, text: string, options?: { mode?: number }): void {
	const tmp = `${file}${TEMP_MARKER}${randomUUID()}`;
	try {
		const fd = fs.openSync(tmp, "wx", options?.mode ?? 0o666);
		try {
			if (options?.mode !== undefined) fs.fchmodSync(fd, options.mode); // umask may have cleared bits of the create mode
			fs.writeFileSync(fd, text, "utf-8");
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}
		// `file` goes to renameSync exactly as given: test fault hooks match on it.
		fs.renameSync(tmp, file);
	} catch (error) {
		removeTemp(tmp); // the target was not touched
		throw error;
	}
}

/** Delete temp files that crashes left beside `file`. Call it after deleting `file`,
 *  or leftovers would keep the deleted record's newest bytes on disk. */
export function removeLeftoverTemps(file: string): void {
	const prefix = `${path.basename(file)}${TEMP_MARKER}`;
	let names: string[];
	try {
		names = fs.readdirSync(path.dirname(file));
	} catch (error) {
		// No folder means no leftovers. Anything else is reported, not thrown:
		// the record itself is already deleted.
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[store] could not look for temp files beside ${file}:`, error);
		return;
	}
	for (const name of names) if (name.startsWith(prefix)) removeTemp(path.join(path.dirname(file), name));
}

function removeTemp(tmp: string): void {
	try {
		fs.unlinkSync(tmp);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[store] could not remove temp file ${tmp}:`, error); // harmless: listings skip it
	}
}
