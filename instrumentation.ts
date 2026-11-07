/** Checks Claude Code's sign-in once at server start: job respawns and
 * extraction gate on the cached status synchronously, and may run before
 * any page load or turn has refreshed it. */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { refreshClaudeConnection } = await import("./src/agent/claude-connection.ts");
	void refreshClaudeConnection();
}
