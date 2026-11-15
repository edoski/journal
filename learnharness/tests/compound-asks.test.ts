/**
 * One question asks one thing (round 7, 15 Nov 2026): 10 of 14 questions in
 * a lesson asked two or three things in one sentence, and the guard counted
 * only question marks. The questions below are the evaluators' recorded
 * ones, word for word.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { questionAsks } from "../src/core/voice-check.ts";

const count = (text: string) => questionAsks(text).length;

describe("a question that asks more than one thing", () => {
	const compound: Array<[string, number]> = [
		["What is the rank of $A$, what is $\\dim \\ker A$, and is $A$ invertible?", 3],
		["Find a relation among the columns of $B$, turn it into a nonzero $x$ with $Bx = 0$, and confirm it by multiplying out $Bx$.", 3],
		["Is $A$ invertible, and which nonzero vector must lie in $\\ker A$?", 2],
		["Which assumption is it, how would you repair the model, and what does the repair do to the distribution's parameters?", 3],
		["Write the slot model for half-minute slots. Then say what happens to $n$, to $p$ and to $np$, and why $np$ behaves the way it does.", 3],
		["Find a nonzero vector in $\\ker A$ without doing elimination, then give two different inputs $u \\neq w$ with $Au = Aw$.", 2],
		["Which distribution does the number of right answers have, and why? What is the probability you get exactly 3 right?", 2],
		["Compute the rank and state the nullity.", 2],
		["Find the pivots and then give the rank.", 2],
	];
	for (const [q, n] of compound) it(q, () => assert.equal(count(q), n, JSON.stringify(questionAsks(q))));
});

describe("a question that asks one thing", () => {
	const single = [
		"What is $\\dim \\ker A$?",
		"Which distribution would you use for the number of calls in one hour, and why?",
		"Is the map one-to-one, onto, both, or neither?",
		"If $A$ is $3 \\times 3$ with rank $2$, what is $\\dim \\ker A$?",
		"Calls arrive at an average of $\\lambda$ per minute, and the minute is split into $n$ slots. Write $P(X_n = k)$ in terms of $n$, $\\lambda$ and $k$.",
		"Suppose row operations $E_1, \\dots, E_k$ reduce $A$ all the way to $I$, so $E_k \\cdots E_1 A = I$. What is the product $E_k \\cdots E_1$?",
		"Which vector lies in $\\ker A$ and is nonzero?",
		"Explain why the sum of the probabilities is 1.",
		"Say whether $A$ is invertible, and why.",
		"Is it invertible, or is it singular?",
		"What happens to $n$ and $p$ when the slots halve?",
		"Show that $N$ is not invertible by finding a nonzero vector $v$ with $Nv = 0$.",
		"A $3 \\times 3$ matrix $A$ has $\\ker A = \\{0\\}$. Why does $Ax = b$ then have a solution for every $b$ in $\\mathbb{R}^3$?",
		"Find $x$ and then $y$.",
		"Is $B$ the inverse of $A$, and how do you know?",
	];
	for (const q of single) it(q, () => assert.equal(count(q), 1, JSON.stringify(questionAsks(q))));
});
