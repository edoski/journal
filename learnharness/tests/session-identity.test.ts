import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Type } from "typebox";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { APP_IDENTITY } from "../src/agent/models.ts";
import { runSubagent } from "../src/agent/sdk/task.ts";
import metadata from "../package.json" with { type: "json" };
import { fakeSdk } from "./helpers/fake-sdk.ts";

const again = { name: "again", label: "again", description: "Continue", parameters: Type.Object({}), execute: async () => ({ content: [{ type: "text" as const, text: "ok" }], details: {} }) };

describe("native app and conversation identity", { concurrency: false }, () => {
	it("shares one deeply frozen metadata-derived identity, without mutable conversation state", () => {
		assert.deepEqual(APP_IDENTITY, { userAgent: { custom: `learnharness/${metadata.version}` }, attribution: { name: metadata.name, url: metadata.homepage } });
		for (const value of [APP_IDENTITY, APP_IDENTITY.userAgent, APP_IDENTITY.attribution]) assert.ok(Object.isFrozen(value));
		assert.ok(!Object.hasOwn(APP_IDENTITY, "sessionId"));
	});

	it("separate background runs own distinct unsaved conversations", async () => {
		const faux = createFauxCore({});
		const round = () => [fauxAssistantMessage([fauxToolCall("again", {}, { id: "call_0" })], { stopReason: "toolUse" }), fauxAssistantMessage([fauxText("done")])];
		faux.setResponses([...round(), ...round(), ...round()]);
		const fake = fakeSdk({ model: faux.models[0], streamFn: faux.streamSimple });
		for (let run = 0; run < 3; run++) {
			let usage = 0;
			const result = await runSubagent([again], { engine: fake.engine, systemPrompt: "offline", prompt: "offline", maxTurns: 3, onUsage: () => usage++ });
			assert.equal(usage, 2, "one usage per model request");
			assert.equal(result.text, "done");
			assert.ok(result.newMessages.some((m) => m.role === "toolResult" && typeof m.durationMs === "number"), "native tool duration fields are preserved");
		}
		assert.equal(fake.calls.length, 3);
		for (const options of fake.calls) {
			assert.equal(options.persistSession, false, "a background run keeps no session");
			assert.equal(options.resume, undefined, "and never resumes another run's conversation");
		}
		assert.equal(fake.sessions.size, 3, "three separate conversations");
	});
});
