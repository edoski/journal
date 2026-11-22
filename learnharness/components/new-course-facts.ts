/**
 * What the Add material form holds and how it reads, kept pure for tests:
 * the material picked so far, one pick per press of Add files or Add a
 * folder. (A new course is set up by conversation since 22 Nov 2026.)
 */

/** One press of Add files or Add a folder. A folder's files carry their
 *  path inside it (`webkitRelativePath`), which the server keeps. */
export interface MaterialPick {
	kind: "files" | "folder";
	files: readonly File[];
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

/** Add material's form as the server reads it (app/api/courses/material, POST). */
export function addMaterialForm({ workspace, picks }: { workspace: string; picks: readonly MaterialPick[] }): FormData {
	const form = new FormData();
	form.set("workspace", workspace);
	return appendMaterial(form, picks);
}
