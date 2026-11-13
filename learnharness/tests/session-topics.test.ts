import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sessionTopicsOf, type LhMessage } from "../src/core/native-messages.ts";

const call = (id: string, name: string, args: unknown) => ({ type: "toolCall", id, name, arguments: args });
const assistant = (...content: unknown[]) => ({ role: "assistant", content, stopReason: "toolUse", timestamp: 0 });
const result = (toolCallId: string, isError = false) => ({ role: "toolResult", toolCallId, toolName: "t", content: [], isError, timestamp: 0 });
const transcript = (...messages: unknown[]) => messages as LhMessage[];

describe("sessionTopicsOf", () => {
	it("reads the topics of posed problems, saved observations and introductions, each once", () => {
		const messages = transcript(
			assistant(call("p1", "problem", { statement: "…", topics: ["rank"] })),
			result("p1"),
			assistant(
				call("s1", "course_save", {
					changes: {
						topics: { kernel: { introduced: true }, basis: { gap: "mixes up span and basis" } },
						observations: [{ topics: ["rank", "elimination"], text: "…" }],
					},
				}),
			),
			result("s1"),
		);
		assert.deepEqual(sessionTopicsOf(messages), ["rank", "elimination", "kernel"]);
	});

	it("leaves out calls that errored or never got a result", () => {
		const messages = transcript(
			assistant(call("p1", "problem", { topics: ["rank"] })),
			result("p1", true),
			assistant(call("s1", "course_save", { changes: { observations: [{ topics: ["span"] }] } })),
		);
		assert.deepEqual(sessionTopicsOf(messages), []);
	});

	it("reads a save sent as JSON text, as the engine does", () => {
		const messages = transcript(
			assistant(call("s1", "course_save", { changes: JSON.stringify({ observations: [{ topics: ["chain-rule"], text: "…" }] }) })),
			result("s1"),
			assistant(call("s2", "course_save", { changes: "not json" })),
			result("s2"),
		);
		assert.deepEqual(sessionTopicsOf(messages), ["chain-rule"]);
	});

	it("never takes a topic from a plan step's name, and a general question touches nothing", () => {
		const messages = transcript(
			assistant(call("plan", "plan_init", { mermaid: "graph TD\n  span[Span] --> diagonal[Diagonalization]" })),
			result("plan"),
		);
		assert.deepEqual(sessionTopicsOf(messages), []);
		assert.deepEqual(sessionTopicsOf(transcript({ role: "user", content: "Why columns?", timestamp: 0 })), []);
	});
});
