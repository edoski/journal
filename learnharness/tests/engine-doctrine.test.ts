/** The course prompt composes the learning engine's teaching doctrine from the same repository. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { PATHS } from "../config.ts";
import { ENGINE_DOCTRINE, courseRecordPrompt, engineDoctrineSection } from "../src/agent/prompt-segments.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-engine-doctrine-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
fs.writeFileSync(path.join(TMP, "ref.md"), "# Title\n\n## One\n\nfirst\n\n### Detail\n\nkept\n\n## Two\n\nsecond\n");

describe("engine doctrine", () => {
	it("every referenced section exists in the engine's tutor references", () => {
		assert.equal(PATHS.tutorReferences, path.join(path.dirname(PATHS.root), "learning", "skills", "tutor", "references"));
		for (const entry of ENGINE_DOCTRINE) {
			const section = engineDoctrineSection(PATHS.tutorReferences, entry);
			assert.ok(section.startsWith(`## ${entry.section}\n`), `${entry.file}: ${entry.section}`);
			assert.ok(section.split("\n").length > 2, `${entry.file}: ${entry.section} has a body`);
		}
	});

	it("the course prompt is the app's adapter followed by the engine's sections", () => {
		const prompt = courseRecordPrompt();
		assert.ok(prompt.startsWith("## The course record"));
		for (const entry of ENGINE_DOCTRINE) assert.ok(prompt.includes(`\n\n${engineDoctrineSection(PATHS.tutorReferences, entry)}`), entry.section);
	});

	it("takes a section up to the next heading of its level", () => {
		assert.equal(engineDoctrineSection(TMP, { file: "ref.md", section: "One" }), "## One\n\nfirst\n\n### Detail\n\nkept");
		assert.equal(engineDoctrineSection(TMP, { file: "ref.md", section: "Two" }), "## Two\n\nsecond");
	});

	it("fails on a missing file or heading", () => {
		assert.throws(() => engineDoctrineSection(TMP, { file: "renamed.md", section: "One" }), /ENOENT/);
		assert.throws(() => engineDoctrineSection(TMP, { file: "ref.md", section: "Gone" }), /no "## Gone" in ref.md/);
	});
});
