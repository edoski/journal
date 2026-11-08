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
			const expected = ["The course record", ...ENGINE_DOCTRINE[agent].flatMap(({ file, sections }) =>
				sections ?? headings(fs.readFileSync(path.join(PATHS.tutorReferences, file), "utf8")))];
			assert.deepEqual(headings(prompt), expected, agent);
			for (const title of ["# Evidence", "# Teaching", "# Reviews"]) assert.ok(prompt.includes(`\n${title}\n`), `${agent}: ${title}`);
		}
	});

	it("each agent reads the parts its job uses", () => {
		const prober = headings(courseRecordPrompt("prober"));
		const teacher = headings(courseRecordPrompt("teacher"));
		const practice = headings(courseRecordPrompt("practice"));
		assert.ok(prober.includes("Finding the edge") && prober.includes("Today's review") && !prober.includes("The chain"));
		assert.ok(teacher.includes("The chain") && teacher.includes("The close") && !teacher.includes("Practice problems"));
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
