/**
 * What the New course and Add material forms hold and how they read, kept
 * pure for tests: the exam day as the engine writes it, and the material
 * picked so far, one pick per press of Add files or Add a folder.
 */

/** One press of Add files or Add a folder. A folder's files carry their
 *  path inside it (`webkitRelativePath`), which the server keeps. */
export interface MaterialPick {
	kind: "files" | "folder";
	files: readonly File[];
}

/** A local calendar day as the engine writes it, YYYY-MM-DD. */
export function isoDay(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local Date at midnight of a YYYY-MM-DD day. */
export function dayDate(day: string): Date {
	const [year, month, date] = day.split("-").map(Number);
	return new Date(year!, month! - 1, date);
}

const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "Monday 14 December 2026". */
export function longDay(day: string): string {
	return LONG.format(dayDate(day)).replace(",", "");
}

/** The name a file is sent under: its path inside a picked folder, else its name. */
export function sentName(file: File): string {
	return file.webkitRelativePath || file.name;
}

/** A pick in words: a folder by its name, files by up to two names, never
 *  a count. */
export function pickWords(pick: MaterialPick): string {
	if (pick.kind === "folder") return sentName(pick.files[0]!).split("/")[0] ?? "";
	const [first, second] = pick.files.map((f) => f.name);
	if (second === undefined) return first ?? "";
	return pick.files.length > 2 ? `${first}, ${second} and more` : `${first} and ${second}`;
}

/** Every picked file as a `material` entry, under the name it is sent as. */
function appendMaterial(form: FormData, picks: readonly MaterialPick[]): FormData {
	for (const pick of picks) for (const file of pick.files) form.append("material", file, sentName(file));
	return form;
}

/** The form as the server reads it (app/api/courses, POST). */
export function newCourseForm({ title, exam, root, picks }: { title: string; exam: string | null; root: string; picks: readonly MaterialPick[] }): FormData {
	const form = new FormData();
	form.set("title", title.trim());
	if (exam) form.set("exam", exam);
	if (root) form.set("root", root);
	return appendMaterial(form, picks);
}

/** Add material's form as the server reads it (app/api/courses/material, POST). */
export function addMaterialForm({ workspace, picks }: { workspace: string; picks: readonly MaterialPick[] }): FormData {
	const form = new FormData();
	form.set("workspace", workspace);
	return appendMaterial(form, picks);
}
