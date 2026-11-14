import { answerMarks } from "@/src/server";

export const dynamic = "force-dynamic";

/** Each marked answer's mark in this session, as the engine recorded it:
 *  `{ok: true, marks}` keyed by the answer's tool call, 404 for an unknown
 *  session (server/marks.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const { status, body } = await answerMarks(id);
	return Response.json(body, { status });
}
