import { courseStandingRead } from "@/src/server";

export const dynamic = "force-dynamic";

/** The course page's read of where he stands for the exam and what is
 *  left to fix: `?workspace=` names a registered course. Answers `{ok:
 *  true, standing}` (null when the engine could not be read) or 404
 *  `unknown_course`. */
export async function GET(req: Request) {
	const { status, body } = await courseStandingRead(new URL(req.url).searchParams.get("workspace") ?? "");
	return Response.json(body, { status });
}
