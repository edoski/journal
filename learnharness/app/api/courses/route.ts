import { deleteCourse, listCourses, renameCourse } from "@/src/server";

export const dynamic = "force-dynamic";

/** The course chooser: the learning engine's registered courses and study
 *  roots, or `available: false` when the engine cannot run. */
export async function GET() {
	return Response.json(await listCourses());
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
