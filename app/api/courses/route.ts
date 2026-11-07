import { createCourse, listCourses } from "@/src/server";

export const dynamic = "force-dynamic";

/** The course chooser: the learning engine's registered courses and study
 *  roots, or `available: false` when the engine cannot run. */
export async function GET() {
	return Response.json(await listCourses());
}

/** New course: `{root, title}` becomes the folder `<root>/<slug>`, made a
 *  titled course by the engine. Answers with the new CourseSummary. */
export async function POST(req: Request) {
	const body = (await req.json().catch(() => ({}))) as { root?: unknown; title?: unknown };
	const created = await createCourse(
		typeof body.root === "string" ? body.root : "",
		typeof body.title === "string" ? body.title : "",
	);
	if (!created.ok) return Response.json({ error: created.error, code: created.code }, { status: created.status });
	return Response.json(created.course);
}
