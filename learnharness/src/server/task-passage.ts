/**
 * The text of the part he left a task at, from his own material (round 18,
 * M6: Continue on Problem sheet 4 drew "Part (c): show dim ker A = 2 for the
 * 3 × 5 matrix A" at once, but the matrix came only with the tutor's turn,
 * 64 to 80 s later, once it had found and read the sheet). A task's ref
 * names a source and a place in it, "Sheet 4". In a Markdown or text source
 * that place is the section whose heading names it, and the part he left is
 * the paragraph of it that holds the step's label, "(c)"; else the whole
 * section. A source of another kind, or a place no heading names, has no
 * passage, and the line shows the step alone.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CourseMap, TaskPlace } from "../core/contracts/course-map.ts";
import { continuedMapTaskOf } from "../core/lesson-place.ts";
import type { ContinuedTask, LhMessage } from "../core/native-messages.ts";
import { materialOf } from "./source-titles.ts";

const TEXT_FILES = new Set([".md", ".markdown", ".txt"]);

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/** Whether a heading names the place: it is the locator, or begins with it
 *  and goes on past a word's end ("Sheet 4: rank and nullity" for "Sheet
 *  4", never "Sheet 40"). */
function names(heading: string, locator: string): boolean {
	const h = heading.replace(/[*_`]/g, "").trim().toLowerCase();
	const l = locator.trim().toLowerCase();
	return h === l || (h.startsWith(l) && !/[\p{L}\p{N}]/u.test(h[l.length]!));
}

/** The passage of `text` at `locator` for `step` (see the module): null
 *  when no heading names the place or its section is empty. Pure. */
export function passageAt(text: string, locator: string, step: string | null): string | null {
	const lines = text.split(/\r?\n/);
	const at = lines.findIndex((line) => {
		const found = HEADING.exec(line);
		return found !== null && names(found[2]!, locator);
	});
	if (at < 0) return null;
	const level = HEADING.exec(lines[at]!)![1]!.length;
	const end = lines.findIndex((line, i) => i > at && (HEADING.exec(line)?.[1]?.length ?? Infinity) <= level);
	const section = lines.slice(at + 1, end < 0 ? undefined : end).join("\n");
	const paragraphs = section.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
	if (paragraphs.length === 0) return null;
	const label = step ? /\((?:[a-z]|[ivx]+)\)/i.exec(step)?.[0] : undefined;
	const holding = label ? paragraphs.filter((p) => p.includes(label)) : [];
	return holding.length === 1 ? holding[0]! : paragraphs.join("\n\n");
}

/** The first of a task's places that has a passage, read from its file in
 *  the course's material folder. */
export async function taskPassage(workspace: string, where: readonly TaskPlace[], step: string | null): Promise<string | null> {
	const material = await materialOf(workspace);
	for (const place of where) {
		if (!TEXT_FILES.has(path.extname(place.path).toLowerCase())) continue;
		const text = await fs.readFile(path.resolve(material, place.path), "utf8").catch(() => null);
		const passage = text === null ? null : passageAt(text, place.locator, step);
		if (passage) return passage;
	}
	return null;
}

/** The open task a session holds, as the map names it (`continuedTaskOf`),
 *  with the part's text from his material when a ref points to it. */
export async function continuedTask(map: CourseMap | undefined, messages: readonly LhMessage[]): Promise<ContinuedTask | null> {
	const task = continuedMapTaskOf(map, messages);
	if (!map || !task) return null;
	const passage = task.where ? await taskPassage(map.workspace, task.where, task.step) : null;
	return { title: task.title, step: task.step, ...(passage ? { passage } : {}) };
}
