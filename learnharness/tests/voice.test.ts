/**
 * THE VOICE (shared/10-voice.md): one text for how the tutor speaks to him.
 * Every agent that talks to him composes it whole; the lesson digest, which
 * writes only records he reads later, composes its register and punctuation.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { PATHS } from "../config.ts";
import { WRITTEN_VOICE, writtenVoice } from "../src/agent/prompt-segments.ts";
import { digestSystemPrompt } from "../src/agent/subagents/lesson-digest.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";

const VOICE = fs.readFileSync(path.join(PATHS.root, "src", "agent", "prompts", "shared", "10-voice.md"), "utf8").trim();
const section = (title: string) => VOICE.split(/\r?\n(?=### )/).find((c) => c.startsWith(`### ${title}`))!.trim();

describe("the voice", () => {
	it("composes whole into the prober, the teacher and practice", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) {
			assert.ok(composeInstructions(agent).includes(VOICE), `${agent} does not compose the voice`);
		}
	});

	it("gives the lesson digest its register and punctuation, without the turn budgets", () => {
		const prompt = digestSystemPrompt();
		for (const title of WRITTEN_VOICE) assert.ok(prompt.includes(section(title)), `digest lacks "### ${title}"`);
		assert.ok(!prompt.includes(section("How long each kind of turn is")), "digest composes the turn budgets");
	});

	it("refuses a voice section that is not there, so a rename fails here and not in a digest", () => {
		assert.throws(() => writtenVoice(["Tone"]), /no "### Tone" in shared\/10-voice\.md/);
	});

	it("follows its own punctuation rule", () => {
		assert.doesNotMatch(VOICE, /[–—]/);
	});
});
