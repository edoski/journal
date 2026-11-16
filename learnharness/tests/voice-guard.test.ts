/**
 * The voice held per turn (round 6, 14 Nov 2026): every message and
 * question the tutor sends is read against the voice before he sees it,
 * and one that breaks it is rewritten once, silently. The slips below are
 * the round-6 evaluators' recorded turns, word for word.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";
import { fakeEngine, type ScriptedModel } from "./helpers/fake-sdk.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-voice-guard-"));
const originalEnv = process.env;
process.env = { ...originalEnv, NODE_ENV: "test", LH_DATA_DIR: path.join(scratch, "data"), HOME: path.join(scratch, "home") };
after(() => {
	process.env = originalEnv;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const { VoiceGuard, turnInputOf } = await import("../src/agent/voice-guard.ts");
const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { sendToUserTool } = await import("../src/agent/tools/send-to-user.ts");
const { SEND_TO_USER_TOOL, newDoneTonightMessage, newUserMessage, asAgentMessages } = await import("../src/core/native-messages.ts");
const { projectView } = await import("../src/core/view.ts");
const { pendingQuestionOf } = await import("../src/core/native-messages.ts");

let n = 0;
const send = (message: string): ToolCall => ({ type: "toolCall", id: `send-${++n}`, name: SEND_TO_USER_TOOL, arguments: { message } });
const ask = (question: string, tool = "explain"): ToolCall => ({ type: "toolCall", id: `q-${++n}`, name: tool, arguments: { question, type: "check" } });
const assistant = (content: unknown[]): LhMessage => ({ ...fauxAssistantMessage(""), content, id: `a-${++n}` }) as LhMessage;
/** His answer to a question, as the dock returns it. */
const answered = (callId: string, text: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text }], details: { kind: "explain", text, answeredAt: "2026-11-08T21:00:00Z" }, isError: false, timestamp: 1 }) as LhMessage;
const hinted = (callId: string): LhMessage =>
	({ id: `r-${++n}`, role: "toolResult", toolCallId: callId, toolName: "explain", content: [{ type: "text", text: "hint" }], details: { kind: "explain", hintRequested: true }, isError: false, timestamp: 1 }) as LhMessage;
const thinking = (text: string): LhMessage => ({ id: `t-${++n}`, role: "custom", customType: "practice-thinking", content: `Your thinking: ${text}`, display: true, details: {}, timestamp: 1 }) as LhMessage;
const nextProblem = (): LhMessage => ({ id: `x-${++n}`, role: "custom", customType: "practice-next", content: "[NEXT PROBLEM]", display: true, details: {}, timestamp: 1 }) as LhMessage;

/** A lesson so far that asked one question and has his answer to it. */
function answering(text: string): LhMessage[] {
	const q = ask("A question.");
	return [newUserMessage("Invertible matrices"), assistant([q]), answered(q.id, text)];
}

/** The words the lesson column draws: its text parts (an errored call's
 *  part is drawn as nothing). */
const visible = (messages: unknown[]): string =>
	projectView(messages as LhMessage[])
		.flatMap((m) => m.parts)
		.flatMap((p) => (p.type === "text" ? [(p as { text: string }).text] : []))
		.join("\n");

const rules = (guard: InstanceType<typeof VoiceGuard>, call: ToolCall): string[] => {
	guard.screen(call);
	const refused = (guard as unknown as { decisions: Map<string, { details: { rules?: string[]; withheld: string } } | null> }).decisions.get(call.id);
	return refused ? (refused.details.rules ?? [refused.details.withheld]) : [];
};

describe("the round-6 slips are rewritten before he sees them", () => {
	it("a 9-sentence direct answer to his question", () => {
		const turn = [newUserMessage("Rank"), assistant([send("A step.")]), newUserMessage("why is the number of pivots the same however I row reduce?")];
		const answer =
			"No. Whatever order you use, you always get the same number of pivots, because that number measures something that row operations leave unchanged. Think of the rows of $A$ as vectors that span a subspace, called the row space. Each row operation replaces one row with a combination of the rows, and it can be undone, so every row you have before and after an operation still lies in the same subspace. The rows move around inside it, but the subspace is the same. The nonzero rows of any echelon form are independent, because each one starts in a pivot column where the rows below it have zeros. They also still span the row space, so they form a basis of it:\n\n$$\n\\text{number of pivots} = \\dim(\\text{row space of } A)\n$$\n\nA dimension does not depend on which basis you happen to reach. In problem 1, every order of operations gives you two independent rows that span the same plane in $\\mathbb{R}^5$, so you always get two pivots.";
		assert.deepEqual(rules(new VoiceGuard(turn), send(answer)), ["length"]);
	});

	it("a 3-sentence close after Done for today", () => {
		const close = "You stopped today with the Poisson formula derived. Next time you pick up the Poisson lesson at its open check. Your Poisson review comes back on Saturday 14 November.";
		assert.deepEqual(rules(new VoiceGuard([newUserMessage("Poisson"), assistant([send("A step.")]), newDoneTonightMessage("teacher") as LhMessage]), send(close)), ["length"]);
	});

	it("closing words after a problem: too long, and advice said earlier in the session", () => {
		const earlier = assistant([ask("Show that $N$ is not invertible by finding a nonzero vector $v$ with $Nv = 0$.")]);
		const turn = [newUserMessage("Rank practice"), assistant([send("The check only protects you when you multiply out every entry.")]), earlier, thinking("2u - v - w = 0")];
		const guard = new VoiceGuard(turn);
		guard.screen({ type: "toolCall", id: "c1", name: "conclude", arguments: {} });
		const close = "The decisive move was not trusting \"no two are parallel\" with three vectors, and you made it on your own. Before you write down a dependence relation, multiply it out to check it. A one-line check would have caught the sign.";
		assert.deepEqual(rules(guard, send(close)), ["length", "repeat"]);
	});

	it("two questions in one question", () => {
		const q = "Suppose row operations $E_1, \\dots, E_k$ reduce $A$ all the way to $I$, so $E_k \\cdots E_1 A = I$. What is the product $E_k \\cdots E_1$? And how could you get that product written down while you reduce $A$, without ever multiplying the $E_i$ together?";
		assert.deepEqual(rules(new VoiceGuard(answering("E^{-1}")), ask(q)), ["questions", "compound"]);
	});

	it("advice under a question", () => {
		const q = "Show that\n$$\nN = \\begin{pmatrix} 1 & 2 & 0 \\\\ 0 & 1 & -1 \\\\ 2 & 1 & 3 \\end{pmatrix}\n$$\nis not invertible by finding a nonzero vector $v$ with $Nv = 0$. Check your $v$ by multiplying it out.";
		assert.deepEqual(rules(new VoiceGuard(answering("v = (1,1,1)")), ask(q)), ["advice"]);
		const invite = "Phone calls reach a help desk at an average rate of $3$ per hour, independently of each other. What distribution would you use for the number of calls in one hour, and what is the probability of exactly $2$ calls in an hour? Say whatever you know or suspect, even if it's partial.";
		assert.deepEqual(rules(new VoiceGuard(answering("Binomial, n=10, p=1/4")), ask(invite, "recall")), ["compound", "advice"], "a probe's invitation under a question that asks two things, from a real run");
		const message = "Here $AB$ sends $x$ to $A(Bx)$. In $ABx$, which map acts on $x$ first? Think of $AB$ as a composition of maps.";
		assert.deepEqual(rules(new VoiceGuard(answering("A first")), send(message)), ["advice"]);
	});

	it("the same advice four times in a lesson, however reworded", () => {
		const turn = [newUserMessage("Invertible matrices"), assistant([ask("Find $v$ with $Nv = 0$. Write it down.")]), assistant([send("Check your $v$ by multiplying it out.")])];
		const q = ask("Use $[A \\mid I]$ to find $A^{-1}$. The check only protects you when you multiply out every entry.");
		assert.ok(rules(new VoiceGuard([...turn, answered("x", "done")]), q).includes("repeat"));
	});

	it("half-approval of a wrong answer", () => {
		const reply = "Splitting the hour into minutes is the right instinct. The flaw is that one minute can hold two calls, which your model forbids, so it is only an approximation.";
		assert.deepEqual(rules(new VoiceGuard(answering("Maybe binomial? Split the hour into 60 minutes")), send(reply)), ["praise"]);
	});

	it("his answer handed back to him", () => {
		const reply = "That is $E$, and the reason it works for every $A$ is that row $i$ of $EA$ is the combination of the rows of $A$ whose coefficients are row $i$ of $E$.";
		assert.deepEqual(rules(new VoiceGuard(answering("Yes, E = [[1,0,0],[-2,1,0],[0,0,1]], apply the operation to I")), send(reply)), ["echo"]);
		const product = "The product is $A^{-1}$, and writing $I$ beside $A$ makes the right-hand block collect $E_k \\cdots E_1 I$ with no multiplication.";
		assert.deepEqual(rules(new VoiceGuard(answering("It's A^{-1}, apply the same ops to I alongside")), send(product)), ["echo"]);
		assert.deepEqual(rules(new VoiceGuard(answering("rank 2")), send("You got it right: rank 2, with pivots in columns 1 and 3.")), ["echo"]);
		const both = "You got both parts right. When you name a basis, take the columns from the original $B$.";
		assert.deepEqual(rules(new VoiceGuard(answering("rank 2")), send(both)), ["echo"]);
		const graded = "Your last answer is right, and both reviews today were right on your own. What you built is the **Poisson distribution**.";
		assert.deepEqual(rules(new VoiceGuard(answering("e^{-3} e^3 = 1")), send(graded)), ["echo"], "a real run's grading of a right answer");
	});

	it("\"just explain\" answered with the topic's planned day", () => {
		const turn = [newUserMessage("Graph representations"), assistant([send("A step.")]), newUserMessage("Can you just explain BFS to me and why it gives shortest paths?")];
		const reply = "BFS starts at a source $s$ with $d[s] = 0$ and puts $s$ in a FIFO queue. BFS is planned to start on Thursday 19 November. If you'd like it as a full lesson now, with the proof built step by step, say so.";
		assert.deepEqual(rules(new VoiceGuard(turn), send(reply)), ["plan"]);
	});
});

describe("turns within the voice pass untouched", () => {
	const good: Array<[string, LhMessage[], ToolCall]> = [
		["a hint, one question", [newUserMessage("Graphs"), assistant([ask("Build the transpose.", "recall")]), hinted("x")], send("When you meet $v$ in the list of $u$, which edge of $G^T$ does that edge of $G$ become?")],
		[
			"a wrong answer, where it broke and the correct move",
			answering("No row is a multiple of another, so rank 3"),
			send("That's not right. \"No row is a multiple of another\" only rules out dependence between pairs, and here $R_3 = R_1 + R_2$. Row reducing gives two pivots, so the rank is $2$, and $A$ is not invertible."),
		],
		["a lesson's first step", [newUserMessage("Poisson")], send("Split the hour into $n$ slots, each holding an email with probability $4/n$. The count of emails is then binomial, whatever $n$ is.")],
		["a two-sentence close", [newUserMessage("Rank"), assistant([send("A step.")]), newDoneTonightMessage("practice") as LhMessage], send("Next time you pick up with part (c) of sheet 4. Your rank review comes back on Friday 13 November.")],
		[
			"a planned day, in answer to his question about the plan",
			[newUserMessage("Poisson"), assistant([send("A step.")]), newUserMessage("And how many overdue reviews do I have in each of my courses right now?")],
			send("| Course | Overdue reviews |\n| --- | --- |\n| Probability | 1 (Law of total probability, planned Sat 14 Nov) |\n| Calculus I | 20 |\n\nThe most overdue is Monotonicity in Calculus I, 37 days late. It is planned for Thu 19 November, after your Probability exam."),
		],
		["a check question", answering("rank 2"), ask("Calls arrive at an average of $\\lambda$ per minute, and the minute is split into $n$ slots. Write $P(X_n = k)$ in terms of $n$, $\\lambda$ and $k$.")],
		["a correction that starts with the right value", answering("the product is AB"), send("That's not right. The product is $BA$, since $B$ acts first.")],
	];
	for (const [name, turn, call] of good) {
		it(name, () => assert.deepEqual(rules(new VoiceGuard(turn), call), []));
	}
});

describe("the guard's turn", () => {
	it("reads the turn's input: his question, his answer, a hint, a close", () => {
		assert.equal(turnInputOf([newUserMessage("Poisson")]).kind, "teach", "a lesson's first message is its topic");
		assert.equal(turnInputOf([newUserMessage("How many overdue reviews do I have?")]).kind, "direct", "unless he asks");
		assert.equal(turnInputOf([newUserMessage("Poisson"), assistant([send("x")]), newUserMessage("why?")]).kind, "direct");
		assert.deepEqual(turnInputOf(answering("rank 2")), { kind: "wrong", answers: true, words: "rank 2" });
		assert.equal(turnInputOf([newUserMessage("x"), assistant([ask("q")]), hinted("q")]).kind, "hint");
		assert.equal(turnInputOf([newUserMessage("x"), assistant([send("x")]), nextProblem()]).kind, "close");
	});

	it("takes a refused message's text out of the live call, so no view draws it", () => {
		const guard = new VoiceGuard(answering("rank 2"));
		const call = send("You got it right: rank 2.");
		guard.screen(call);
		assert.deepEqual(call.arguments, {});
		const view = projectView([...answering("rank 2"), assistant([call])] as LhMessage[], { executions: new Map(), inFlight: true, streamingIds: new Set() });
		assert.ok(!JSON.stringify(view).includes("You got it right"));
	});

	it("refuses twice a turn for each kind of call: a rewrite is read again, and one that still slips is shown, unless it asks more than one thing (round 8)", () => {
		const guard = new VoiceGuard(answering("rank 2"));
		assert.deepEqual(rules(guard, send("You got it right: rank 2.")), ["echo"]);
		assert.deepEqual(rules(guard, send("Yes, rank 2.")), ["echo"], "the first rewrite is read against every rule again");
		assert.deepEqual(rules(guard, send("Right, rank 2.")), [], "the second rewrite's slips are shown rather than looped");
		assert.deepEqual(rules(guard, ask("What is $A^2$? Why?")), ["questions"]);
		assert.deepEqual(rules(guard, ask("What is $A^2$? Check it by multiplying.")), ["advice"]);
		assert.deepEqual(rules(guard, ask("What is $A^2$, and is it invertible?")), ["compound"], "a rewrite never passes by asking two things");
		assert.deepEqual(rules(guard, ask("What is $A^2$? Check it by multiplying.")), [], "a rewrite's other slips are shown rather than looped");
	});

	it("a rewrite that fixes the advice by adding a second question is refused (round 7)", () => {
		const guard = new VoiceGuard(answering("Binomial"));
		assert.deepEqual(rules(guard, ask("You answer 10 questions, each right with probability $1/4$. What is the probability you get exactly 3 right? Say why the count of right answers has the distribution you use.", "recall")), ["advice"]);
		assert.deepEqual(rules(guard, ask("Which distribution does the number of right answers have, and why? What is the probability you get exactly 3 right?", "recall")), ["questions", "compound"]);
		assert.deepEqual(rules(guard, ask("You answer 10 questions, each right with probability $1/4$. What is the probability you get exactly 3 right?", "recall")), []);
	});

	it("a question sent beside a refused message is read by its own rules, never refused for the message (round 12, 3 M1: 25 of 81 refusals)", () => {
		const guard = new VoiceGuard(answering("rank 2"));
		assert.deepEqual(rules(guard, send("You got it right: rank 2.")), ["echo"]);
		assert.deepEqual(rules(guard, ask("What is $\\dim \\ker A$?")), [], "a well-formed question is kept for the rewrite");
		const broken = new VoiceGuard(answering("rank 2"));
		assert.deepEqual(rules(broken, send("You got it right: rank 2.")), ["echo"]);
		assert.deepEqual(rules(broken, ask("What is $\\dim \\ker A$, and what is $\\operatorname{rank} A^T$?")), ["compound"], "a broken one is refused for its own break, in the same round as the message");
	});

	it("any turn-ending call beside a refused message runs, and the turn ends on the rewrite (round 12, 3 M1: whatever rule refused the message)", async () => {
		const handoff = { name: "practice", label: "practice", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: "Handed off." }], details: { ok: true }, terminate: true }) } as AgentTool<any>;
		for (const draft of ["You got it right: rank 2.", "$2$ pivots survive, so the rank is $2$."]) {
			const guard = new VoiceGuard(answering("rank 2"), (name) => name === "practice");
			const refused = rules(guard, send(draft));
			assert.ok(refused.length > 0, `the draft is refused: ${draft}`);
			const call = { type: "toolCall" as const, id: `h-${++n}`, name: "practice", arguments: {} };
			assert.deepEqual(rules(guard, call), [], "the handoff is never refused for the message");
			const ran = await guard.wrap(handoff).execute(call.id, {});
			assert.equal(ran.isError, undefined);
			assert.equal(ran.terminate, false, "it waits for the rewrite to end the turn");
			assert.match((ran.content.at(-1) as { text: string }).text, /rewritten message/);
		}
		const guard = new VoiceGuard(answering("rank 2"), (name) => name === "practice");
		rules(guard, send("You got it right: rank 2."));
		const call = { type: "toolCall" as const, id: `h-${++n}`, name: "practice", arguments: {} };
		rules(guard, call);
		await guard.wrap(handoff).execute(call.id, {});
		const rewrite = send("The pivots sit in columns 1 and 3.");
		assert.deepEqual(rules(guard, rewrite), []);
		assert.equal((await guard.wrap(sendToUserTool).execute(rewrite.id, rewrite.arguments as never)).terminate, true, "the rewrite ends the turn the handoff began");
	});

	it("words with nothing for him beside a handoff may be dropped: one note, then the turn ends (round 12, 3 D4 with the narration rule)", async () => {
		const handoff = { name: "practice", label: "practice", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: "Handed off." }], details: { ok: true }, terminate: true }) } as AgentTool<any>;
		const guard = new VoiceGuard(answering("rank 2"), (name) => name === "practice");
		rules(guard, send("You got it right: rank 2."));
		const call = { type: "toolCall" as const, id: `h-${++n}`, name: "practice", arguments: {} };
		rules(guard, call);
		await guard.wrap(handoff).execute(call.id, {});
		assert.match(guard.beforeEnd() ?? "", /if nothing in it was for him, end your turn/);
		assert.equal(guard.beforeEnd(), undefined, "told once");
	});

	it("counts a table as a display, not as sentences", () => {
		const turn = [newUserMessage("Poisson"), assistant([send("A step.")]), newUserMessage("does every topic get a review before the exam?")];
		const answer = "Yes, for every topic you start before the exam:\n\n| Day | Reviews |\n| --- | --- |\n| Sat 14 Nov | Poisson, Expectation |\n| Sun 15 Nov | Geometric, Binomial |\n| Mon 16 Nov | Variance, Bayes' rule |\n\nCovariance starts after the exam, so it gets none.";
		assert.deepEqual(rules(new VoiceGuard(turn), send(answer)), []);
	});

	/** A probe_done the guard runs, ending the probe or refused as the tool
	 *  refuses one with a question still open. */
	const probeDone = (guard: InstanceType<typeof VoiceGuard>, ok: boolean) =>
		guard
			.wrap({ name: "probe_done", label: "probe_done", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: "" }], details: ok ? { ok: true } : { ok: false, error: "A question is still open" } }) } as AgentTool<any>)
			.execute("pd", {});

	it("shows no words after the probe ends: the teacher opens the lesson", async () => {
		const guard = new VoiceGuard(answering("the sum of 3^k/k! is e^3"));
		await probeDone(guard, true);
		assert.deepEqual(rules(guard, send("What you built from the minutes model is the **Poisson distribution**.")), ["after-probe"]);
	});

	it("poses no question after the probe ends: its teaching was withheld, so it would reach him cold (round 7)", async () => {
		const guard = new VoiceGuard(answering("(AB)^{-1} = B^{-1}A^{-1}"));
		await probeDone(guard, true);
		assert.deepEqual(rules(guard, send("Multiplying $A$ by $x$ is the same as taking a combination of the columns of $A$.")), ["after-probe"]);
		assert.deepEqual(rules(guard, ask("Find a nonzero vector in $\\ker A$ without doing elimination.", "explain")), ["after-probe"]);
		assert.deepEqual(rules(guard, ask("Find a nonzero vector in $\\ker B$.", "recall")), ["after-probe"], "never, however often it is tried");
	});

	it("the mark and the words agree: a partly right answer is never called not right (round 7)", async () => {
		const save = (result: string) => guard.wrap({ name: "course_save", label: "course_save", description: "", parameters: {} as never, execute: async () => ({ content: [{ type: "text" as const, text: "{}" }], details: {} }) } as AgentTool<any>).execute(`s-${++n}`, { changes: { observations: [{ kind: "attempt", question: "q", result, topics: ["poisson"] }] } });
		let guard = new VoiceGuard(answering("e^\\lambda"));
		assert.equal((await save("partial")).isError, undefined);
		assert.deepEqual(rules(guard, send("That's not right. The sum is $\\lambda e^\\lambda$.")), ["verdict"]);
		assert.deepEqual(rules(guard, send("The $e^\\lambda$ is right, but the sum is $\\lambda e^\\lambda$.")), []);
		guard = new VoiceGuard(answering("e^\\lambda"));
		assert.deepEqual(rules(guard, send("That's not right. The sum is $\\lambda e^\\lambda$.")), []);
		const refused = await save("partial");
		assert.equal(refused.isError, true);
		assert.match((refused.content[0] as { text: string }).text, /Save it with result incorrect/);
		assert.equal((await save("incorrect")).isError, undefined);
		assert.deepEqual(rules(new VoiceGuard(answering("x")), send("No two columns are parallel here, yet the rank is $2$.")), [], "\"No two\" is not a verdict");
	});

	it("a probe_done the tool refused ends nothing", async () => {
		const guard = new VoiceGuard(answering("the sum of 3^k/k! is e^3"));
		await probeDone(guard, false);
		assert.deepEqual(rules(guard, send("The terms add up to $e^3$.")), []);
	});

	it("lets a rewrite he is owed through after probe_done: it answers what he asked", async () => {
		const guard = new VoiceGuard([newUserMessage("Invertible matrices"), assistant([ask("q", "recall")]), newUserMessage("Can you just explain diagonalization to me now?")]);
		const long = Array.from({ length: 8 }, (_, i) => `Sentence ${i + 1} of the explanation.`).join(" ");
		assert.deepEqual(rules(guard, send(long)), ["length"]);
		await probeDone(guard, true);
		assert.deepEqual(rules(guard, send("A matrix is diagonalizable when its eigenvectors form a basis.")), []);
		assert.deepEqual(rules(guard, send("One more word after the probe.")), ["after-probe"]);
	});

	it("never shows the same message twice in a turn", () => {
		const guard = new VoiceGuard([newUserMessage("Rank")]);
		const text = "The rank is the number of pivots.";
		assert.deepEqual(rules(guard, send(text)), []);
		assert.deepEqual(rules(guard, send(text)), ["duplicate"]);
	});

	it("the wrapped tool returns the refusal, with what to fix and the refused text kept", async () => {
		const guard = new VoiceGuard(answering("rank 2"));
		const result = await guard.wrap(sendToUserTool).execute("s1", { message: "You got it right: rank 2." });
		assert.equal(result.isError, true);
		assert.match((result.content[0] as { text: string }).text, /^Not shown to him[\s\S]*Start with the content[\s\S]*Send it again with send_to_user/);
		assert.deepEqual(result.details, { withheld: "voice", rules: ["echo"], text: "You got it right: rank 2." });
		const passed = await guard.wrap(sendToUserTool).execute("s2", { message: "The pivots sit in columns 1 and 3." });
		assert.equal(passed.isError, undefined);
	});
});

describe("a real turn on the Agent SDK", () => {
	function scripted(steps: FauxResponseStep[]) {
		const faux = createFauxCore({ provider: "anthropic", models: [{ id: "claude-opus-5-5" }] });
		faux.setResponses(steps);
		const model: ScriptedModel = { model: faux.getModel(), streamFn: faux.streamSimple };
		return { engine: fakeEngine(model), faux };
	}

	it("he sees only the rewrite: the tutor reads what to fix and sends again in the same turn", async () => {
		const close = "You stopped today with the Poisson formula derived. Next time you pick up the Poisson lesson at its open check. Your Poisson review comes back on Saturday 14 November.";
		const rewrite = "Next time you pick up the Poisson lesson at its open check. Your Poisson review comes back on Saturday 14 November.";
		let told = "";
		const { engine, faux } = scripted([
			fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: close }, { id: "close-1" })], { stopReason: "toolUse" }),
			(context) => {
				const refused = context.messages.find((m) => m.role === "toolResult" && m.toolCallId === "close-1");
				told = refused && refused.role === "toolResult" ? (refused.content[0] as { text: string }).text : "";
				return fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: rewrite }, { id: "close-2" })], { stopReason: "toolUse" });
			},
			fauxAssistantMessage(""),
		]);
		const record = asAgentMessages([newUserMessage("Poisson"), assistant([send("A step.")]), newDoneTonightMessage("teacher") as LhMessage]);
		const agent = createTeacherAgent(undefined, { engine, messages: record });
		const views: string[] = [];
		agent.subscribe((event) => {
			if (event.type === "message_update") views.push(JSON.stringify(projectView(agent.state.messages.concat(event.message) as LhMessage[])));
		});
		await agent.continue();
		assert.equal(faux.state.callCount, 3);
		assert.match(told, /^Not shown to him: this message breaks the voice\.\n- It is too long for a close \(3 sentences, budget 2\)/);
		const shown = visible(agent.state.messages);
		assert.ok(shown.includes("Your Poisson review comes back"), "the rewrite shows");
		assert.ok(!shown.includes("You stopped today"), "the refused close never shows");
		assert.ok(views.every((v) => !v.includes("You stopped today")), "not even while the reply streams");
	});

	it("a refused message beside the turn's question: the question is kept, posed under the rewrite, and the turn ends on it (round 12, 3 M1)", async () => {
		const question = { question: "What is $\\dim \\ker A$?", type: "check", nodeId: "rank", correctAnswer: "1, by rank-nullity." };
		let told = "";
		const { engine, faux } = scripted([
			fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: "You got it right: rank 2." }, { id: "m1" }), fauxToolCall("explain", question, { id: "q1" })], { stopReason: "toolUse" }),
			(context) => {
				const kept = context.messages.find((m) => m.role === "toolResult" && m.toolCallId === "q1");
				told = kept && kept.role === "toolResult" ? `${kept.isError ? "error: " : ""}${(kept.content[0] as { text: string }).text}` : "";
				return fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: "The pivots sit in columns 1 and 3." }, { id: "m2" })], { stopReason: "toolUse" });
			},
			fauxAssistantMessage("A third reply must not run: the rewrite poses the kept question, which ends the turn."),
		]);
		const agent = createTeacherAgent(undefined, { engine, messages: asAgentMessages(answering("rank 2")) });
		const early: string[] = [];
		agent.subscribe((event) => {
			if (event.type !== "message_end" && event.type !== "tool_execution_end") return;
			const live = agent.state.messages.map((m, i) => ((m as { id?: string }).id ? m : { ...m, id: `live-${i}` })) as LhMessage[];
			const posed = pendingQuestionOf(live)?.toolCallId === "q1" || projectView(live).some((m) => m.parts.some((p) => p.type === "tool-explain" && p.toolCallId === "q1"));
			if (posed && !visible(live).includes("The pivots sit in columns 1 and 3.")) early.push(event.type);
		});
		await agent.continue();
		assert.equal(faux.state.callCount, 2, "the rewrite alone: no model call re-sends the question");
		assert.match(told, /^Kept/, "the question is kept, not refused");
		const turn = agent.state.messages.slice(3);
		const calls = turn.filter((m) => m.role === "assistant").map((m) => (m as { content: { type: string; id?: string }[] }).content.filter((b) => b.type === "toolCall").map((b) => b.id));
		assert.deepEqual(calls, [["m1"], ["m2", "q1"]], "the question sits under the rewrite in the record");
		// The record keeps no clean question result: persistTurn drops the placeholder, and stamps ids.
		const record = agent.state.messages.filter((m) => !(m.role === "toolResult" && (m as { toolName: string }).toolName === "explain" && !(m as { isError: boolean }).isError)).map((m, i) => ({ ...m, id: (m as { id?: string }).id ?? `kept-${i}` })) as LhMessage[];
		assert.equal(pendingQuestionOf(record)?.toolCallId, "q1", "and waits for his answer once the turn is kept");
		const shown = visible(agent.state.messages);
		assert.ok(shown.includes("The pivots sit in columns 1 and 3.") && !shown.includes("You got it right"));
		assert.deepEqual(early, [], "no view poses the question before the rewrite shows");
	});

	it("a kept question waits through a reply with no rewrite: the tutor is told to send it, and the question is posed under it (round 12, 3 M1)", async () => {
		const question = { question: "What is $\\dim \\ker A$?", type: "check", nodeId: "rank", correctAnswer: "1, by rank-nullity." };
		let told = "";
		const { engine, faux } = scripted([
			fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: "You got it right: rank 2." }, { id: "m1" }), fauxToolCall("explain", question, { id: "q1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage(""),
			(context) => {
				const last = context.messages.at(-1);
				told = last && last.role === "user" ? JSON.stringify(last.content) : "";
				return fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: "The pivots sit in columns 1 and 3." }, { id: "m2" })], { stopReason: "toolUse" });
			},
			fauxAssistantMessage("A fourth reply must not run."),
		]);
		const agent = createTeacherAgent(undefined, { engine, messages: asAgentMessages(answering("rank 2")) });
		await agent.continue();
		assert.equal(faux.state.callCount, 3);
		assert.match(told, /your message was refused and you sent no rewrite/);
		const calls = agent.state.messages.slice(3).filter((m) => m.role === "assistant").map((m) => (m as { content: { type: string; id?: string }[] }).content.filter((b) => b.type === "toolCall").map((b) => b.id));
		assert.deepEqual(calls, [["m1"], [], ["m2", "q1"]], "posed under the rewrite the note asked for");
	});

	it("a kept question whose words had nothing for him is posed once the tutor ends its turn after the note (round 12, 3 M1)", async () => {
		const question = { question: "What is $\\dim \\ker A$?", type: "check", nodeId: "rank", correctAnswer: "1, by rank-nullity." };
		const { engine, faux } = scripted([
			fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: "You got it right: rank 2." }, { id: "m1" }), fauxToolCall("explain", question, { id: "q1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage(""),
			fauxAssistantMessage(""),
			fauxAssistantMessage("A fourth reply must not run."),
		]);
		const agent = createTeacherAgent(undefined, { engine, messages: asAgentMessages(answering("rank 2")) });
		await agent.continue();
		assert.equal(faux.state.callCount, 3);
		const calls = agent.state.messages.slice(3).filter((m) => m.role === "assistant").map((m) => (m as { content: { type: string; id?: string }[] }).content.filter((b) => b.type === "toolCall").map((b) => b.id));
		assert.deepEqual(calls, [["m1"], [], ["q1"]], "he still gets the question, as the turn's last reply");
	});

	it("a rewrite that asks its own question poses that one: the kept question is let go (round 12, 3 M1)", async () => {
		const question = { question: "What is $\\dim \\ker A$?", type: "check", nodeId: "rank", correctAnswer: "1, by rank-nullity." };
		const { engine, faux } = scripted([
			fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: "You got it right: rank 2." }, { id: "m1" }), fauxToolCall("explain", question, { id: "q1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: "The pivots sit in columns 1 and 3." }, { id: "m2" }), fauxToolCall("explain", question, { id: "q2" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("A third reply must not run."),
		]);
		const agent = createTeacherAgent(undefined, { engine, messages: asAgentMessages(answering("rank 2")) });
		await agent.continue();
		assert.equal(faux.state.callCount, 2);
		const calls = agent.state.messages.slice(3).filter((m) => m.role === "assistant").map((m) => (m as { content: { type: string; id?: string }[] }).content.filter((b) => b.type === "toolCall").map((b) => b.id));
		assert.deepEqual(calls, [["m1"], ["m2", "q2"]]);
	});

	it("ordinary text never reaches him: the tutor is told, and sends its answer through the guard", async () => {
		// Round 7: after Explain instead the tutor answered his question in plain text, 9 sentences, a recap and a menu.
		const plain = "Because row reduction changes the column space itself. It keeps only the relations among the columns. Want to go back to the rank problems?";
		const answer = "Row reduction keeps the relations among the columns but moves the column space, so the basis is the pivot columns of the original $A$.";
		let told = "";
		const { engine, faux } = scripted([
			fauxAssistantMessage(plain),
			(context) => {
				const last = context.messages.at(-1);
				told = last && last.role === "user" ? JSON.stringify(last.content) : "";
				return fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: answer }, { id: "a1" })], { stopReason: "toolUse" });
			},
			fauxAssistantMessage(""),
		]);
		const record = asAgentMessages([newUserMessage("Rank"), assistant([send("A step.")]), newUserMessage("why can't I just use the columns of the echelon form?")]);
		const agent = createTeacherAgent(undefined, { engine, messages: record });
		const views: string[] = [];
		agent.subscribe((event) => {
			if (event.type === "message_update") views.push(JSON.stringify(projectView(agent.state.messages.concat(event.message) as LhMessage[], { executions: new Map(), inFlight: true, streamingIds: new Set([(event.message as LhMessage).id]) })));
		});
		await agent.continue();
		assert.equal(faux.state.callCount, 3);
		assert.match(told, /he never sees ordinary text, only what you send with send_to_user/);
		assert.match(told, /Stop hook feedback:/, "the note comes from Claude Code's Stop hook, not a message pushed after the result");
		const shown = visible(agent.state.messages);
		assert.ok(shown.includes("pivot columns of the original"), "the answer sent with send_to_user shows");
		assert.ok(!shown.includes("Want to go back"), "the plain text never shows");
		assert.ok(views.every((v) => !v.includes("Want to go back")), "not even while the reply streams");
	});

	it("ordinary text before a question: the question waits once, so the teaching it was written for can be sent", async () => {
		const question = { question: "What is $\\dim \\ker A$?", type: "check", nodeId: "rank", correctAnswer: "1, by rank-nullity." };
		const { engine, faux } = scripted([
			fauxAssistantMessage([{ type: "text", text: "Rank-nullity says the dimensions add up to the number of columns." }, fauxToolCall("explain", question, { id: "q1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: "Rank and nullity add up to the number of columns." }, { id: "m1" }), fauxToolCall("explain", question, { id: "q2" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("A third reply must not run."),
		]);
		const agent = createTeacherAgent(undefined, { engine, messages: asAgentMessages(answering("rank 2")) });
		await agent.continue();
		assert.equal(faux.state.callCount, 2);
		const shown = visible(agent.state.messages);
		assert.ok(shown.includes("Rank and nullity add up") && !shown.includes("dimensions add up"));
		const results = agent.state.messages.slice(3).filter((m) => m.role === "toolResult").map((m) => [(m as { toolCallId: string }).toolCallId, (m as { isError: boolean }).isError]);
		assert.deepEqual(results, [["q1", true], ["m1", false], ["q2", false]]);
	});
	it("after Explain instead, his answer to the check still owes him a way on, until he writes or practice resumes (round 7)", () => {
		const handBack = { id: "steer_mode_t2", role: "custom", customType: "mode-handoff", content: "[TEACHING]", display: true, details: { chatId: "c", mode: "teach" }, timestamp: 1 } as LhMessage;
		const q = ask("What is $\\operatorname{rank} B$?", "recall");
		assert.equal(turnInputOf([newUserMessage("Rank practice"), handBack, assistant([q]), answered(q.id, "2")]).handedBack, true);
		assert.equal(turnInputOf([newUserMessage("Rank practice"), handBack, newUserMessage("ok"), assistant([q]), answered(q.id, "2")]).handedBack, undefined);
		assert.equal(turnInputOf(answering("rank 2")).handedBack, undefined);
	});

	it("after Explain instead, the explanation always leaves him a next action (round 7)", async () => {
		const handBack = { id: "steer_mode_t1", role: "custom", customType: "mode-handoff", content: "[TEACHING]", display: true, details: { chatId: "c", mode: "teach" }, timestamp: 1 } as LhMessage;
		const check = { question: "Which columns of $A$ form a basis of $\\operatorname{im} A$?", type: "check", nodeId: "rank", correctAnswer: "The pivot columns of A." };
		let told = "";
		const { engine, faux } = scripted([
			fauxAssistantMessage([fauxToolCall(SEND_TO_USER_TOOL, { message: "Row reduction keeps the relations among the columns, so the pivot columns of the original $A$ are a basis of its image." }, { id: "e1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage(""),
			(context) => {
				const last = context.messages.at(-1);
				told = last && last.role === "user" ? JSON.stringify(last.content) : "";
				return fauxAssistantMessage([fauxToolCall("explain", check, { id: "c1" })], { stopReason: "toolUse" });
			},
			fauxAssistantMessage("A fourth reply must not run: the check ends the turn."),
		]);
		const record = asAgentMessages([newUserMessage("Rank practice"), assistant([send("A step.")]), handBack]);
		const agent = createTeacherAgent(undefined, { engine, messages: record });
		await agent.continue();
		assert.equal(faux.state.callCount, 3);
		assert.match(told, /He has nothing to do next/);
		const last = agent.state.messages.at(-1) as { role: string; toolName?: string; isError?: boolean };
		assert.deepEqual([last.role, last.toolName, last.isError], ["toolResult", "explain", false], "the turn ends on the check, waiting for his answer");
	});
});
