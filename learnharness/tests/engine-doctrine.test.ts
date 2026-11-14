/** The course prompt composes the learning engine's teaching doctrine from the same repository. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { PATHS } from "../config.ts";
import { ARC_CUT_DOCTRINE, ARC_EDGES_DOCTRINE, ENGINE_DOCTRINE, composeDoctrine, courseMapDoctrine, courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { COURSE_MAP_INSTRUCTIONS } from "../src/agent/subagents/course-map-builder.ts";
import { DIGEST_INSTRUCTIONS, digestSystemPrompt } from "../src/agent/subagents/lesson-digest.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-engine-doctrine-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const ADAPTER = fs.readFileSync(path.join(PATHS.root, "src", "agent", "prompts", "course", "10-record.md"), "utf8").trim();
const AGENTS = ["prober", "teacher", "practice"] as const;
/** Sections no agent composes, and why: the week and the exam run-up read
 *  figures the course brief lacks; practice states difficulty itself. */
const LEFT_OUT = { "teaching.md": ["Difficulty"], "reviews.md": ["The week"] } as const;
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const headings = (text: string) => text.split(/\r?\n/).filter((line) => line.startsWith("## ")).map((line) => line.slice(3));

function copyReferences(dir: string, edit: (file: string, text: string) => string = (_, text) => text) {
	fs.mkdirSync(dir, { recursive: true });
	for (const file of fs.readdirSync(PATHS.tutorReferences)) {
		fs.writeFileSync(path.join(dir, file), edit(file, fs.readFileSync(path.join(PATHS.tutorReferences, file), "utf8")));
	}
}

/** arcs.md's `## ` sections by title, each as composed: heading and body, trimmed. */
function arcSections(dir: string = PATHS.tutorReferences): Map<string, string> {
	const text = fs.readFileSync(path.join(dir, "arcs.md"), "utf8").trim();
	return new Map(text.split(/\r?\n(?=## )/).slice(1).map((chunk) => [chunk.split(/\r?\n/, 1)[0]!.slice(3).trim(), chunk.trim()]));
}
const RECORD = ["What an arc is", "Placing a new topic", "Changing arcs"];
/** Every prompt path that reads arcs.md, and the sections it reads (design-v2, 3.0). */
const ARC_PATHS: ReadonlyArray<{ name: string; prompt: (dir?: string) => string; sections: readonly string[] }> = [
	{ name: "prober", prompt: (dir) => courseRecordPrompt("prober", dir), sections: [...RECORD, "Probing an arc's start"] },
	{ name: "teacher", prompt: (dir) => courseRecordPrompt("teacher", dir), sections: [...RECORD, "Teaching with arcs"] },
	{ name: "practice", prompt: (dir) => courseRecordPrompt("practice", dir), sections: [...RECORD, "Teaching with arcs"] },
	{ name: "course map builder", prompt: (dir) => courseMapDoctrine(dir), sections: RECORD },
	{ name: "lesson digest", prompt: (dir) => digestSystemPrompt(dir), sections: ["Placing a new topic"] },
	{ name: "arc cut", prompt: (dir) => composeDoctrine(ARC_CUT_DOCTRINE, dir), sections: ["What an arc is", "Forming arcs"] },
	{ name: "arc edges", prompt: (dir) => composeDoctrine(ARC_EDGES_DOCTRINE, dir), sections: [] },
];
/** A section's sentences long enough to identify it, never its heading. */
const sentences = (section: string) =>
	section.split(/\r?\n/).slice(1).flatMap((line) => line.split(/(?<=[.;:])\s+/)).map(normalize).filter((s) => s.length >= 40);
const ARC_RULE = /later arc|held arc|re-plan|arc_change/i;

describe("engine doctrine", () => {
	it("reads the engine's tutor references from the same repository", () => {
		assert.equal(PATHS.tutorReferences, path.join(path.dirname(PATHS.root), "learning", "skills", "tutor", "references"));
	});

	it("each agent's course prompt is the adapter, then each listed file or its opening and listed sections", () => {
		for (const agent of AGENTS) {
			const prompt = courseRecordPrompt(agent);
			assert.ok(prompt.startsWith(`${ADAPTER}\n\n`), agent);
			const expected = ["The course record", ...ENGINE_DOCTRINE[agent].flatMap((part) =>
				"sections" in part ? part.sections : headings(fs.readFileSync(path.join(PATHS.tutorReferences, part.file), "utf8")))];
			assert.deepEqual(headings(prompt), expected, agent);
			for (const title of ["# Evidence", "# Teaching", "# Reviews"]) assert.ok(prompt.includes(`\n${title}\n`), `${agent}: ${title}`);
		}
	});

	it("every section of teaching.md and reviews.md is composed by some agent or left out on purpose", () => {
		for (const [file, leftOut] of Object.entries(LEFT_OUT)) {
			const listed = new Set(Object.values(ENGINE_DOCTRINE).flat()
				.flatMap((part) => (part.file === file && "sections" in part ? part.sections : [])));
			for (const title of headings(fs.readFileSync(path.join(PATHS.tutorReferences, file), "utf8"))) {
				assert.ok(listed.has(title) !== (leftOut as readonly string[]).includes(title), `${file}: "## ${title}" is neither composed nor left out, or both`);
			}
		}
	});

	it("the prober skips teaching.md's opening; the teacher and practice read it", () => {
		const opening = "The learner does the thinking.";
		assert.ok(!courseRecordPrompt("prober").includes(opening));
		assert.ok(courseRecordPrompt("prober").includes("\n# Teaching\n"));
		assert.ok(courseRecordPrompt("teacher").includes(opening) && courseRecordPrompt("practice").includes(opening));
	});

	it("carries the rules the app's prompts point to", () => {
		const prober = normalize(courseRecordPrompt("prober"));
		assert.ok(prober.includes("Enter near the hardest thing the goal needs and let a miss walk you down."));
		assert.ok(prober.includes("choose each next one from the last answer's result, reasoning and confidence"));
		assert.ok(prober.includes("never re-ask what an answer already settled"));
		const teacher = normalize(courseRecordPrompt("teacher"));
		assert.ok(teacher.includes("Each conceptual step, one per message, is predict, teach, check"));
		assert.ok(teacher.includes("Skip it when there is nothing to anticipate"));
		const practice = normalize(courseRecordPrompt("practice"));
		for (const rung of ["R0", "R1", "R2", "R3", "R4", "R5"]) assert.ok(practice.includes(`| ${rung} |`), `the hint ladder lost ${rung}`);
		assert.ok(practice.includes("cue miss (nothing came to mind), discrimination error (a competing method won; record `chose`), execution slip (the right idea run wrongly), careless, or structural (a misconception;"));
	});

	it("every agent reads how to keep the record coherent from one session to the next", () => {
		for (const agent of AGENTS) {
			const prompt = normalize(courseRecordPrompt(agent));
			assert.ok(prompt.includes("When more than five topics are due, or the exam is 21 days away or less and any topic is due, an open-ended start says so in one line"), `${agent}: the backlog`);
			assert.ok(prompt.includes("with several and none in focus, name them in one line and ask which. Set `focus` to the task you continue in the first save after the choice."), `${agent}: focus`);
			assert.ok(prompt.includes('`{"preferences": {"explanation_depth": "Short first, details on request"}}` sets a course preference') && prompt.includes("A preference is never a `knowledge` entry."), `${agent}: preferences`);
			assert.ok(headings(courseRecordPrompt(agent)).includes("Exam facts"), `${agent}: exam facts`);
			assert.ok(prompt.includes('Write these to the learner, in plain words a reader understands after days away: "you", never "he" or "the learner"; no dates, observation ids or plan-node ids'), `${agent}: what the learner reads`);
		}
		for (const agent of ["teacher", "practice"] as const) {
			assert.ok(normalize(courseRecordPrompt(agent)).includes("Leave every open task true: rewrite the `step` of each one the session moved, remove one whose goal was met or that the session made obsolete"), `${agent}: the close`);
		}
	});

	it("the composed doctrine names none of the tutor's tools", () => {
		const skill = fs.readFileSync(path.join(PATHS.tutorReferences, "..", "SKILL.md"), "utf8");
		const tools = new Set(
			skill.split(/\r?\n/)
				.filter((line) => line.startsWith("| ") && !line.startsWith("| Need") && !line.startsWith("| ---"))
				.flatMap((line) => [...(line.split("|")[2]?.split(" with ")[0] ?? "").matchAll(/(?:^\s*|, |then |or )`([a-z_]+)`/g)].map((m) => m[1]!)),
		);
		assert.ok(tools.has("save") && tools.has("list_sources") && tools.has("guide"), [...tools].join(", "));
		for (const agent of AGENTS) {
			const doctrine = courseRecordPrompt(agent).slice(ADAPTER.length);
			for (const tool of tools) assert.ok(!doctrine.includes(`\`${tool}\``), `${agent}: the doctrine names the tool \`${tool}\``);
		}
	});

	it("every agent reads what resolves a gap, how a new topic joins the path, and how a hint's rung is judged", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) {
			const prompt = normalize(courseRecordPrompt(agent));
			assert.ok(prompt.includes("A `gap` is resolved, and set to `null`, only by an unaided correct answer to a question that invites it, on a later day than its repair"), `${agent}: a resolved gap`);
			assert.ok(prompt.includes("A new topic is added to the `needs` of the topics that build on it, and to `order` where it belongs"), `${agent}: a new topic`);
			assert.ok(prompt.includes("a topic missing from `order` goes just before the first ordered topic that builds on it, else just after its last prerequisite"), `${agent}: where a late topic lands`);
		}
		for (const agent of ["teacher", "practice"] as const) {
			assert.ok(normalize(courseRecordPrompt(agent)).includes("Record the rung of what the hint said, not of what was asked or meant."), `${agent}: the rung given`);
		}
		assert.ok(normalize(courseRecordPrompt("practice")).includes("once one other problem has come between, the retest comes next"), "practice: an owed retest");
	});

	it("carries the practice rules approved in the app, word for word", () => {
		const practice = normalize(courseRecordPrompt("practice"));
		for (const approved of [
			"When a nudge does not land, reassess where the learner is stuck and offer only the next necessary piece of information. Do not jump to the full solution. Tentative answers, questions, and thinking aloud remain work in progress.",
			"state the verdict plainly and localize the first break without giving the correction. Give the smallest nudge that lets the learner make the next move, then wait. If that nudge does not land, give another minimal nudge based on the new thinking. A failed attempt is never a reason to reveal the correction or conclude the problem. Continue until the learner finds and completes the correct solution.",
			"Structural misses call for minimal nudges toward repairing the misconception, not an immediate correction or re-teaching. Keep each nudge surgical; do not impose a one-line or one-attempt limit on the repair as a whole.",
		]) assert.ok(practice.includes(approved), `missing approved rule: ${approved}`);
		for (const retired of [
			/\b(?:one|single|1) bounded attempt\b/i,
			/If the repair attempt fails, reveal and move on/i,
			/when the trace shows genuine inability, drop straight to R5 and reveal/i,
			/Structural gets one surgical line/i,
			/the correction, stated once/i,
		]) assert.doesNotMatch(practice, retired);
	});

	it("each agent reads the parts its job uses", () => {
		const prober = headings(courseRecordPrompt("prober"));
		const teacher = headings(courseRecordPrompt("teacher"));
		const practice = headings(courseRecordPrompt("practice"));
		assert.ok(prober.includes("Finding the edge") && prober.includes("Today's review") && !prober.includes("The chain"));
		assert.ok(teacher.includes("The chain") && teacher.includes("Today's review") && teacher.includes("The close") && !teacher.includes("Practice problems"));
		assert.ok(practice.includes("Practice problems") && practice.includes("Hints") && !practice.includes("Finding the edge"));
		for (const agent of AGENTS) {
			const prompt = headings(courseRecordPrompt(agent));
			assert.ok(!prompt.includes("The week"), `${agent} reads no figures it lacks`);
			// Only practice's brief carries the run-up figures (course-brief tests).
			assert.equal(prompt.includes("Exam run-up"), agent === "practice", `${agent}: the exam run-up`);
		}
	});

	it("fails when a listed file is missing", () => {
		const dir = path.join(TMP, "missing-file");
		copyReferences(dir);
		fs.rmSync(path.join(dir, "teaching.md"));
		assert.throws(() => courseRecordPrompt("teacher", dir), /ENOENT/);
	});

	it("fails when a listed section is renamed", () => {
		const dir = path.join(TMP, "renamed-section");
		copyReferences(dir, (file, text) => (file === "teaching.md" ? text.replace("## Hints", "## Help") : text));
		assert.throws(() => courseRecordPrompt("practice", dir), /engine doctrine: no "## Hints" in teaching\.md/);
	});

	it("the course map builder reads the one path-building recipe: sources, true prerequisites, contrasts, exclusions, revision", () => {
		const recipe = courseMapDoctrine();
		assert.match(recipe, /^# Course, exam and path\n\n## Building the path\n/);
		for (const rule of [/Cite only registered sources/, /could the learner work an exercise on B having never seen A/, /go in `contrasts`/, /give it `excluded` with the reason/, /Keep every handle/, /`\$…\$`/]) assert.match(recipe, rule);
		assert.doesNotMatch(recipe, /## Exam facts/);
		const dir = path.join(TMP, "renamed-recipe");
		copyReferences(dir, (file, text) => (file === "course.md" ? text.replace("## Building the path", "## The path") : text));
		assert.throws(() => courseMapDoctrine(dir), /engine doctrine: no "## Building the path" in course\.md/);
	});

	it("every prompt path composes its arcs.md sections verbatim, and no sentence of any other", () => {
		const sections = arcSections();
		for (const { name, prompt, sections: listed } of ARC_PATHS) {
			const text = prompt();
			for (const title of listed) assert.ok(text.includes(sections.get(title) ?? `missing ## ${title}`), `${name}: "## ${title}" is not arcs.md's text`);
			const read = normalize(listed.map((title) => sections.get(title)!).join(" "));
			for (const [title, section] of sections) {
				if (listed.includes(title)) continue;
				for (const sentence of sentences(section).filter((s) => !read.includes(s))) {
					assert.ok(!normalize(text).includes(sentence), `${name} reads "${sentence}" from "## ${title}", which it does not list`);
				}
			}
		}
	});

	it("every section of arcs.md is read by some prompt path", () => {
		const read = new Set(ARC_PATHS.flatMap((p) => p.sections));
		for (const title of arcSections().keys()) assert.ok(read.has(title), `arcs.md "## ${title}" reaches no prompt`);
	});

	it("an edit to arcs.md reaches every path that reads the section, with no copy left behind", () => {
		const dir = path.join(TMP, "arcs-edited");
		const marks = new Map([...arcSections().keys()].map((title, i) => [title, `Edited sentence ${i} for the drift test.`]));
		copyReferences(dir, (file, text) => (file === "arcs.md" ? [...marks].reduce((t, [title, mark]) => t.replace(`## ${title}\n\n`, `## ${title}\n\n${mark} `), text) : text));
		for (const { name, prompt, sections } of ARC_PATHS) {
			for (const title of sections) assert.ok(prompt(dir).includes(marks.get(title)!), `${name}: "## ${title}" is not read from arcs.md`);
		}
	});

	it("no prompt file, app instruction or course.md section states an arc rule or pastes arcs.md", () => {
		const prompts = path.join(PATHS.root, "src", "agent", "prompts");
		const files = (fs.readdirSync(prompts, { recursive: true }) as string[]).filter((f) => f.endsWith(".md"));
		const texts: Array<[string, string]> = [
			...files.map((f): [string, string] => [`prompts/${f}`, fs.readFileSync(path.join(prompts, f), "utf8")]),
			["COURSE_MAP_INSTRUCTIONS", COURSE_MAP_INSTRUCTIONS],
			["DIGEST_INSTRUCTIONS", DIGEST_INSTRUCTIONS],
			["course.md", fs.readFileSync(path.join(PATHS.tutorReferences, "course.md"), "utf8")],
		];
		const all = [...arcSections().values()].flatMap(sentences);
		for (const [name, text] of texts) {
			assert.doesNotMatch(text, ARC_RULE, `${name} states an arc rule; it belongs in arcs.md`);
			for (const sentence of all) assert.ok(!normalize(text).includes(sentence), `${name} pastes arcs.md: "${sentence}"`);
		}
	});

	it("the edge step reads the prerequisite test alone, and nothing about arcs", () => {
		const edges = composeDoctrine(ARC_EDGES_DOCTRINE);
		assert.match(edges, /^# Course, exam and path\n\n## Building the path\n\n3\. \*\*Prerequisites\.\*\*/);
		assert.match(edges, /could the learner work an exercise on B having never seen A/);
		assert.doesNotMatch(edges, /\barcs?\b|4\. \*\*/i);
	});

	it("an arc's first lesson: the prober brackets its entry, the teacher's goal line is its purpose, and the close points elsewhere for the check", () => {
		const prober = normalize(courseRecordPrompt("prober"));
		const teacher = normalize(courseRecordPrompt("teacher"));
		assert.ok(prober.includes("its `entry`, are one more strand to bracket, lapsed topics first"));
		assert.ok(!teacher.includes("one more strand to bracket"), "the teacher recalls no entry a second time");
		assert.ok(teacher.includes("The lesson's one-line goal is the arc's purpose line, in your words: no other preamble, and teaching starts in the same turn."));
		assert.ok(teacher.includes("it points to **Check it** on the course page or to the next session, and never asks for a yes in this one"));
	});

	it("\"arc\" means only an arc of the course in the prompts that compose arcs.md", () => {
		const practice = path.join(PATHS.root, "src", "agent", "prompts", "practice");
		for (const file of fs.readdirSync(practice)) assert.doesNotMatch(fs.readFileSync(path.join(practice, file), "utf8"), /\barc\b/i, `practice/${file}`);
	});

	it("one meaning of excluded: no exam session examines it", () => {
		const recipe = normalize(courseMapDoctrine());
		assert.ok(recipe.includes("`excluded` is only for what no exam session of the course examines"));
		assert.ok(normalize(arcSections().get("Changing arcs")!).includes("`excluded` is only for what no exam session of the course ever examines"));
		assert.doesNotMatch(recipe, /What the exam leaves out stays out of the path/);
	});

	it("every example in course.md registers the sources it cites", () => {
		const text = fs.readFileSync(path.join(PATHS.tutorReferences, "course.md"), "utf8");
		for (const block of text.match(/```json\n[\s\S]*?```/g) ?? []) {
			const patch = JSON.parse(block.slice(8, -3)) as { sources?: Record<string, unknown> };
			const cited = [...block.matchAll(/"source": "([a-z0-9_-]+)"/g)].map((m) => m[1]!);
			for (const source of cited) assert.ok(patch.sources && source in patch.sources, `the example cites "${source}" and registers it`);
		}
	});

	it("reads sections from a checkout with Windows line endings", () => {
		const dir = path.join(TMP, "crlf");
		copyReferences(dir, (_, text) => text.replace(/\n/g, "\r\n"));
		for (const agent of AGENTS) assert.deepEqual(headings(courseRecordPrompt(agent, dir)), headings(courseRecordPrompt(agent)));
	});

	it("the desktop package ships the references the build copies beside the server", () => {
		const builder = fs.readFileSync(path.join(PATHS.root, "electron-builder.yml"), "utf8");
		assert.match(builder, /- from: \.next\n\s+to: server\n\s+filter:\n\s+- "standalone\/\*\*\/\*"\n\s+- "learning\/\*\*\/\*"/);
	});
});
