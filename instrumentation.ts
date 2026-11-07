/** Checks every Claude account's sign-in once at server start: job respawns and
 * extraction gate on the cached status synchronously, and may run before
 * any page load or turn has refreshed it. */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { refreshClaudeConnections } = await import("./src/agent/claude-connection.ts");
	void refreshClaudeConnections().catch(() => {});
}
