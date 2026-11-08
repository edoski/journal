/** The course prompt composes the learning engine's teaching doctrine from the same repository. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { PATHS } from "../config.ts";
import { ENGINE_DOCTRINE, courseRecordPrompt } from "../src/agent/prompt-segments.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-engine-doctrine-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const ADAPTER = fs.readFileSync(path.join(PATHS.root, "src", "agent", "prompts", "course", "10-record.md"), "utf8").trim();
const AGENTS = ["prober", "teacher", "practice"] as const;
/** Sections no agent composes, and why: the week and the exam run-up read
 *  figures the course brief lacks; practice states difficulty itself. */
const LEFT_OUT = { "teaching.md": ["Difficulty"], "reviews.md": ["The week", "Exam run-up"] } as const;
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const headings = (text: string) => text.split(/\r?\n/).filter((line) => line.startsWith("## ")).map((line) => line.slice(3));

function copyReferences(dir: string, edit: (file: string, text: string) => string = (_, text) => text) {
	fs.mkdirSync(dir, { recursive: true });
	for (const file of fs.readdirSync(PATHS.tutorReferences)) {
		fs.writeFileSync(path.join(dir, file), edit(file, fs.readFileSync(path.join(PATHS.tutorReferences, file), "utf8")));
	}
}

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
			assert.ok(!prompt.includes("The week") && !prompt.includes("Exam run-up"), `${agent} reads no figures it lacks`);
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
