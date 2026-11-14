import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProviderKeyRefusal, retryFailedResponse } from "../components/chat.tsx";
import { SessionModel } from "../components/session-core.ts";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { isProviderKeyRefusal, providerKeyMissing, PROVIDER_KEY_MISSING_CODE } from "../src/core/settings.ts";

/**
 * The signed-out refusal rendered honestly: the server refuses a turn with
 * 503 {error, code: "provider_key_missing", provider} when the Claude account
 * every agent runs on is signed out. These pin the client's pure seams: the
 * refusal detector (the transport throws the 503 body verbatim as the error
 * text), the job-record matcher, and Retry's draft ownership.
 */

const REFUSAL = JSON.stringify(providerKeyMissing("claude-subscription"));

describe("Retry owns no composer recovery draft", () => {
	it("accepted A / failed model / unsent B / Retry refused retires only A's fallback", async () => {
		const durable: LhMessage[] = [
			newUserMessage("Accepted text A"),
			{ ...fauxAssistantMessage("Partial reply", { stopReason: "error", errorMessage: "Model failed" }), id: "failed-A" },
		];
		const submittedDraft: { current: string | null } = { current: "Accepted text A" };
		let composer = "Unsent text B";
		const model = new SessionModel({
			chatId: "fixture", initialMessages: durable,
			fetch: async (_url, init) => {
				assert.equal(submittedDraft.current, null, "retire A before Retry can reach a refusal");
				assert.deepEqual(JSON.parse(String(init?.body)).input, { type: "retry" });
				return new Response(REFUSAL, { status: 503 });
			},
		});
		let request!: ReturnType<SessionModel["send"]>;
		retryFailedResponse((input) => request = model.send(input), submittedDraft);
		await request;
		assert.equal(model.getState().error?.message, REFUSAL, "503 stays raw for the sign-in routing");
		assert.ok(parseProviderKeyRefusal(REFUSAL));
		// The refusal effect restores only an owned submitted draft. Retry
		// must leave this slot empty, not replace B with A.
		if (submittedDraft.current !== null) composer = submittedDraft.current;
		assert.equal(composer, "Unsent text B");
		assert.deepEqual(model.getState().nativeMessages, durable, "Retry adds no optimistic learner message");
	});

	it("does not clear a later ordinary send's recovery draft when Retry settles", async () => {
		const submittedDraft: { current: string | null } = { current: "Accepted text A" };
		let finish!: () => void;
		const pending = new Promise<void>((resolve) => { finish = resolve; });
		retryFailedResponse(async () => pending, submittedDraft);
		assert.equal(submittedDraft.current, null);
		submittedDraft.current = "Later ordinary text C";
		finish();
		await pending;
		await Promise.resolve();
		assert.equal(submittedDraft.current, "Later ordinary text C", "no asynchronous cleanup may retire a newer owner");
	});

	it("ordinary text refusals still keep their submitted draft for recovery", async () => {
		const submittedDraft: { current: string | null } = { current: "Ordinary text C" };
		const model = new SessionModel({
			chatId: "fixture", initialMessages: [],
			fetch: async () => new Response(REFUSAL, { status: 503 }),
		});
		await model.send({ type: "text", text: submittedDraft.current! });
		assert.equal(submittedDraft.current, "Ordinary text C");
		assert.equal(model.getState().error?.message, REFUSAL);
		assert.equal(parseProviderKeyRefusal(model.getState().error?.message), true);
	});
});

describe("providerKeyMissing — the envelope factory", () => {
	it("asks for the account's Claude Code sign-in and carries the exact machine code", () => {
		const envelope = providerKeyMissing("claude-subscription-work");
		assert.equal(envelope.code, PROVIDER_KEY_MISSING_CODE);
		assert.equal(envelope.code, "provider_key_missing");
		assert.equal(envelope.provider, "claude-subscription-work");
		assert.match(envelope.error, /^Claude Code is not signed in/);
	});
});

describe("parseProviderKeyRefusal — the send refusal detector", () => {
	it("reads the envelope's own code and wording — the wording can never drift client-side", () => {
		assert.equal(parseProviderKeyRefusal(REFUSAL), true);
	});

	it("anything else is a real error — false, the honest banner stays", () => {
		assert.equal(parseProviderKeyRefusal(JSON.stringify({ code: "models_not_configured", error: "No model configured", missing: ["strong"] })), false);
		assert.equal(parseProviderKeyRefusal("FAILED: headless crashed"), false);
		assert.equal(parseProviderKeyRefusal(undefined), false);
		assert.equal(parseProviderKeyRefusal("{not json"), false);
	});
});

describe("isProviderKeyRefusal — the job-record matcher", () => {
	it("matches the envelope wording, not real failures", () => {
		assert.equal(isProviderKeyRefusal(providerKeyMissing("claude-subscription").error), true);
		assert.equal(isProviderKeyRefusal(""), false);
		assert.equal(isProviderKeyRefusal(undefined), false);
		assert.equal(isProviderKeyRefusal("FAILED: headless crashed"), false);
	});
});
