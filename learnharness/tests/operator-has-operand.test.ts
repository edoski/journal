/**
 * An operator with nothing it acts on (round 11, 2 n9): Explain instead
 * read "The rank of a matrix is the dimension of im, the space its columns
 * fill", the image written as a lone $\operatorname{im}$. The voice refuses
 * inline maths that is an operator alone, naming the fix: what it acts on,
 * or the word.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voiceBreaks } from "../src/core/voice-check.ts";

const rules = (text: string) => voiceBreaks(text, "teach").map((b) => b.rule);

describe("an operator alone in inline maths", () => {
	it("is refused, in a message and in a question", () => {
		assert.ok(rules("The rank of a matrix is the dimension of $\\operatorname{im}$, the space its columns fill.").includes("operand"));
		assert.ok(rules("What is the dimension of $\\ker$ here?").includes("operand"));
		assert.ok(voiceBreaks("What is $\\det$ for this one?").some((b) => b.rule === "operand"));
	});

	it("passes an operator with what it acts on, and the word", () => {
		assert.equal(rules("The rank is the dimension of $\\operatorname{im} A$, the space its columns fill.").includes("operand"), false);
		assert.equal(rules("So $\\dim \\ker A = 2$ and the image is a plane.").includes("operand"), false);
	});
});

describe("a course topic's name in the tutor's words (round 11, 2 n9)", () => {
	it("is spelt as its title spells it, as the voice says", async () => {
		const { readFileSync } = await import("node:fs");
		const voice = readFileSync(new URL("../src/agent/prompts/shared/10-voice.md", import.meta.url), "utf8");
		assert.match(voice, /a course topic spelt as its title spells it \("Diagonalization", never "diagonalisation" beside it\)/);
	});
});
