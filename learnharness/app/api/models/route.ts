import { modelStatus } from "@/src/server";

/** The account every agent runs CLAUDE_MODEL on, whether it is signed in,
 *  and the model's context window (contracts/models.ts ModelStatus).
 *  `?refresh=1` checks the sign-in again now. */
export async function GET(request: Request) {
	const force = new URL(request.url).searchParams.get("refresh") === "1";
	return Response.json(await modelStatus({ force }), { headers: { "Cache-Control": "no-store" } });
}
