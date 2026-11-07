import { courseLinkFor, getChat, stores } from "@/src/server";

/** Link a session to a registered course: the banner on a session created
 *  before every session had one, or whose course is no longer listed. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!getChat(id)) return Response.json({ error: "Not found" }, { status: 404 });
	const body = (await req.json().catch(() => ({}))) as { workspace?: unknown };
	const course = typeof body.workspace === "string" ? await courseLinkFor(body.workspace) : null;
	if (!course) return Response.json({ error: "Unknown course", code: "unknown_course" }, { status: 400 });
	stores.chatStore.linkCourse(id, course);
	return Response.json({ course });
}
