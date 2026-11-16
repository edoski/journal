/**
 * Round 11, root cause 4: the refusals left during probing (19 in the four
 * lenses' sessions) and teaching (29). Each costs one more model round trip.
 * The rules first drafts broke most often are stated in the tool fields
 * where the draft is written, and the guard holds each example to them, so
 * the field and the guard cannot drift apart.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explainInputBase, ONE_ASK_RULE } from "../src/core/question-core.ts";
import { compoundAsk, sentenceLoad, sentences, voiceBreaks, SENTENCE_WORDS } from "../src/core/voice-check.ts";
import { MESSAGE_DRAFT_RULES, sendToUserTool } from "../src/agent/tools/send-to-user.ts";

const quoted = (text: string) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

describe("a question's field states the one-ask rule (round 11: a reason asked as a second question)", () => {
	it("the question field of recall and explain carries it", () => {
		assert.ok(explainInputBase.properties.question.description!.includes(ONE_ASK_RULE));
	});

	it("its example is one ask, and the round-11 drafts it replaces are refused", () => {
		const [suffix, good] = quoted(ONE_ASK_RULE);
		assert.equal(suffix, ", and why?");
		assert.equal(compoundAsk(good!), null, good);
		for (const draft of [
			"What is the probability that exactly 3 answers are right? Why does that formula apply?",
			"What is the probability that exactly one bulb fails, and why does each factor of your expression belong there?",
		]) assert.ok(compoundAsk(draft), draft);
	});

	it("neither the field nor the voice spells out the ask drafts kept writing (round 10's counterexample)", async () => {
		const fs = await import("node:fs");
		const voice = fs.readFileSync(new URL("../src/agent/prompts/shared/10-voice.md", import.meta.url), "utf-8");
		for (const text of [voice, ONE_ASK_RULE]) assert.doesNotMatch(text, /why does each factor/);
		assert.match(voice, /It covers a formula's parts too/);
	});
});

describe("send_to_user's message field states the symbol rule and how length is counted", () => {
	it("the field carries them", () => {
		assert.ok(sendToUserTool.parameters.properties.message.description!.includes(MESSAGE_DRAFT_RULES));
	});

	it("its sentence opening on a word passes, and the one opening on a formula is refused", () => {
		const [good, bad] = quoted(MESSAGE_DRAFT_RULES);
		assert.ok(!voiceBreaks(good!, "teach").some((b) => b.rule === "symbol"), good);
		assert.ok(voiceBreaks(bad!, "teach").some((b) => b.rule === "symbol"), bad);
	});

	it("the count it states is the guard's: a joined clause and a long sentence each cost one more", () => {
		assert.match(MESSAGE_DRAFT_RULES, new RegExp(`over ${SENTENCE_WORDS} words is two`));
		assert.equal(sentenceLoad(sentences("The kernel is a subspace: it holds zero.")), 2);
		assert.equal(sentenceLoad(sentences(`${"word ".repeat(SENTENCE_WORDS)}ends here.`)), 2);
	});
});
