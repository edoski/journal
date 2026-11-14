/**
 * THE canonical prompt-segment discovery. The agent layer owns it because
 * composition lives here: composeInstructions (teacher-agent.ts) composes
 * the source segments of this layer's own tree (src/agent/prompts — base,
 * shared/, per-agent fragments).
 *
 * SEGMENTS: the SHARED base (src/agent/system-prompt.md), then every
 * numeric-prefix *.md fragment in the agent's own directory (sorted by
 * filename), then the shared/ fragments directory (composed by BOTH
 * agents as a trailing appendix — the 2026-09-27 reorder).
 */

import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";
import { FRAGMENT_RE, type PromptAgent } from "../core/prompt-segments.ts";

const PROMPTS_DIR = path.join(PATHS.root, "src", "agent", "prompts");

/** Shared fragments the PRACTICE agent composes: the VOICE, ACCURACY,
 *  and MENTAL-MODEL chunks joined the formatting guide (owner rounds 13
 *  and the prompt-refinement round of 2026-10-07) — personality, the
 *  truth contract, and the thinking-fields doctrine are ONE law across
 *  every agent. The question/confidence/file mechanics stay out
 *  (practice has no such tools). */
const PRACTICE_SHARED_FRAGMENTS = ["10-voice.md", "15-accuracy.md", "16-mental-model.md", "40-formatting.md"];

/** List the SOURCE segments for one agent, in composition order — the
 *  shared base, then the agent's own fragments sorted by filename, then
 *  the shared/ fragments (the 2026-09-27 reorder: the agent's job and
 *  method lead; the shared tool/file/format mechanics are an appendix).
 *  The exact order composeInstructions composes them in. */
export function listSourceSegments(agent: PromptAgent): Array<{ path: string; shared: boolean; file: string }> {
	// PRACTICE (owner, 2026-10-04): its own directory plus a CURATED
	// shared appendix — the teaching base and the question/confidence/
	// file mechanics stay out (the doctrine contradicts them; 00-base.md
	// plays the base role), but the FORMATTING guide composes for every
	// agent (owner, 2026-10-04 late): LaTeX delimiters and markdown apply
	// in all settings — practice shares the $...$/$$...$$ authoring contract.
	const segments: Array<{ path: string; shared: boolean; file: string }> = agent === "practice" ? [] : [
		{ path: "system-prompt.md", shared: true, file: PATHS.teacherPrompt },
	];
	const dir = path.join(PROMPTS_DIR, agent);
	if (fs.existsSync(dir)) {
		const fragments = fs.readdirSync(dir).filter((f) => FRAGMENT_RE.test(f)).sort();
		for (const f of fragments) {
			segments.push({ path: `${agent}/${f}`, shared: false, file: path.join(dir, f) });
		}
	}
	const sharedDir = path.join(PROMPTS_DIR, "shared");
	if (fs.existsSync(sharedDir)) {
		// The practice allowlist (owner, 2026-10-04 late): formatting only.
		const allow = agent === "practice" ? PRACTICE_SHARED_FRAGMENTS : null;
		const sharedFragments = fs
			.readdirSync(sharedDir)
			.filter((f) => FRAGMENT_RE.test(f) && (allow === null || allow.includes(f)))
			.sort();
		for (const f of sharedFragments) {
			segments.push({ path: `shared/${f}`, shared: true, file: path.join(sharedDir, f) });
		}
	}
	return segments;
}

/** Every source segment's text for one agent, in composition order. */
export function sourcePromptTexts(agent: PromptAgent): string[] {
	return listSourceSegments(agent).map((segment) => {
		try {
			return fs.readFileSync(segment.file, "utf-8");
		} catch {
			return ""; // source unreadable — the agent loader would crash anyway
		}
	});
}

/** One file of the engine's doctrine: whole, or its opening (the title and
 *  the text before its first `## ` heading) followed by the listed `## `
 *  sections. `intro: false` keeps only the title of the opening, for an agent
 *  whose job the opening's general rules do not fit. */
export type DoctrinePart =
	| { readonly file: string }
	| { readonly file: string; readonly sections: readonly string[]; readonly intro?: false };

/** What each agent composes from the tutor skill's host-neutral references,
 *  so the tutor and the app teach from one text and each agent reads only
 *  the parts its job uses. Practice reads the exam run-up, whose figures
 *  its course brief carries. Left out: the week, which reads figures no
 *  brief carries, and *Difficulty*, which practice states more
 *  specifically in its own doctrine. The prober
 *  skips teaching.md's opening: it measures, and the lesson's teaching
 *  rules belong to the teacher. From records.md and course.md every agent
 *  reads only what keeps the record coherent across sessions: which texts
 *  the learner reads and how to write them, tasks and `focus`,
 *  `preferences`, and the exam facts. */
const ACROSS_SESSIONS: readonly DoctrinePart[] = [
	{ file: "records.md", sections: ["What the learner reads", "Path and tasks", "Preferences"], intro: false },
	{ file: "course.md", sections: ["Exam facts"], intro: false },
];

export const ENGINE_DOCTRINE: Readonly<Record<PromptAgent, readonly DoctrinePart[]>> = {
	prober: [
		{ file: "evidence.md" },
		{ file: "teaching.md", sections: ["Finding the edge"], intro: false },
		{ file: "reviews.md", sections: ["Today's review", "Review prompts and key points", "Missed reviews and lapses"] },
		...ACROSS_SESSIONS,
	],
	teacher: [
		{ file: "evidence.md" },
		{ file: "teaching.md", sections: ["The chain", "Hints", "Corrections and diagrams"] },
		{ file: "reviews.md", sections: ["Today's review", "Review prompts and key points", "Missed reviews and lapses", "The close"] },
		...ACROSS_SESSIONS,
	],
	practice: [
		{ file: "evidence.md" },
		{ file: "teaching.md", sections: ["Hints", "Practice problems", "Mixing methods", "Transfer", "Corrections and diagrams"] },
		{ file: "reviews.md", sections: ["Today's review", "Review prompts and key points", "Missed reviews and lapses", "The close", "Exam run-up"] },
		...ACROSS_SESSIONS,
	],
};

function doctrineText(dir: string, part: DoctrinePart): string {
	const text = fs.readFileSync(path.join(dir, part.file), "utf-8").trim();
	if (!("sections" in part)) return text;
	const [opening = "", ...rest] = `\n${text}`.split(/\r?\n(?=## )/);
	const picked = part.sections.map((title) => {
		const section = rest.find((chunk) => chunk.split(/\r?\n/, 1)[0]?.trim() === `## ${title}`);
		if (!section) throw new Error(`engine doctrine: no "## ${title}" in ${part.file}`);
		return section.trim();
	});
	const head = part.intro === false ? (opening.trim().split(/\r?\n/, 1)[0] ?? "") : opening.trim();
	return [head, ...picked].filter(Boolean).join("\n\n");
}

/** The course-record doctrine, appended to every agent's prompt in a
 *  course session: the app's adapter, then the agent's engine doctrine read
 *  from `dir`. Throws when a listed file or section is missing, so a rename
 *  in the engine fails the doctrine test instead of a lesson. */
export function courseRecordPrompt(agent: PromptAgent, dir: string = PATHS.tutorReferences): string {
	const adapter = fs.readFileSync(path.join(PROMPTS_DIR, "course", "10-record.md"), "utf-8").trim();
	return [adapter, ...ENGINE_DOCTRINE[agent].map((part) => doctrineText(dir, part))].join("\n\n");
}

/** What the course map builder composes: the one path-building recipe
 *  every host follows. */
export const COURSE_MAP_DOCTRINE: readonly DoctrinePart[] = [{ file: "course.md", sections: ["Building the path"], intro: false }];

/** The path-building recipe, read from `dir`. Throws like courseRecordPrompt
 *  when the section is renamed. */
export function courseMapDoctrine(dir: string = PATHS.tutorReferences): string {
	return COURSE_MAP_DOCTRINE.map((part) => doctrineText(dir, part)).join("\n\n");
}
