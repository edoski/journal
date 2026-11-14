/**
 * A course's context (spec: components/course-context/course-context.md):
 * what the tutor and the course map builder read about a course beyond
 * its topics, as GET /api/courses/context answers it. Everything lives in
 * the engine's course record: the description is the record's `goal`, and
 * folders, websites and files are its registered `sources`.
 */

/** A folder on his Mac linked to the course: a source whose path is the
 *  folder. Each readable file in it is registered as its own source, and
 *  the app watches it for new ones. */
export interface ContextFolder {
	handle: string;
	/** Absolute. */
	path: string;
	title: string;
}

/** A website linked to the course: a source whose path is its address. */
export interface ContextWebsite {
	handle: string;
	url: string;
	title: string;
}

/** A file registered on its own, outside any linked folder: material
 *  Add material copied into the course, or a file a lesson registered. */
export interface ContextFile {
	handle: string;
	/** As registered: relative to the course's material folder, or absolute. */
	path: string;
	title: string;
}

export interface CourseContext {
	workspace: string;
	/** The course in his words; empty when he wrote none. */
	description: string;
	folders: readonly ContextFolder[];
	websites: readonly ContextWebsite[];
	files: readonly ContextFile[];
}
