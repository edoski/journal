import { courseMapFor } from "@/src/server";

export const dynamic = "force-dynamic";

/** The course map: `?workspace=` names a registered course; answers
 *  `{ok: true, map}` from the engine's read-only `map` verb, 404
 *  `unknown_course`, 502 `engine_failed` or 503 `engine_unavailable`. */
export async function GET(req: Request) {
	const workspace = new URL(req.url).searchParams.get("workspace") ?? "";
	const { status, body } = await courseMapFor(workspace);
	return Response.json(body, { status });
}
