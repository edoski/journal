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

	it("adds the plan's node ids as candidates, and a general question touches nothing", () => {
		assert.deepEqual(sessionTopicsOf(transcript(), ["eigen", "charpoly"]), ["eigen", "charpoly"]);
		assert.deepEqual(sessionTopicsOf(transcript({ role: "user", content: "Why columns?", timestamp: 0 })), []);
	});
});
