/**
 * Round 16, m11 (3 m4, 34): Poisson asked for in free text in a Binomial
 * review's chat got "What do you want from Poisson? Select all that
 * apply", three overlapping picks, and the probe after was the same for
 * any pick. Round 8 skipped the goal question only for a session opened
 * on the topic (`Opened on`); a course topic named in his words still got
 * one. In a course every lesson has its goal, so the prober's goal
 * question is refused there, whatever opened the session.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { createProberTools, type ProberToolContext } from "../src/agent/tools.ts";

const ctx = (course?: boolean) => ({ chatId: "c1", chatStore: {}, deliver: () => {}, jobStore: {}, spawn: () => {}, ...(course === undefined ? {} : { course }) }) as unknown as ProberToolContext;
const goal = { question: "What do you want from Poisson?", multiSelect: true, options: [{ label: "Learn it from scratch" }, { label: "Poisson as a limit of the binomial" }, { label: "Solve exam problems with it" }] };
const ask = async (course?: boolean) => {
	const tool = createProberTools(ctx(course)).ask_user_question!;
	return tool.execute("t1", goal as never, undefined as never, undefined as never);
};
const text = (r: Awaited<ReturnType<typeof ask>>) => r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");

describe("no goal question in a course (round 16, m11)", () => {
	it("the recorded goal question is refused in a course session, with the way on", async () => {
		const refused = await ask(true);
		assert.equal(refused.isError, true);
		assert.match(text(refused), /already has its goal.*start bracketing with `recall`/);
	});

	it("a session with no course still asks it", async () => {
		assert.notEqual((await ask()).isError, true);
	});

	it("the probe doctrine says so for a topic his words name, not only one the session opened on", () => {
		const probe = fs.readFileSync(new URL("../src/agent/prompts/prober/10-probe-doctrine.md", import.meta.url), "utf8");
		assert.match(probe, /whether the app opened the session on it \(the brief's `Opened on` line\) or his words named it/);
		assert.match(probe, /Only a session with no course asks the goal question/);
	});
});
