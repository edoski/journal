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
		assert.ok(String((explainInputBase.properties.question as { description?: string }).description).includes(ONE_ASK_RULE));
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
		assert.ok(String((sendToUserTool.parameters.properties.message as { description?: string }).description).includes(MESSAGE_DRAFT_RULES));
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

describe("send_to_user's message field states round 12's most broken rule (round 12, 3 M1)", () => {
	it("a point is made once, in the words the refusal uses, one line of the list", async () => {
		const { MESSAGE_DRAFT_LINES } = await import("../src/agent/tools/send-to-user.ts");
		const line = MESSAGE_DRAFT_LINES.find((l) => l.startsWith("A point is made once"));
		assert.ok(line && MESSAGE_DRAFT_RULES.includes(line), "the field carries it");
		const fs = await import("node:fs");
		assert.match(fs.readFileSync(new URL("../src/agent/voice-guard.ts", import.meta.url), "utf-8"), /a point is made once/, "the refusal says the same");
	});
});

describe("the rules round 12's guard added are stated where the draft is written, so first drafts pass (round 12, M3's rules in M2's list)", async () => {
	const { MESSAGE_DRAFT_LINES } = await import("../src/agent/tools/send-to-user.ts");
	const line = (start: string) => {
		const found = MESSAGE_DRAFT_LINES.find((l) => l.startsWith(start));
		assert.ok(found && MESSAGE_DRAFT_RULES.includes(found), `the field carries "${start}…"`);
		return found;
	};

	it("a narrated handoff: its example is the one the guard refuses", () => {
		const [bad] = quoted(line("A handoff between teaching and practice"));
		assert.ok(voiceBreaks(bad!, "teach").some((b) => b.rule === "narration"), bad);
	});

	it("words in maths type: the prose example passes and the maths-type one is refused", () => {
		const [good, bad] = quoted(line("Words are prose, never maths type"));
		assert.ok(!voiceBreaks(good!, "teach").some((b) => b.rule === "maths-words"), good);
		assert.ok(voiceBreaks(bad!, "teach").some((b) => b.rule === "maths-words"), bad);
	});

	it("an answer called unsaved: the words it bans are the guard's", () => {
		const said = line("Every answer in the record stays saved");
		for (const draft of ["Your answer is unsaved.", "That answer is not saved."]) {
			assert.ok(voiceBreaks(draft, "teach").some((b) => b.rule === "unsaved"), draft);
			assert.match(said, /unsaved or not saved/);
		}
	});

	it("a guess he asks to make is posed as a prediction, said in the teach question's field beside its one-ask rule", async () => {
		const { explainInputObject, GUESS_RULE } = await import("../src/core/question-core.ts");
		const field = String((explainInputObject.properties.question as { description?: string }).description);
		assert.ok(field.includes(ONE_ASK_RULE) && field.includes(GUESS_RULE), field);
		assert.match(GUESS_RULE, /type predict/);
		assert.ok(!String((explainInputBase.properties.question as { description?: string }).description).includes(GUESS_RULE), "a probe question has no prediction to pose");
	});

	it("a demo's title, which the guard reads with its brief, carries no formula he is still to find", async () => {
		const { demoInputSchema } = await import("../src/agent/tools/jobs.ts");
		assert.match(String((demoInputSchema.properties.title as { description?: string }).description), /never a formula he is still to find/);
	});
});

describe("send_to_user's message field gives each kind of turn's budget, the guard's own (round 13, 3 N2)", () => {
	it("names every budget the guard counts, so a first draft fits it", async () => {
		const { SENTENCE_BUDGETS } = await import("../src/core/voice-check.ts");
		const { MESSAGE_DRAFT_LINES } = await import("../src/agent/tools/send-to-user.ts");
		const line = MESSAGE_DRAFT_LINES.find((l) => l.startsWith("Its length is"))!;
		for (const [kind, words] of [["teach", "a teaching turn"], ["right", "a right answer"], ["wrong", "a wrong answer"], ["hint", "a hint"], ["direct", "a direct answer to his question"], ["close", "closing words"]] as const) {
			const budget = SENTENCE_BUDGETS[kind];
			assert.ok(line.includes(`${words} ${budget}`), `${words}: ${budget}`);
			const fits = Array.from({ length: budget }, (_, i) => `The rank is ${i + 2} here.`).join(" ");
			assert.ok(!voiceBreaks(fits, kind).some((b) => b.rule === "length"), `${kind}: ${budget} sentences pass`);
			assert.ok(voiceBreaks(`${fits} The rank is one more.`, kind).some((b) => b.rule === "length"), `${kind}: one more is refused`);
		}
	});
});
