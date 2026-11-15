import { courseContexts } from "@/src/server";

export const dynamic = "force-dynamic";

type Answer = { ok: true; value: unknown } | { ok: false; status: number; error: string };
const answer = (result: Answer) => (result.ok ? Response.json(result.value) : Response.json({ error: result.error }, { status: result.status }));
const NO_COURSE = Response.json({ error: "Name the course." }, { status: 400 });
const str = (v: unknown): string => (typeof v === "string" ? v : "");

async function body(req: Request): Promise<Record<string, unknown>> {
	return ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

/** A course's context (`?workspace=`): its description, linked folders,
 *  websites and files, read from its engine record. */
export async function GET(req: Request) {
	const workspace = new URL(req.url).searchParams.get("workspace") ?? "";
	if (!workspace) return NO_COURSE;
	return answer(await courseContexts().read(workspace));
}

/** Write the description: `{workspace, description}`; empty clears it. */
export async function PATCH(req: Request) {
	const b = await body(req);
	if (!str(b.workspace)) return NO_COURSE;
	return answer(await courseContexts().describe(str(b.workspace), str(b.description)));
}

/** Link a folder, `{workspace, folder}` (an absolute path), or a website,
 *  `{workspace, website, title?}`. Answers with the context. */
export async function POST(req: Request) {
	const b = await body(req);
	const workspace = str(b.workspace);
	if (!workspace) return NO_COURSE;
	if (typeof b.folder === "string") return answer(await courseContexts().linkFolder(workspace, b.folder));
	if (typeof b.website === "string") return answer(await courseContexts().addWebsite(workspace, b.website, str(b.title)));
	return Response.json({ error: "Name a folder or a website." }, { status: 400 });
}

/** Unlink one item: `{workspace, handle}`. Answers with the context. */
export async function DELETE(req: Request) {
	const b = await body(req);
	if (!str(b.workspace)) return NO_COURSE;
	return answer(await courseContexts().remove(str(b.workspace), str(b.handle)));
}
