/** Checks every Claude account's sign-in once at server start: job respawns and
 * extraction gate on the cached status synchronously, and may run before
 * any page load or turn has refreshed it. Then finishes the work a quit cut
 * short, and watches the course records other hosts write. */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { refreshClaudeConnections } = await import("./src/agent/claude-connection.ts");
	const ready = refreshClaudeConnections().catch(() => {});
	// After the sign-in check: a digest's model may be a Claude account.
	const { resumeLessonDigests } = await import("./src/server/chat-handler.ts");
	void ready.then(resumeLessonDigests);
	const [{ watchCourses }, { stores }] = await Promise.all([import("./src/server/course-watch.ts"), import("./src/server/stores.ts")]);
	watchCourses({ courseRecords: stores.courseRecords });
}
