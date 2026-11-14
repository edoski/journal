import { modelStatus } from "@/src/server";

/** The account every agent runs CLAUDE_MODEL on, whether it is signed in,
 *  and the model's context window (contracts/models.ts ModelStatus). */
export async function GET() {
	return Response.json(await modelStatus(), { headers: { "Cache-Control": "no-store" } });
}
