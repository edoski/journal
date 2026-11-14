import { addMaterial } from "@/src/server";

export const dynamic = "force-dynamic";

/** Add material to a course, as a form: `workspace` and any number of
 *  `material` files, each named by its path in the picked folder. The
 *  course's map is extended from them in the background. */
export async function POST(req: Request) {
	const form = await req.formData().catch(() => null);
	if (!form) return Response.json({ error: "The material could not be read. Try again." }, { status: 400 });
	const workspace = form.get("workspace");
	const files: { path: string; bytes: Uint8Array }[] = [];
	for (const entry of form.getAll("material")) {
		if (typeof entry === "string") continue;
		files.push({ path: entry.name, bytes: new Uint8Array(await entry.arrayBuffer()) });
	}
	const added = await addMaterial(typeof workspace === "string" ? workspace : "", files);
	if (!added.ok) return Response.json({ error: added.error }, { status: added.status });
	return Response.json(added);
}
