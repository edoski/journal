/** Checks every Claude account's sign-in once at server start: job respawns and
 * extraction gate on the cached status synchronously, and may run before
 * any page load or turn has refreshed it. Then finishes the work a quit cut
 * short, watches the course records other hosts write and the folders
 * linked to courses, listens for the events that build a course's map, and
 * starts Home's read. */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { refreshClaudeConnections } = await import("./src/agent/claude-connection.ts");
	const ready = refreshClaudeConnections().catch(() => {});
	// After the sign-in check: a respawned job's, a digest's or a course map
	// builder's model may be a Claude account. Loading the chat handler wires
	// the job runner.
	const [{ resumeLessonDigests }, { recoverStaleJobs }, { listenForCourseMaps, resumeCourseMaps, watchCourseFolders }] = await Promise.all([
		import("./src/server/chat-handler.ts"),
		import("./src/server/jobs.ts"),
		import("./src/server/course-map.ts"),
	]);
	listenForCourseMaps();
	void ready.then(() => {
		recoverStaleJobs();
		resumeLessonDigests();
		resumeCourseMaps();
	});
	const [{ watchCourses }, { stores }, { studyStatus }] = await Promise.all([import("./src/server/course-watch.ts"), import("./src/server/stores.ts"), import("./src/server/study.ts")]);
	watchCourses({ courseRecords: stores.courseRecords });
	// Home's read starts with the server, while the window opens, so the
	// window's own read finds the engine's runs under way or kept (round 15, P7).
	void studyStatus().catch(() => {});
	watchCourseFolders();
}
