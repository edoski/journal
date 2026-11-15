/**
 * Round 10, speed (root cause 2): every refusal costs the turn one more
 * model call, 2.5 to 8 s. Each case below is a draft or a rewrite the
 * round-10 tutor wrote, word for word from the evaluators' session files,
 * that the guard on 24c3d333 refused although it kept the rule it was told,
 * or refused without saying what to fix, so the rewrite was refused again.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { fauxAssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { LhMessage } from "../src/core/native-messages.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-round10-speed-"));
const originalEnv = process.env;
process.env = { ...originalEnv, NODE_ENV: "test", LH_DATA_DIR: path.join(scratch, "data"), HOME: path.join(scratch, "home") };
after(() => {
	process.env = originalEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const { VoiceGuard } = await import("../src/agent/voice-guard.ts");
const { SEND_TO_USER_TOOL, newDoneTonightMessage, newUserMessage } = await import("../src/core/native-messages.ts");

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const ask = (question: string, tool = "explain"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: tool, arguments: { question, type: "check" } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
const answered = (callId: string, text: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-08T21:00:00Z" }, isError: false, timestamp: 1 }) as LhMessage;

type Refusal = { content: Array<{ text: string }>; details: { rules?: string[]; withheld: string } };
const decision = (guard: InstanceType<typeof VoiceGuard>, call: ToolCall): Refusal | null => {
	guard.screen(call);
	return (guard as unknown as { decisions: Map<string, Refusal | null> }).decisions.get(call.id) ?? null;
};
const rules = (guard: InstanceType<typeof VoiceGuard>, call: ToolCall): string[] => {
	const refused = decision(guard, call);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};

/** Closing words after a concluded problem: the guard reads them as a close. */
function concluded(): InstanceType<typeof VoiceGuard> {
	const q = ask("A question?");
	const guard = new VoiceGuard([newUserMessage("Rank practice"), assistant([q]), answered(q.id, "an answer")]);
	guard.screen({ type: "toolCall", id: `c-${++n}`, name: "conclude", arguments: {} });
	return guard;
}

describe("a length rewrite that keeps the budget is shown (round 10)", () => {
	it("a one-sentence close split in two (robustness, the shear's double root)", () => {
		const guard = concluded();
		assert.deepEqual(rules(guard, send("A double root fixes only the eigenvalue, and the rank of $S - 3I$ decides how many independent eigenvectors there are: rank $1$ here leaves a single line.")), ["length"]);
		assert.deepEqual(rules(guard, send("A double root fixes only the eigenvalue. The rank of $S - 3I$ decides how many independent eigenvectors there are, and rank $1$ leaves a single line.")), []);
	});

	it("a close whose long sentence was cut under twenty-five words (robustness, the pivot columns)", () => {
		const guard = concluded();
		assert.deepEqual(rules(guard, send("You numbered the pivot columns $1$ and $2$ as if they followed the order of the rows. A pivot column is the column where a row's leading entry sits, and column $2$ here is twice column $1$, so it could never hold a pivot.")), ["length"]);
		assert.deepEqual(rules(guard, send("You numbered the pivot columns by the order of the rows. A pivot column is where a row's leading entry sits, and column $2$ is twice column $1$, so it could never hold a pivot.")), []);
	});

	it("a reply whose colon became a full stop and lost its clause (practice, the eigenlines)", () => {
		const q = ask("Which directions stay on their line?");
		const guard = new VoiceGuard([newUserMessage("Eigenvalues"), assistant([q]), answered(q.id, "the axes, each stretched by 2")]);
		const draft =
			"That's not right: the axes don't stay put. $A$ sends $(1,0)$ to $(2,1)$, and the $1$ in the corner tilts it off the $x$-axis. The lines that do stay are the two diagonals:\n\n$$\n\\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix} \\begin{pmatrix} 1 \\\\ 1 \\end{pmatrix} = \\begin{pmatrix} 3 \\\\ 3 \\end{pmatrix}\n$$\n\nSo $(1,1)$ is stretched by $3$, and $(1,-1)$ comes back unchanged, so it is stretched by $1$. Reading the stretch factors off the diagonal works only when the off-diagonal entries are $0$.";
		assert.ok(rules(guard, send(draft)).includes("length"));
		const rewrite =
			"That's not right. The matrix sends $(1,0)$ to $(2,1)$, and the $1$ in the corner tilts it off the $x$-axis. The lines that do stay are the two diagonals:\n\n$$\n\\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix} \\begin{pmatrix} 1 \\\\ 1 \\end{pmatrix} = \\begin{pmatrix} 3 \\\\ 3 \\end{pmatrix}\n$$\n\nSo the direction $(1,1)$ is stretched by $3$, and $(1,-1)$ comes back unchanged, so its stretch factor is $1$. The diagonal gives the stretch factors only when the off-diagonal entries are $0$.";
		assert.deepEqual(rules(guard, send(rewrite)), []);
	});
});

describe("a length refusal names what counted past the full stops (round 10)", () => {
	it("Explain instead's teaching step: four full stops read as six, and the refusal names both long sentences", () => {
		const guard = new VoiceGuard([newUserMessage("Span")]);
		const text =
			"Not being parallel only rules out a dependency between two vectors, and three are dependent as soon as one lies in the plane the other two span. The vectors $u$ and $v$ span a plane through the origin, and the third vector $w$ lies in that plane even though it is parallel to neither:\n\n$$\nw = 2u + v\n$$\n\nSo the span is that plane, of dimension $2$. Without guessing the combination, row reduce the matrix with the vectors as columns and count the pivots.";
		const refused = decision(guard, send(text));
		assert.ok(refused?.details.rules?.includes("length"));
		const said = refused!.content[0]!.text;
		assert.match(said, /"Not being parallel only rules out a dependency between two vectors, and three are dependent as soon as one lies in the plane the other two span\." is 27 words/);
		assert.match(said, /"The vectors X and X span a plane[^"]*" is 27 words/);
		assert.doesNotMatch(said, /run of commas/);
	});
});

describe("Explain instead is told the budget it is held to (round 10)", () => {
	it("the hand-back to teaching, and both agents' Back from practice, name a teaching turn's budget, the one the guard reads it under", async () => {
		const { MODE_HANDOFF_TEXT } = await import("../src/core/contracts/chat.ts");
		const { newModeHandoffMessage } = await import("../src/core/native-messages.ts");
		const { turnInputOf } = await import("../src/agent/voice-guard.ts");
		assert.equal(turnInputOf([newUserMessage("Rank practice"), newModeHandoffMessage("chat", "call", "teach") as LhMessage]).kind, "teach");
		const back = (file: string) => fs.readFileSync(path.join(import.meta.dirname, "..", "src", "agent", "prompts", file), "utf-8").split("\n").find((l) => l.includes("**Back from practice.**")) ?? "";
		for (const text of [MODE_HANDOFF_TEXT.teach, back("shared/20-question-tools.md"), back("prober/05-opening.md")]) {
			assert.match(text, /two to four sentences/, text);
			assert.doesNotMatch(text, /answer(?:ed)? it directly|answered directly/, text);
		}
	});
});
