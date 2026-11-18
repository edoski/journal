/**
 * POST /api/chats/[id]/prestart: the lesson page that waits on his answer
 * asks for its next turn's Claude Code process (`{}`), and lets it go when
 * he leaves the page (`{ release: true }`, sent as a beacon). See
 * src/server/prestart.ts.
 */
import { prestartAnswerTurn, releasePrestart } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
	const { id } = await ctx.params;
	const body = (await req.json().catch(() => ({}))) as { release?: unknown };
	if (body?.release === true) releasePrestart(id);
	else await prestartAnswerTurn(id);
	return Response.json({ ok: true });
}
