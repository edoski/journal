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
	/** The due topics the engine lists (at most five of `due`), in its
	 *  order, each by title. */
	reviews: DueReview[];
	/** The path's current topic handle, when set. */
	current: string | null;
	/** That topic's title, when it has one. */
	currentTitle: string | null;
	/** The open task's title, when there is one. */
	task: string | null;
	/** The open task's current step, when the task has one. */
	step: string | null;
	/** The exam, when the record has a date for it: `daysLeft` is the
	 *  engine's own count from the study day. */
	exam: { date: string; daysLeft: number } | null;
	/** Days since the record last shows study (the engine's `last_studied`:
	 *  an observation or a topic taught); null when it shows none, even
	 *  when the course was saved. */
	lastActiveDaysAgo: number | null;
	/** Present for a self-study (the engine's `kind`). */
	selfStudy?: SelfStudy;
}

/** A self-study: learning he does on his own, with no exam and no spaced
 *  reviews, done once every topic of it is learned (the engine's
 *  `goal_reached`). */
export interface SelfStudy {
	goalReached: boolean;
}

/** The engine's `kind` and `goal_reached`, from a plan entry or a map. */
export function selfStudyOf(json: { kind?: unknown; goal_reached?: unknown }): { selfStudy: SelfStudy } | Record<string, never> {
	return json.kind === "self-study" ? { selfStudy: { goalReached: json.goal_reached === true } } : {};
}

/** One due review as `plan` lists it. */
export interface DueReview {
	/** The topic's title, else its handle. */
	title: string;
	/** Days past its review date. */
	overdue: number;
	/** The engine's note on what the learner gets wrong, when it has one. */
	gap: string | null;
}

/** What the chooser endpoint returns. `roots` are the study folders a new
 *  course can be created in. `available: false` means the engine could not
 *  be run (not installed or misconfigured): no session can start. */
/** What stops the engine reading a course (its `plan --all` entry's
 *  `problem`): the app may not open its folder, its record is not a valid
 *  record, or any other read failure. */
export type UnreadableProblem = "denied" | "damaged" | "unreadable";

/** A registered course whose record the engine could not read. `title` is
 *  the title a linked session carries, else the folder's name. */
export interface UnreadableCourse {
	workspace: string;
	title: string;
	problem: UnreadableProblem;
}

export type CourseListing =
	| { available: true; courses: CourseSummary[]; unreadable: UnreadableCourse[]; roots: string[] }
	| { available: false; reason: string };

/** One engine verb's outcome. `json` is the engine's own stdout object,
 *  passed to the agent verbatim. A `validation` failure saved nothing and
 *  names the field and the fix; `io` means the record could not be read or
 *  written; `unavailable` means the engine itself could not run. */
export type CourseResult =
	| { ok: true; json: unknown }
	| { ok: false; kind: "validation" | "io" | "unavailable"; message: string };

/** The engine's read and write verbs a lesson uses. `plan` is read for
 *  the exam run-up's figures; `days` is its horizon (one day unless set),
 *  how far ahead it lists reviews and the Journal's study windows. */
export type CourseVerb =
	| { verb: "resume"; task?: string }
	| { verb: "show"; handles: string[] | "all" }
	| { verb: "search"; query: string }
	| { verb: "save"; changes: unknown }
	/** Run a patch through every step of a save and write nothing: the
	 *  refusal a save would give, or ok. */
	| { verb: "check"; changes: unknown }
	/** Every arc with its standing, and where the learner stands: the
	 *  topics he has studied, the arcs held and the current arc. `here` is
	 *  the topic of the lesson in progress, `open` every open lesson's
	 *  topics, which only the app sees. `report` adds the rubric's
	 *  computable checks. */
	| { verb: "arcs"; here?: string | null; open?: readonly string[]; report?: boolean }
	| { verb: "plan"; days?: number }
	/** Where he stands for the exam, part by part, and each topic's open
	 *  mistakes (core/contracts/course-standing.ts). */
	| { verb: "standing" }
	/** Register files as the course's material; paths are relative to the
	 *  course folder. */
	| { verb: "sources"; add: readonly string[] }
	/** List the course folder's material and where that folder is, or with
	 *  a path that of a folder linked to the course, by the engine's rules. */
	| { verb: "sources"; scan: true | string }
	/** Delete the whole course record; the folder and its files stay. */
	| { verb: "forget-course" };

/** What a new course starts with: its title and, when known, the exam day
 *  (YYYY-MM-DD). */
export interface NewCourseRecord {
	title: string;
	exam: string | null;
}

/** Whether a whole course record (the engine's `show --all`) groups its
 *  topics into arcs: only then does an agent read the arcs doctrine. A v6
 *  record, or one whose arc pass has not run, has none. */
export function recordHasArcs(record: unknown): boolean {
	const arcs = (record as { arcs?: unknown } | null)?.arcs;
	return typeof arcs === "object" && arcs !== null && Object.keys(arcs).length > 0;
}

/** Display label for a course: its title, else the directory name. */
export function courseLabel(course: { workspace: string; title: string | null }): string {
	if (course.title) return course.title;
	const parts = course.workspace.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? course.workspace;
}

/** The learner's one-tap read of his own answer (Edoardo, 7 Nov 2026):
 *  three discrete states, no slider and no percentage. The one he chose
 *  rides a graded free-response answer or a practice submission
 *  (`chosenConfidence`). */
export const CONFIDENCE_STATES = ["guessing", "neutral", "confident"] as const;
export type Confidence = (typeof CONFIDENCE_STATES)[number];
export const DEFAULT_CONFIDENCE: Confidence = "neutral";

/** The confidence he chose, or none: Neutral is the meter left alone, not
 *  a choice (round 5: "Neutral" showed as his confidence when he had chosen
 *  none), so it never reaches the tutor or the record. The one gate every
 *  answer, submission and saved attempt passes through. */
export function chosenConfidence(state: unknown): Exclude<Confidence, "neutral"> | undefined {
	return state === "guessing" || state === "confident" ? state : undefined;
}

/** The control's choices, in display order. */
export const CONFIDENCE_CHOICES: readonly { state: Confidence; label: string }[] = [
	{ state: "guessing", label: "Guessing" },
	{ state: "neutral", label: "Neutral" },
	{ state: "confident", label: "Confident" },
];

export function isConfidence(value: unknown): value is Confidence {
	return (CONFIDENCE_STATES as readonly unknown[]).includes(value);
}
