/**
 * Round 9, the tutor's words (lesson reading M2, m1, m3, m4, m5, m6, m8,
 * m12; practice m2). Each slip below is a turn a round-9 evaluator read,
 * quoted from the report, and each passed the guard on the head the round
 * ran (8b999eb7).
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { LhMessage } from "../src/core/native-messages.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-round9-voice-"));
const originalEnv = process.env;
process.env = { ...originalEnv, NODE_ENV: "test", LH_DATA_DIR: path.join(scratch, "data"), HOME: path.join(scratch, "home") };
after(() => {
	process.env = originalEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const { VoiceGuard } = await import("../src/agent/voice-guard.ts");
const { voiceBreaks, questionAsks, repeatedPoint } = await import("../src/core/voice-check.ts");
const { SEND_TO_USER_TOOL, PRACTICE_PROBLEM_TOOL, newUserMessage } = await import("../src/core/native-messages.ts");

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const ask = (question: string, tool = "explain"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: tool, arguments: { question, type: "check" } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (callId: string, text: string, details: Record<string, unknown> = {}): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-08T21:00:00Z", ...details }, isError: false, timestamp: 1 }) as LhMessage;

/** A session in which he read `told` (one message, then a question each)
 *  and now answers the last question with `answer`. */
function after_(told: readonly string[], answer = "ok", details: Record<string, unknown> = {}): LhMessage[] {
	const out: LhMessage[] = [newUserMessage("Invertible matrices")];
	let last: ToolCall | undefined;
	for (const t of told) {
		last = ask("A question?");
		out.push(assistant([send(t), last]));
		out.push(answered(last.id, "an answer"));
	}
	last = ask("The last question?");
	out.push(assistant([last]));
	out.push(answered(last.id, answer, details));
	return out;
}

const rules = (guard: InstanceType<typeof VoiceGuard>, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};
const ruled = (text: string, kind?: Parameters<typeof voiceBreaks>[1]) => voiceBreaks(text, kind).map((b) => b.rule);

/** Invertible matrices, probe 1's feedback (04), as he read it. */
const PROBE_FEEDBACK =
	"The rank is $2$, because row $3$ is row $1$ plus row $2$. You held that rows which are not multiples of each other are independent, but a row can be a combination of two others, which checking pairs never catches. Elimination does catch it.";

describe("a point is made once in a session (M2, practice m2)", () => {
	it("refuses Show me's last line, which said the probe's point again on columns (16)", () => {
		const guard = new VoiceGuard(after_([PROBE_FEEDBACK]));
		assert.deepEqual(rules(guard, send("No two columns here are multiples of each other, yet column $3$ is column $1$ plus column $2$.")), ["repeat"]);
	});

	it("refuses the teaching turn that said it a fourth time (18)", () => {
		const guard = new VoiceGuard(after_([PROBE_FEEDBACK, "Here $I$ is the identity, the map that sends every vector to itself."]));
		const said = rules(guard, send("Back substitution then gives $x_3 = 0$, $x_2 = 0$ and $x_1 = 0$. Counting pivots after elimination is what catches a column hiding as a combination of two others."));
		assert.deepEqual(said, ["repeat"]);
	});

	it("refuses practice closing words that restate the feedback one turn earlier (43)", () => {
		const guard = new VoiceGuard(after_(["Part (b) is wrong, and the mistake is the $3$ in $3 - 2$. Rank–nullity doesn't subtract from the number of rows."]));
		assert.deepEqual(rules(guard, send("You were confident that rank–nullity starts from the number of rows.")), ["repeat"]);
	});

	it("passes the round's best turns, each read after the ones before it", () => {
		const turns = [
			PROBE_FEEDBACK,
			"You held that the scale factors add, but $AB$ applies $B$ and then $A$, so an area is scaled by $2$ with a flip and then that result is scaled by $3$. Scaling twice multiplies, as doubling and then tripling a length gives six times it.",
			"Here $I$ is the identity, the map that sends every vector to itself.",
			"A direction does get flattened, but the obstacle is not a factor of $0$ that refuses to be undone. When a vector $v$ is flattened to $0$, so are $2v$, $-v$ and $0$ itself, so many different inputs share one output.",
			"That situation cannot happen, because every collision hands you a nonzero vector sent to $0$.",
			"Your logarithm $-15/n$ is right, but it tends to $0$, not $-\\infty$, because a fixed number divided by an ever larger $n$ shrinks to nothing.",
			"Either works for the dimension, because row operations never change the rank. The difference is which basis you can read off.",
		];
		for (let i = 1; i < turns.length; i++) {
			assert.equal(repeatedPoint(turns[i]!, turns.slice(0, i)), null, turns[i]);
		}
	});
});

describe("a length rewrite cuts, never joins (m1)", () => {
	it("refuses a rewrite that turns a colon into \", because\" and cuts nothing (35)", () => {
		const guard = new VoiceGuard(after_([], "the log is 5 * (-3/n) = -15/n which goes to -infinity?? so 0"));
		const draft =
			"Your logarithm $-15/n$ is right, but it tends to $0$, not $-\\infty$: a fixed number divided by an ever larger $n$ shrinks to nothing. So the limit is $e^0 = 1$. The shift of the base from $1$ is of size $3/n$; only an exponent growing like $n$ can multiply it up to something finite. With a fixed exponent the product of shift and exponent tends to $0$.";
		assert.ok(rules(guard, send(draft)).includes("length"));
		const glued =
			"Your logarithm $-15/n$ is right, but it tends to $0$, not $-\\infty$, because a fixed number divided by an ever larger $n$ shrinks to nothing. So the limit is $e^0 = 1$. The shift of the base from $1$ is of size $3/n$, and only an exponent growing like $n$ can multiply it up to something finite. With a fixed exponent the product of shift and exponent tends to $0$.";
		assert.ok(rules(guard, send(glued)).includes("length"));
	});

	it("passes a rewrite that cut whole sentences", () => {
		const guard = new VoiceGuard(after_([], "x"));
		assert.ok(rules(guard, send("One. Two. Three. Four. Five. Six. Seven.")).includes("length"));
		assert.deepEqual(rules(guard, send("One. Two. Three. Four.")), []);
	});
});

describe("asks the guard did not read (m3)", () => {
	it("counts two asks in the probe's open question, split by a colon (29)", () => {
		assert.equal(questionAsks("What do you already know about the Poisson distribution: what kind of quantity it describes, and its formula if you remember it?").length, 2);
		const guard = new VoiceGuard(after_([]));
		assert.ok(rules(guard, ask("What do you already know about the Poisson distribution: what kind of quantity it describes, and its formula if you remember it?", "recall")).includes("compound"));
	});

	it("refuses \"Justify your answer.\" under a practice problem's question, and keeps a sheet's later parts (44)", () => {
		const pose = (statement: string): ToolCall => ({ type: "toolCall", id: `p-${++n}`, name: PRACTICE_PROBLEM_TOOL, arguments: { statement, commitment: "2" } });
		const guard = new VoiceGuard(after_([]), () => true);
		assert.deepEqual(rules(guard, pose("In $\\mathbb{R}^4$, let $u$, $v$, $w$ be as above. What is $\\dim \\operatorname{span}\\{u, v, w\\}$? Justify your answer.")), ["advice"]);
		const parts = new VoiceGuard(after_([]), () => true);
		assert.deepEqual(rules(parts, pose("(a) What is the rank of $A$? (b) Find a basis of $\\ker A$.")), []);
	});
});

describe("a direct answer stops where the answer does (m4)", () => {
	const direct = (): LhMessage[] => [newUserMessage("Poisson distribution"), assistant([send("The PMF counts arrivals.")]), newUserMessage("why is it fine to assume the slots are independent?")];

	it("refuses the closing moral after the Poisson Ask answer (37)", () => {
		const guard = new VoiceGuard(direct());
		const said = rules(guard, send("It is an assumption about the arrivals, not a fact about slots. Emails sent by different people at different moments don't wait on each other. So checking for independent, steady arrivals comes before reaching for Poisson at all."));
		assert.deepEqual(said, ["moral"]);
	});

	it("refuses \"which is why\" as the last clause (20), and passes an answer that ends on its maths", () => {
		const guard = new VoiceGuard(direct());
		assert.deepEqual(rules(guard, send("A square matrix has as many columns as rows. Every collision hands you a nonzero vector sent to $0$, which is why this test is special to matrices.")), ["moral"]);
		const clean = new VoiceGuard(direct());
		assert.deepEqual(rules(clean, send("Each slot holds an email with probability $\\lambda/n$, whatever the others hold. So the count is $\\mathrm{Bin}(n, \\lambda/n)$.")), []);
	});
});

describe("punctuation, pointers and displays (m5, m8, m6)", () => {
	it("refuses \"That's not right:\" with a colon (04, 07, 19, 33)", () => {
		assert.ok(ruled("That's not right: the rank is $2$, because row $3$ is row $1$ plus row $2$.", "wrong").includes("colon"));
		assert.ok(ruled("Not quite right: the exponent is $2n$.", "wrong").includes("colon"));
		assert.ok(!ruled("That's not right. The rank is $2$.", "wrong").includes("colon"));
	});

	it("refuses \"The base is the same as before\" (35)", () => {
		assert.ok(ruled("The base is the same as before, but now the exponent stays fixed at $5$ while $n$ grows.", "teach").includes("backref"));
	});

	it("refuses a display that chains an equality into a limit (35), and keeps limits, row operations and plain chains", () => {
		assert.ok(ruled("Written out, the expression is a square:\n\n$$\n\\left(1 - \\frac{1}{n}\\right)^{2n} = \\left[\\left(1 - \\frac{1}{n}\\right)^n\\right]^2 \\to \\left(e^{-1}\\right)^2 = e^{-2}.\n$$", "wrong").includes("chain"));
		for (const display of [
			"$$\n\\lim_{n \\to \\infty} \\left(1 - \\frac{3}{n}\\right)^n = e^{-3}\n$$",
			"$$\nP(X = k) = \\binom{n}{k} p^k (1 - p)^{n - k}\n$$",
			"$$\n\\begin{pmatrix} 1 & 2 \\\\ 2 & 4 \\end{pmatrix} \\to \\begin{pmatrix} 1 & 2 \\\\ 0 & 0 \\end{pmatrix}\n$$",
			"$$\nA = \\begin{pmatrix} 1 & 2 \\\\ 2 & 4 \\end{pmatrix} \\xrightarrow{R_2 - 2R_1} \\begin{pmatrix} 1 & 2 \\\\ 0 & 0 \\end{pmatrix}\n$$",
			"$$\n\\begin{aligned} (AB)^{-1} &= B^{-1} A^{-1} \\\\ &\\neq A^{-1} B^{-1} \\end{aligned}\n$$",
			"$$\n0 \\le p \\le 1\n$$",
		]) {
			assert.ok(!ruled(`So:\n\n${display}`, "teach").includes("chain"), display);
		}
	});
});

describe("a guessed right answer is owed its reason (m12)", () => {
	it("refuses a reply that only states the formula he guessed (30)", () => {
		const guard = new VoiceGuard(after_([], "lambda^k e^-lambda / k!", { confidence: "guessing" }));
		assert.deepEqual(rules(guard, send("The PMF is $\\frac{\\lambda^k e^{-\\lambda}}{k!}$, where $\\lambda$ is the average count per interval.")), ["reason"]);
	});

	it("passes one that says why it holds", () => {
		const guard = new VoiceGuard(after_([], "lambda^k e^-lambda / k!", { confidence: "guessing" }));
		assert.deepEqual(rules(guard, send("The PMF is $\\frac{\\lambda^k e^{-\\lambda}}{k!}$, because the binomial over shrinking slots tends to it.")), []);
	});
});
