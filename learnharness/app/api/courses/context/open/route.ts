import { courseContexts } from "@/src/server";

export const dynamic = "force-dynamic";

/** Open a linked folder in Finder or a linked file in its app:
 *  `{workspace, handle}`. Only what the course links can be opened. */
export async function POST(req: Request) {
	const b = ((await req.json().catch(() => ({}))) ?? {}) as { workspace?: unknown; handle?: unknown };
	if (typeof b.workspace !== "string" || typeof b.handle !== "string") return Response.json({ error: "Name the course and what to open." }, { status: 400 });
	const opened = await courseContexts().open(b.workspace, b.handle);
	return opened.ok ? Response.json({ ok: true }) : Response.json({ error: opened.error }, { status: opened.status });
}
