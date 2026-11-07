/**
 * Course-record contracts: the bridge to the learner's `learning` engine.
 *
 * The engine (the journal repo's `learning` package) owns every course
 * record: topics, observations, reviews, tasks. The app never stores
 * assessment data; a session linked to a course reads and writes that
 * record through the CourseRecords port, so the tutor in other hosts and
 * the app share one memory.
 */

/** A session's link to one registered course, stamped at creation. */
export interface CourseLink {
	/** The study workspace directory, exactly as the engine registers it. */
	workspace: string;
	/** The course title at link time (display only; the engine owns it). */
	title: string;
}

/** One registered course as the chooser lists it. */
export interface CourseSummary {
	workspace: string;
	/** Absent when the record has no title yet. */
	title: string | null;
	/** Topics due for review today. */
	due: number;
	/** The path's current topic handle, when set. */
	current: string | null;
	/** The open task's title, when there is one. */
	task: string | null;
}

/** What the chooser endpoint returns. `roots` are the study folders a new
 *  course can be created in. `available: false` means the engine could not
 *  be run (not installed or misconfigured): no session can start. */
export type CourseListing =
	| { available: true; courses: CourseSummary[]; roots: string[] }
	| { available: false; reason: string };

/** One engine verb's outcome. `json` is the engine's own stdout object,
 *  passed to the agent verbatim. A `validation` failure saved nothing and
 *  names the field and the fix; `io` means the record could not be read or
 *  written; `unavailable` means the engine itself could not run. */
export type CourseResult =
	| { ok: true; json: unknown }
	| { ok: false; kind: "validation" | "io" | "unavailable"; message: string };

/** The engine's read and write verbs a lesson uses. */
export type CourseVerb =
	| { verb: "resume"; task?: string }
	| { verb: "show"; handles: string[] | "all" }
	| { verb: "search"; query: string }
	| { verb: "save"; changes: unknown };

/** Display label for a course: its title, else the directory name. */
export function courseLabel(course: { workspace: string; title: string | null }): string {
	if (course.title) return course.title;
	const parts = course.workspace.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? course.workspace;
}

/** The learner's one-tap read of his own answer (Edoardo, 7 Nov 2026):
 *  three discrete states, no slider and no percentage. It rides every
 *  graded free-response answer and every practice submission. */
export const CONFIDENCE_STATES = ["guessing", "neutral", "confident"] as const;
export type Confidence = (typeof CONFIDENCE_STATES)[number];
export const DEFAULT_CONFIDENCE: Confidence = "neutral";

/** The control's choices, in display order. */
export const CONFIDENCE_CHOICES: readonly { state: Confidence; label: string }[] = [
	{ state: "guessing", label: "Guessing" },
	{ state: "neutral", label: "Neutral" },
	{ state: "confident", label: "Confident" },
];

export function isConfidence(value: unknown): value is Confidence {
	return (CONFIDENCE_STATES as readonly unknown[]).includes(value);
}
