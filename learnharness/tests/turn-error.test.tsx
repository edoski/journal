/**
 * A failed reply under the Proposed design (components/lesson/turn-error.md):
 * one plain sentence the learner can act on, the provider's own text only
 * on demand, Retry kept. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { turnErrorText } from "../components/lesson/turn-error-text.ts";
import { TurnError } from "../components/lesson/turn-error.tsx";

const ANTHROPIC_401 = '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_011"}';

describe("turnErrorText", () => {
	it("reads a rejected key as one sentence and keeps the raw text as details", () => {
		assert.deepEqual(turnErrorText(ANTHROPIC_401), { kind: "key", sentence: "The provider rejected your API key.", details: ANTHROPIC_401 });
		assert.equal(turnErrorText("Incorrect API key provided: sk-abc. You can find your API key at https://platform.openai.com.").kind, "key");
		assert.equal(turnErrorText("403 Forbidden").kind, "key");
	});

	it("reads rate limits and overloads as a busy provider", () => {
		assert.equal(turnErrorText('429 {"type":"error","error":{"type":"rate_limit_error"}}').kind, "busy");
		assert.equal(turnErrorText('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}').kind, "busy");
	});

	it("shows prose already written for people as it is, with no details", () => {
		const curated = "Claude Code is not signed in to your Claude plan. Run `claude` in a terminal and sign in, then press Refresh in Settings, Accounts.";
		assert.deepEqual(turnErrorText(curated), { kind: "written", sentence: curated, details: null });
		const claude = "Claude is limiting requests right now. Wait a minute, then retry. See https://claude.ai/settings/usage. No API key was used.";
		assert.equal(turnErrorText(claude).kind, "written");
	});

	it("reads a turn refused because Claude is signed out as one plain sentence that says his words are kept", () => {
		const refusal = JSON.stringify({ error: "Claude Code is not signed in to your Claude plan — run `claude` in a terminal, sign in with your Claude account, then press Refresh in Settings → Accounts", code: "provider_key_missing", provider: "claude" });
		assert.deepEqual(turnErrorText(refusal), { kind: "signed-out", sentence: "Claude isn't signed in, so the tutor couldn't reply. What you wrote is still in the box.", details: null });
		const html = renderToStaticMarkup(<TurnError message={refusal} onOpenSettings={() => {}} onSignIn={() => {}} />);
		const { document } = parseHTML(html);
		assert.equal(document.querySelector("[data-testid=turn-error-sign-in]")?.textContent, "Sign in");
	});

	it("says the app could not be reached when the browser's request never left, with no raw text", () => {
		for (const raw of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."]) {
			assert.deepEqual(turnErrorText(raw), { kind: "offline", sentence: "Couldn't reach the app. Check it's running, then send again.", details: null }, raw);
		}
	});

	it("says a lesson deleted elsewhere was deleted, and reads other route errors as their text", () => {
		assert.deepEqual(turnErrorText('{"error":"Unknown chat"}'), { kind: "gone", sentence: "This lesson was deleted.", details: null });
		assert.deepEqual(turnErrorText('{"error":"Invalid JSON body"}'), { kind: "failed", sentence: "The reply failed.", details: "Invalid JSON body" });
	});

	it("falls back to a plain failure for anything else, keeping the raw text", () => {
		assert.deepEqual(turnErrorText("fetch failed"), { kind: "failed", sentence: "The reply failed.", details: "fetch failed" });
		assert.equal(turnErrorText('500 {"error":"internal"}').sentence, "The reply failed.");
		assert.deepEqual(turnErrorText(""), { kind: "failed", sentence: "The reply failed.", details: null });
	});
});

describe("TurnError", () => {
	const render = (message: string, onRetry?: () => void) =>
		parseHTML(`<html><body>${renderToStaticMarkup(<TurnError message={message} onRetry={onRetry} onOpenSettings={() => {}} />)}</body></html>`).document;

	it("keeps the raw provider text out of the line until Details is opened", () => {
		const doc = render(ANTHROPIC_401, () => {});
		assert.equal(doc.querySelector('[data-testid="turn-error-sentence"]')?.textContent, "The provider rejected your API key.");
		assert.doesNotMatch(doc.body.textContent ?? "", /x-api-key/);
		const buttons = [...doc.querySelectorAll("button")].map((b) => b.textContent);
		assert.deepEqual(buttons, ["Retry", "Open Settings", "Details"]);
		assert.equal(doc.querySelector('[data-testid="turn-error-details-toggle"]')?.getAttribute("aria-expanded"), "false");
	});

	it("offers Home instead of Retry for a deleted lesson", () => {
		const doc = render('{"error":"Unknown chat"}', () => {});
		assert.equal(doc.querySelector('[data-testid="turn-error-sentence"]')?.textContent, "This lesson was deleted.");
		assert.deepEqual([...doc.querySelectorAll("a, button")].map((b) => b.textContent), ["Go to Home"]);
	});

	it("offers neither Settings nor Details when the message is already plain, and no Retry when it cannot run", () => {
		const doc = render("This lesson could not start. Close it and start a new one.");
		assert.deepEqual([...doc.querySelectorAll("button")].map((b) => b.textContent), []);
	});
});
