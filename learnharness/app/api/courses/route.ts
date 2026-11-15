import { createCourse, deleteCourse, listCourses, renameCourse, type MaterialFile } from "@/src/server";

export const dynamic = "force-dynamic";

/** The course chooser: the learning engine's registered courses and study
 *  roots, or `available: false` when the engine cannot run. */
export async function GET() {
	return Response.json(await listCourses());
}

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === "string" ? value : "";
}

/** New course, as a form: `title`, optional `exam` (YYYY-MM-DD) and
 *  `root`, and any number of `material` files, each named by its path in
 *  the picked folder. Answers with the new CourseSummary. */
export async function POST(req: Request) {
	const form = await req.formData().catch(() => null);
	if (!form) return Response.json({ error: "The course could not be read. Try again.", code: "bad_request" }, { status: 400 });
	const material: MaterialFile[] = [];
	for (const entry of form.getAll("material")) {
		if (typeof entry === "string") continue;
		material.push({ path: entry.name, bytes: new Uint8Array(await entry.arrayBuffer()) });
	}
	const created = await createCourse({ root: text(form, "root"), title: text(form, "title"), exam: text(form, "exam") || null, material });
	if (!created.ok) return Response.json({ error: created.error, code: created.code }, { status: created.status });
	return Response.json(created.course);
}

/** Rename a course: `{workspace, title}`. */
export async function PATCH(req: Request) {
	const body = (await req.json().catch(() => ({}))) as { workspace?: unknown; title?: unknown };
	const changed = await renameCourse(typeof body.workspace === "string" ? body.workspace : "", typeof body.title === "string" ? body.title : "");
	if (!changed.ok) return Response.json({ error: changed.error, code: changed.code }, { status: changed.status });
	return Response.json({ ok: true });
}

/** Delete a course's record: `{workspace}`. Its folder and files stay. */
export async function DELETE(req: Request) {
	const body = (await req.json().catch(() => ({}))) as { workspace?: unknown };
	const changed = await deleteCourse(typeof body.workspace === "string" ? body.workspace : "");
	if (!changed.ok) return Response.json({ error: changed.error, code: changed.code }, { status: changed.status });
	return Response.json({ ok: true });
}
