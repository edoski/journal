import { topicRead } from "@/src/server";

export const dynamic = "force-dynamic";

/** The topic page's read: `?workspace=` names a registered course,
 *  `?topic=` one of its topics, and `task` and `session` repeat for the
 *  open tasks that hold it and its sessions. Answers `{ok: true, record,
 *  plans}` (the engine's attempts and task days, each session's plan),
 *  400 `bad_request` or 404 `unknown_course`. */
export async function GET(req: Request) {
	const query = new URL(req.url).searchParams;
	const { status, body } = await topicRead(
		query.get("workspace") ?? "",
		query.get("topic") ?? "",
		query.getAll("task").filter(Boolean),
		query.getAll("session"),
	);
	return Response.json(body, { status });
}
