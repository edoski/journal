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

describe("engine doctrine", () => {
	it("every listed file exists in the engine's tutor references and has content", () => {
		assert.equal(PATHS.tutorReferences, path.join(path.dirname(PATHS.root), "learning", "skills", "tutor", "references"));
		assert.ok(ENGINE_DOCTRINE.length > 0);
		for (const file of ENGINE_DOCTRINE) {
			assert.ok(fs.readFileSync(path.join(PATHS.tutorReferences, file), "utf8").trim().length > 0, file);
		}
	});

	it("the course prompt is the app's adapter followed by each engine file, whole", () => {
		const doctrine = ENGINE_DOCTRINE.map((file) => fs.readFileSync(path.join(PATHS.tutorReferences, file), "utf8").trim());
		assert.equal(courseRecordPrompt(), [ADAPTER, ...doctrine].join("\n\n"));
		assert.ok(ADAPTER.startsWith("## The course record"));
	});

	it("fails when a listed file is missing", () => {
		for (const file of ENGINE_DOCTRINE.slice(1)) fs.writeFileSync(path.join(TMP, file), "kept");
		assert.throws(() => courseRecordPrompt(TMP), /ENOENT/);
	});

	it("the desktop package ships the references the build copies beside the server", () => {
		const builder = fs.readFileSync(path.join(PATHS.root, "electron-builder.yml"), "utf8");
		assert.match(builder, /- from: \.next\n\s+to: server\n\s+filter:\n\s+- "standalone\/\*\*\/\*"\n\s+- "learning\/\*\*\/\*"/);
	});
});
