/**
 * Setting up something new to learn, by conversation: the shapes the setup
 * agent's tools pass between the conversation and the server. Pure.
 *
 * Two kinds of learning share the whole engine (a map of topics, arcs,
 * lessons, practice, his record): a course, which may have an exam and
 * keeps spaced reviews, and a self-study, something he learns on his own
 * with no course behind it, which has neither and ends when he reaches its
 * goal. The engine marks a self-study with the course preference
 * `kind: "self-study"` (learning/preferences.py).
 */

/** What a file of his material is, as a survey reader sorts it. */
export const SURVEY_KINDS = ["slides", "book", "notes", "exercises", "past-exam", "syllabus", "other"] as const;
export type SurveyKind = (typeof SURVEY_KINDS)[number];

/** The exam facts a file states. */
export interface SurveyExam {
	date?: string;
	sessions?: string[];
	format?: string;
	coverage?: string;
}

/** One file, as its reader found it. */
export interface SurveyedFile {
	path: string;
	kind: SurveyKind;
	title: string;
	covers: string;
	course?: string;
	exam?: SurveyExam;
}

/** Every file the survey was given: sorted, or unread with why. */
export interface MaterialSurvey {
	files: SurveyedFile[];
	unread: { path: string; reason: string }[];
}

export const LEARNING_KINDS = ["course", "self-study"] as const;
export type LearningKind = (typeof LEARNING_KINDS)[number];

/** What the setup agent creates. `folder` is the folder that holds the
 *  course's material, which becomes the course itself, as his courses are
 *  kept (his vault's `university/msc/<course>/`); without it a new folder
 *  is made in `where` (a study folder listed to the agent). `files` and
 *  `folders` are more material from elsewhere: files are copied into the
 *  course, folders are linked and watched. */
export interface NewLearning {
	kind: LearningKind;
	title: string;
	/** What he wants to be able to do: a self-study's goal, a course's own. */
	goal?: string;
	folder?: string;
	where?: string;
	files?: string[];
	folders?: string[];
	websites?: { address: string; title?: string }[];
	/** A course's exam, as the material or he states it. */
	exam?: SurveyExam;
	/** His words that asked for it, kept as the reason its arcs may form
	 *  even once he has begun studying (arc_change.asked). */
	asked: string;
}

/** Made, with what of its material could not be linked; or why not. */
export type LearningCreated = { ok: true; workspace: string; title: string; kind: LearningKind; problems?: string[] } | { ok: false; error: string };

/** Expand a leading `~` to his home folder. Pure. */
export function expandHome(given: string, home: string): string {
	return given.replace(/^~(?=$|\/)/, home);
}
