/**
 * Round 8, the tutor's words (lesson reading M2, M3, m1, m2, m5, m6, m10,
 * m11; robustness #11; daily loop §1). Each slip below is a turn a round-8
 * evaluator read, word for word from the session records, and each failed
 * on the head the round ran (89e187bd).
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { LhMessage } from "../src/core/native-messages.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-round8-voice-"));
const originalEnv = process.env;
process.env = { ...originalEnv, NODE_ENV: "test", LH_DATA_DIR: path.join(scratch, "data"), HOME: path.join(scratch, "home") };
after(() => {
	process.env = originalEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const { VoiceGuard } = await import("../src/agent/voice-guard.ts");
const { voiceBreaks, SENTENCE_WORDS } = await import("../src/core/voice-check.ts");
const { SEND_TO_USER_TOOL, newUserMessage, newHandoffMessage } = await import("../src/core/native-messages.ts");
const { HANDOFF_TEXT } = await import("../src/core/contracts/chat.ts");

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const ask = (question: string, tool = "explain", extra: Record<string, unknown> = {}): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: tool, arguments: { question, type: "check", ...extra } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (callId: string, text: string, details: Record<string, unknown> = {}): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-08T21:00:00Z", ...details }, isError: false, timestamp: 1 }) as LhMessage;
const hinted = (callId: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "recall", content: [{ type: "text", text: "hint" }], details: { kind: "explain", hintRequested: true }, isError: false, timestamp: 1 }) as LhMessage;
const thinking = (text: string): LhMessage => ({ id: `t-${++n}`, role: "custom", customType: "practice-thinking", content: `Your thinking: ${text}`, display: true, details: {}, timestamp: 1 }) as LhMessage;

function answering(text: string, details: Record<string, unknown> = {}): LhMessage[] {
	const q = ask("A question.");
	return [newUserMessage("Invertible matrices"), assistant([q]), answered(q.id, text, details)];
}

const rules = (guard: InstanceType<typeof VoiceGuard>, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};
const refusalText = (guard: InstanceType<typeof VoiceGuard>, call: ToolCall): string => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { content: Array<{ text: string }> } | null> }).decisions.get(call.id);
	return refused?.content[0]?.text ?? "";
};
const ruled = (text: string, kind?: Parameters<typeof voiceBreaks>[1]) => voiceBreaks(text, kind).map((b) => b.rule);

describe("length counts what he reads, not full stops (M3, m10)", () => {
	it("refuses the Poisson rewrite that glued a seven-sentence draft into one long run", () => {
		// The shown rewrite, word for word.
		const glued =
			"Today: where the Poisson formula comes from, built from your own slot idea.\n\nCut the hour into $n$ slots, each independently holding an email with probability $4/n$, so the average stays $n \\cdot \\frac{4}{n} = 4$ for every $n$, and the email count is binomial:\n\n$$X_n \\sim \\text{Bin}\\!\\left(n, \\tfrac{4}{n}\\right).$$\n\nAt $n = 60$ a slot holds at most one email, while real emails can land in the same minute. Smaller slots make that flaw shrink, so the exact answer is what these binomials approach as $n \\to \\infty$.";
		assert.ok(ruled(glued, "teach").includes("length"));
		assert.ok(ruled(glued, "teach").includes("plan"));
	});

	it("refuses the Invertible rewrite that joined two sentences with a colon", () => {
		const joined =
			"Picture three arrows in $\\mathbb{R}^3$, no two of them parallel, all lying in one plane: every pair looks independent, yet together they span only a plane, so a matrix with those rows has rank $2$. Checking pairs can never catch a row that is a combination of the others. Elimination does, because such a row turns into a zero row. The rank is the number of pivots that survive.";
		assert.ok(ruled(joined, "teach").includes("length"));
	});

	it("refuses a hint of two cues joined by a semicolon", () => {
		assert.ok(ruled("The off-diagonal entries $1$ and $5$ stay where they are but change sign; then ask what number the whole matrix is divided by.", "hint").includes("length"));
		assert.deepEqual(ruled("Which number is the whole matrix divided by?", "hint"), []);
	});

	it("leaves a colon before a display alone, and states its word limit in the voice", () => {
		assert.deepEqual(ruled("Elimination turns the third row into zeros:\n\n$$\nR_3 - R_2 = 0\n$$", "teach"), []);
		const voice = fs.readFileSync(new URL("../src/agent/prompts/shared/10-voice.md", import.meta.url), "utf8");
		assert.equal(SENTENCE_WORDS, 25);
		assert.match(voice, /a sentence over twenty-five words counts as two/);
	});

	it("tells the rewrite to cut, not join", () => {
		const guard = new VoiceGuard([newUserMessage("Poisson")]);
		assert.match(refusalText(guard, send("One. Two. Three. Four. Five. Six.")), /cut whole sentences/);
	});
});

describe("rewrites are read again, and the guard's misses (m1, m2)", () => {
	it("refuses a rewrite that opens on a formula (the verdict rewrite)", () => {
		const opened = "$\\left(\\frac16\\right)^3\\left(\\frac56\\right)^7$ is right as the probability of one particular order, but it is not the whole answer.";
		assert.ok(ruled(opened, "wrong").includes("symbol"));
	});

	it("reads a rewrite against every rule again before showing it", () => {
		const guard = new VoiceGuard(answering("rank 2"));
		assert.deepEqual(rules(guard, send("You got it right: rank 2.")), ["echo"]);
		assert.deepEqual(rules(guard, send("$2$ pivots survive, so the rank is $2$.")), ["symbol"]);
	});

	it("holds the turn's question once for each refused message, so the second rewrite still comes first", () => {
		const guard = new VoiceGuard(answering("rank 2"));
		assert.deepEqual(rules(guard, send("You got it right: rank 2.")), ["echo"]);
		assert.deepEqual(rules(guard, ask("What is $\\dim \\ker A$?")), ["owed"]);
		assert.deepEqual(rules(guard, send("Yes, rank 2.")), ["echo"]);
		assert.deepEqual(rules(guard, ask("What is $\\dim \\ker A$?")), ["owed"]);
		assert.deepEqual(rules(guard, send("The pivots sit in columns 1 and 3.")), []);
		assert.deepEqual(rules(guard, ask("What is $\\dim \\ker A$?")), []);
	});

	it("asks for a reason as \", and why?\", never \"with the reason the formula counts it\"", () => {
		const guard = new VoiceGuard(answering("x"));
		const text = refusalText(guard, ask("A fair die is rolled $10$ times. Write $P(X = 3)$ and explain why that formula counts it.", "recall"));
		assert.match(text, /end the first ask with ", and why\?"/);
	});

	it("passes \"rank–nullity\", a name joined by an en dash, and still refuses a dash as punctuation", () => {
		assert.ok(!ruled("On a $3 \\times 3$ matrix both counts agree, which is the rank–nullity theorem at work.", "close").includes("dash"));
		assert.ok(!ruled("Read pages 3–5.").includes("dash"));
		assert.ok(ruled("Both counts agree — on a square matrix.").includes("dash"));
		assert.ok(ruled("Both counts agree – on a square matrix.").includes("dash"));
	});

	it("refuses \"That reasoning holds:\", which grades a right answer", () => {
		const guard = new VoiceGuard(answering("-4, because ln(1+u) is about u for small u, so n * (-4/n)"));
		assert.deepEqual(rules(guard, send("That reasoning holds: $\\ln(1 - 4/n) \\approx -4/n$, so the exponent tends to $-4$.")), ["echo"]);
		const live = new VoiceGuard(answering("at most 2 I think, since a3 is in the span of a1 and a2"));
		assert.deepEqual(rules(live, send("That holds: the column space is $\\operatorname{span}(a_1, a_2, a_3)$, and $a_3$ adds nothing new to it.")), ["echo"], "this fix's own live run");
		const complete = new VoiceGuard(answering("det A = 0: the cube goes to a flat parallelepiped"));
		assert.deepEqual(rules(complete, send("Your reasoning is complete: the image of the cube lies in a plane, so the volume factor is $0$.")), ["echo"], "this fix's own live run");
	});
});

describe("the first teaching step builds on the probe (M2, m11)", () => {
	const probeQuestion = ask("What is the rank of this matrix, and how do you know?\n\n$$\nA = \\begin{pmatrix} 1 & 2 & 3 \\\\ 2 & 5 & 7 \\\\ 1 & 3 & 4 \\end{pmatrix}\n$$", "recall");
	const later = ask("Is this matrix invertible?\n\n$$\nP = \\begin{pmatrix} 2 & 0 & 1 \\\\ 1 & 3 & 0 \\\\ 0 & 1 & 1 \\end{pmatrix}\n$$", "recall");
	const handoff = (): LhMessage[] => [newUserMessage("Invertible matrices"), assistant([probeQuestion]), answered(probeQuestion.id, "rank 3"), assistant([later]), answered(later.id, "yes, det 7"), newHandoffMessage("c1") as LhMessage];
	const repeat =
		"Checking pairs can never catch a row that is a combination of the others. Elimination does:\n\n$$\n\\begin{pmatrix} 1 & 2 & 3 \\\\ 2 & 5 & 7 \\\\ 1 & 3 & 4 \\end{pmatrix} \\to \\begin{pmatrix} 1 & 2 & 3 \\\\ 0 & 1 & 1 \\\\ 0 & 0 & 0 \\end{pmatrix}\n$$";

	it("refuses a teaching step that shows again the matrix the probe already worked through", () => {
		const text = refusalText(new VoiceGuard(handoff()), send(repeat));
		assert.match(text, /already seen this matrix/);
	});

	it("lets a reply work on the matrix of the question it answers", () => {
		const reply = "That's not right: elimination leaves a zero row.\n\n$$\n\\begin{pmatrix} 2 & 0 & 1 \\\\ 1 & 3 & 0 \\\\ 0 & 1 & 1 \\end{pmatrix}\n$$";
		assert.ok(!rules(new VoiceGuard(handoff().slice(0, 5)), send(reply)).includes("repeat"));
	});

	it("refuses the \"Today: …\" goal line, and the handoff no longer asks for it", () => {
		assert.ok(ruled("Today: why $\\ker A = \\{0\\}$, full rank and $\\det A \\neq 0$ all say that $A$ can be undone.").includes("plan"));
		assert.doesNotMatch(HANDOFF_TEXT, /goal in one line/);
		assert.match(HANDOFF_TEXT, /already read the probe's feedback/);
	});
});

describe("an unsure answer gets words, and work left open gets a way on (§1, #11)", () => {
	it("holds the next question after a right answer he marked a guess until he gets a sentence on it", () => {
		const guard = new VoiceGuard(answering("det A = 0 I think, because A squashes v to zero", { confidence: "guessing" }));
		assert.deepEqual(rules(guard, ask("What is the rank of this matrix?", "recall")), ["unsure"]);
		assert.deepEqual(rules(guard, send("A nonzero $v$ with $Av = 0$ makes the columns dependent, so the cube is flattened and the volume factor is $0$.")), []);
		assert.deepEqual(rules(guard, ask("What is the rank of this matrix?", "recall")), []);
	});

	it("reads \"not sure why\" in his words as unsure too, and leaves a sure right answer alone", () => {
		const unsure = new VoiceGuard(answering("T(a,b) = aT(1,0) + bT(0,1). Not sure why I'm allowed to split T like that though", { confidence: "guessing" }));
		assert.deepEqual(rules(unsure, ask("What is $T(2, 3)$?")), ["unsure"]);
		const sure = new VoiceGuard(answering("rank 2: R3 - R1 = R2, two pivots", { confidence: "confident" }));
		assert.deepEqual(rules(sure, ask("What is $T(2, 3)$?")), []);
	});

	it("tells the tutor to end on a nudge when its reply to his work leaves the problem open", () => {
		const guard = new VoiceGuard([newUserMessage("Eigen practice"), assistant([send("A problem.")]), thinking("B - 2I = [[2,1],[2,1]], so -3x + 2y = 0, v = (3, 2)")]);
		assert.deepEqual(rules(guard, send("It breaks at the line $-3x + 2y = 0$, so $v = (3, 2)^T$ never solved $(B - 2I)v = 0$.")), []);
		assert.match(guard.beforeEnd() ?? "", /smallest nudge/);
		const nudged = new VoiceGuard([newUserMessage("Eigen practice"), assistant([send("A problem.")]), thinking("v = (3, 2)")]);
		rules(nudged, send("It breaks at the line $-3x + 2y = 0$. Which entries of $B - 2I$ does that line come from?"));
		assert.equal(nudged.beforeEnd(), undefined);
	});
});

describe("the goal question (m3)", () => {
	it("refuses a \"Both\" option: a choice of several is multiSelect", () => {
		const guard = new VoiceGuard([newUserMessage("Invertible matrices")]);
		const call = ask("What do you most need to be able to do with invertible matrices?", "ask_user_question", {
			options: [{ label: "Both: decide and prove when a matrix is invertible, and compute inverses" }, { label: "Decide and prove when a matrix is invertible" }, { label: "Compute inverses" }],
		});
		assert.deepEqual(rules(guard, call), ["options"]);
	});

});
