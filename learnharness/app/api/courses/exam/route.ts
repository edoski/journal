import { answerExamSession } from "@/src/server";

export const dynamic = "force-dynamic";

/** His answer on the exam session gone by: `{workspace, outcome}`, with
 *  outcome `passed` or `not-this-time`. */
export async function POST(req: Request) {
	const body = (await req.json().catch(() => ({}))) as { workspace?: unknown; outcome?: unknown };
	const outcome = body.outcome === "passed" || body.outcome === "not-this-time" ? body.outcome : null;
	if (!outcome) return Response.json({ error: "Say how the exam went.", code: "bad_request" }, { status: 400 });
	const saved = await answerExamSession(typeof body.workspace === "string" ? body.workspace : "", outcome);
	if (!saved.ok) return Response.json({ error: saved.error, code: saved.code }, { status: saved.status });
	return Response.json({ ok: true });
}
