import { refreshClaudeConnection } from "../agent/claude-connection.ts";

/** GET /api/subscriptions/claude: Claude Code's sign-in state, re-checked when `?refresh=1`. */
export async function claudeConnectionResponse(request: Request): Promise<Response> {
	const force = new URL(request.url).searchParams.get("refresh") === "1";
	const connection = await refreshClaudeConnection({ force });
	return Response.json({ connection }, { headers: { "Cache-Control": "no-store" } });
}
