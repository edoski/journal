/**
 * Round 16, M5 (2 D1): the first answer in the resumed Eigen lesson took
 * 101 s. One cold model reply thought through the whole turn first, the
 * grade, a new plan, a demo and the next check, and the card's mark and the
 * feedback showed only once all of it was written (P5 measured 85 s to the
 * mark at load 7). The teacher now grades his answer in a reply of its own,
 * weighing only the answer, and writes the rest in the reply after the
 * save's receipt, so the mark reaches his card while it is written.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Type } from "typebox";
import type { AgentEvent, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { SdkAgent } from "../src/agent/sdk/agent.ts";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { fakeSdk } from "./helpers/fake-sdk.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("his answer's grade, in a reply of its own", () => {
	it("is what the teacher is told: the grade alone first, the rest after the save's receipt", () => {
		const teacher = composeInstructions("teacher");
		assert.match(teacher, /\*\*His answer is graded in a reply of its own\.\*\* The reply that takes his answer holds its grade and nothing else: your words to him on it, when it gets any, a prediction's resolution included, and its `course_save`\. Weigh only his answer before you write it\. The rest of the turn comes in the reply after the save's receipt: `lesson_progress`, the teaching it leads to, a demo, the next question\./);
		assert.match(read("src/agent/prompts/teacher/50-demos.md"), /In a turn that answers his work, the demo goes in the reply after the one that grades it, before its question/);
	});

	it("reaches his card before the demo is written: the save's result lands while the next reply streams", async () => {
		const tool = (name: string): AgentTool<any> => ({
			name, label: name, description: name, parameters: Type.Object({}, { additionalProperties: true }),
			execute: async () => ({ content: [{ type: "text", text: `${name} done` }], details: {} }),
		});
		const faux = createFauxCore({});
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall("send_to_user", { message: "Not quite: the diagonal stays on its line." }, { id: "words" }), fauxToolCall("course_save", { observations: [] }, { id: "save" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("demo", { brief: "the two lines" }, { id: "demo" }), fauxToolCall("explain", { question: "Which line?" }, { id: "check" })], { stopReason: "toolUse" }),
		]);
		const fake = fakeSdk({ model: faux.models[0], streamFn: faux.streamSimple });
		const agent = new SdkAgent({
			engine: fake.engine, systemPrompt: "tutor", tools: ["send_to_user", "course_save", "demo", "explain"].map(tool),
			messages: [{ id: "u1", role: "user", content: "The x-axis and the y-axis, each stretched by about 2", timestamp: 0 } as AgentMessage],
			endsTurn: (name) => name === "explain",
		});
		const order: string[] = [];
		agent.subscribe((event: AgentEvent | { type: string }) => {
			const e = event as AgentEvent;
			if (e.type === "message_end" && (e.message as { role: string }).role === "toolResult") order.push(`result:${(e.message as { toolName: string }).toolName}`);
			if (e.type === "message_update" && e.assistantMessageEvent.type === "toolcall_start") {
				const block = (e.message as { content: { type: string; name?: string }[] }).content[e.assistantMessageEvent.contentIndex];
				order.push(`writing:${block?.name}`);
			}
		});
		await agent.continue();
		assert.ok(order.indexOf("result:course_save") >= 0 && order.indexOf("result:course_save") < order.indexOf("writing:demo"), order.join(", "));
		assert.ok(order.indexOf("result:send_to_user") < order.indexOf("writing:demo"), order.join(", "));
	});
});
