import { courseMapStatus, startCourseMap } from "@/src/server";

export const dynamic = "force-dynamic";

/** Where a course's map stands: building, built (with what the last build
 *  saved), failed (with why, in words the learner reads) or none. */
export async function GET(req: Request) {
	const workspace = new URL(req.url).searchParams.get("workspace") ?? "";
	if (!workspace) return Response.json({ error: "Name the course." }, { status: 400 });
	return Response.json(courseMapStatus(workspace));
}

/** Build the course's map again from the material no build read: `{workspace}`. */
export async function POST(req: Request) {
	const body = (await req.json().catch(() => ({}))) as { workspace?: unknown };
	if (typeof body.workspace !== "string" || !body.workspace) return Response.json({ error: "Name the course." }, { status: 400 });
	startCourseMap(body.workspace);
	return Response.json({ ok: true });
}
