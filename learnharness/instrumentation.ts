/** Checks every Claude account's sign-in once at server start: job respawns and
 * extraction gate on the cached status synchronously, and may run before
 * any page load or turn has refreshed it. Then listens for the events that
 * build a course's map, and finishes a build a quit cut short. */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { refreshClaudeConnections } = await import("./src/agent/claude-connection.ts");
	const ready = refreshClaudeConnections().catch(() => {});
	const { listenForCourseMaps, resumeCourseMaps } = await import("./src/server/course-map.ts");
	listenForCourseMaps();
	// After the sign-in check: the builder's model may be a Claude account.
	void ready.then(resumeCourseMaps);
}
