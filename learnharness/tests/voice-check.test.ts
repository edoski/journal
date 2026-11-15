/**
 * The voice, checked (src/core/voice-check.ts): recorded tutor turns are
 * held to it, and every text the agents read is held to it too, so an
 * instruction or example that models a banned form fails here instead of
 * in a lesson.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { PATHS } from "../config.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { CONCLUDE_ACK_TEXT, DONE_TONIGHT_TEXT, HANDOFF_TEXT, MODE_HANDOFF_TEXT, NEXT_PROBLEM_TEXT, sessionResumeText } from "../src/core/contracts/chat.ts";
import { PROBE_DONE_ACK_TEXT } from "../src/core/contracts/probe.ts";
import { promptVoiceBreaks, sessionVoiceBreaks, voiceBreaks, type TurnKind, type VoiceRule } from "../src/core/voice-check.ts";

const rules = (text: string, kind?: TurnKind) => voiceBreaks(text, kind).map((b) => b.rule);

/** Turns recorded in round 5's lessons (reports 2 and 8, 14 Nov 2026) and in
 *  this fix's baseline sessions, each with a rule it breaks. */
const BROKEN: ReadonlyArray<{ text: string; kind?: TurnKind; breaks: VoiceRule }> = [
	{ text: "Your binomial answer is right. The Poisson distribution is what the binomial becomes when $n$ is large and $p$ is small.", kind: "right", breaks: "feedback" },
	{ text: "That means it rests on both of today's topics, so each needs one clean answer first. Here is a fresh one on the distribution you missed.", breaks: "plan" },
	{ text: "That means it rests on both of today's topics, so each needs one clean answer first. Here is a fresh one on the distribution you missed.", breaks: "preview" },
	{ text: "Next is the binomial distribution, also due today.", breaks: "preview" },
	{ text: "Next you'll use the same capping move yourself, starting with $1/x$ at $a = 2$.", breaks: "preview" },
	{ text: "The Poisson distribution is built on random variables and the binomial distribution. You haven't yet got either right without help, and both come back for review today, so we'll start with them. Poisson itself is planned to start tomorrow, Monday 9 November.", breaks: "plan" },
	{ text: "Invertible matrices build on rank and determinants, and so far you've only got those right with help, so first a check on rank.", breaks: "plan" },
	{ text: "We'll start with kernel dimension, since your last answer on it was a confident miss.", breaks: "plan" },
	{ text: "You found the rank is $2$. So where in $\\mathbb{R}^3$ do all the outputs $Ax$ land?", kind: "hint", breaks: "length" },
	{ text: "You read the rank straight from the column span, and $\\operatorname{rank} A = 3$ was right.\nNext time, start with the question you left open: how many entries must $x$ have for $Ax$ to be defined, and so in which space $\\ker A$ lives. Then do part (c) of sheet 4.", kind: "close", breaks: "length" },
	{ text: "That is exactly it, and in the right order: kernel, then not invertible, then determinant.", breaks: "praise" },
	{ text: "Good timing: the shortcut works for every $2 \\times 2$ matrix.", breaks: "praise" },
	{ text: "What upper bound do you get for $|x+3|$, and what $\\delta$ does that give? Could one $\\delta$ work for every $a$?", breaks: "questions" },
	{ text: "### From the equation to numbers\n\nFor a $2 \\times 2$ matrix the characteristic polynomial has a shortcut.", kind: "teach", breaks: "headings" },
	{ text: "Want a quick question on it?", kind: "teach", breaks: "offer" },
	{ text: "You already know everything the Poisson formula is built from. The lesson starts with your chip example and works the formula out from it.", breaks: "plan" },
	// Round 9 (4 #2): "hello? did that go through?" sent while a question was open.
	{ text: "Your message arrived in the answer field for the method question, so that question is now closed. Here is a new matrix to work instead.", breaks: "machinery" },
];

/** The best passages of the same lessons: the voice as written. */
const CLEAN: ReadonlyArray<{ text: string; kind: TurnKind }> = [
	{ text: 'Take $\\varepsilon = 6$, so your choice gives $\\delta = 1$. Find an $x$ with $|x - 3| < 1$ but $|x^2 - 9| \\ge 6$, and say what this shows about the step "near 3, $x+3$ is about 6".', kind: "wrong" },
	{ text: "Your three values still add up to 1, so checking the total could not catch the mistake.", kind: "wrong" },
	{ text: "Every proof so far was at one fixed point. Continuity on all of $\\mathbb{R}$ means proving it at every point $a$ at once, with $a$ left as a letter.", kind: "teach" },
	{ text: "That's not right. You have $P(X=0)$ right, but the other two are wrong.", kind: "wrong" },
	{ text: "Which values of $X$ does \"at least 2\" leave out?", kind: "hint" },
];

describe("the voice checker on recorded turns", () => {
	for (const turn of BROKEN) {
		it(`flags ${turn.breaks}: ${turn.text.slice(0, 60)}`, () => {
			assert.ok(rules(turn.text, turn.kind).includes(turn.breaks), `${turn.breaks} not flagged in ${JSON.stringify(voiceBreaks(turn.text, turn.kind))}`);
		});
	}

	for (const turn of CLEAN) {
		it(`passes the voice as written: ${turn.text.slice(0, 60)}`, () => {
			assert.deepEqual(voiceBreaks(turn.text, turn.kind), []);
		});
	}

	it("lets a direct answer end on its one offer", () => {
		assert.ok(!rules("A kernel is the set of vectors a matrix sends to zero. Want a quick question on it?", "direct").includes("offer"));
	});

	it("flags the same advice line said twice in a session", () => {
		const found = sessionVoiceBreaks([
			{ text: "Plugging each basis vector back into $C$ catches that kind of slip in a few seconds." },
			{ text: "Multiplying your candidate by $A$ catches this kind of slip in a few seconds." },
		]);
		assert.deepEqual(
			found.filter((b) => b.rule === "repeat").map((b) => b.turn),
			[1],
		);
	});
});

const SKILL = path.join(path.dirname(PATHS.tutorReferences), "SKILL.md");

/** The agent tools' descriptions reach the model too (round 5: send_to_user
 *  listed "introductions, progress messages" and probe_done asked for a
 *  closing sentence), so their quoted text is held to the voice. */
const TOOLS_DIR = path.join(import.meta.dirname, "../src/agent/tools");
function toolWords(source: string): string {
	return [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => (m[1] ?? "").replaceAll("\\n", "\n")).join(" ");
}

/** Every text the agents read: each agent's composed prompt with its whole
 *  course doctrine, the turn markers the app sends, and the tutor skill. */
const TEXTS: ReadonlyArray<[string, string]> = [
	...(["prober", "teacher", "practice"] as const).map((agent): [string, string] => [`${agent} prompt`, `${composeInstructions(agent)}\n\n${courseRecordPrompt(agent, { arcs: true })}`]),
	...Object.entries(DONE_TONIGHT_TEXT).map(([agent, text]): [string, string] => [`Done for today (${agent})`, text]),
	...Object.entries(MODE_HANDOFF_TEXT).map(([mode, text]): [string, string] => [`handoff to ${mode}`, text]),
	["plan handoff", HANDOFF_TEXT],
	["next problem", NEXT_PROBLEM_TEXT],
	["conclude ack", CONCLUDE_ACK_TEXT],
	["probe ack", PROBE_DONE_ACK_TEXT],
	["continuing", sessionResumeText("Kernels", [{ id: "kernel", title: "Kernel" }], "Kernel")],
	["tutor skill", fs.readFileSync(SKILL, "utf8")],
	...fs.readdirSync(PATHS.tutorReferences).map((file): [string, string] => [`tutor ${file}`, fs.readFileSync(path.join(PATHS.tutorReferences, file), "utf8")]),
	...fs.readdirSync(TOOLS_DIR).filter((file) => file.endsWith(".ts")).map((file): [string, string] => [`tool ${file}`, toolWords(fs.readFileSync(path.join(TOOLS_DIR, file), "utf8"))]),
];

describe("every text the agents read follows the voice", () => {
	for (const [name, text] of TEXTS) {
		it(name, () => {
			assert.deepEqual(promptVoiceBreaks(text), [], `${name} models or asks for what the voice bans`);
		});
	}

	it("catches an example offered as a model, and passes one the text forbids", () => {
		assert.deepEqual(promptVoiceBreaks('Announce the job ("let me verify the version while we continue").').map((b) => b.rule), ["narration"]);
		assert.deepEqual(promptVoiceBreaks('Never narrate ("let me verify the version while we continue").'), []);
	});
});

describe("a message that doesn't attempt the question (round 9, 4 #2)", () => {
	const prompt = fs.readFileSync(path.join(import.meta.dirname, "../src/agent/prompts/shared/20-question-tools.md"), "utf8");
	it("is answered and the same question asked again, never closed as his answer", () => {
		assert.match(prompt, /\*\*A message is not an answer\.\*\*[^\n]*did that go through[^\n]*ask the same check again/);
	});
	it("is never told in the app's own words: no prompt the tutor reads calls his reply a field or a box", () => {
		assert.doesNotMatch(prompt, /answer (?:field|box)/i);
	});
});
