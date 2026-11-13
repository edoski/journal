/**
 * The sign-in surfaces: with no subscription signed in, the composer pill
 * asks for a sign-in and the SetupDialog's first stage is the connection
 * rows alone, with no key field anywhere.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignInPill } from "../components/setup-cta.tsx";
import { SetupKeysBody } from "../components/setup-dialog.tsx";

describe("SignInPill — the composer-hoisted notice", () => {
	it("the pill takes the CTA's chrome with its own testid and copy", () => {
		const html = renderToStaticMarkup(createElement(SignInPill, { onOpen: () => {} }));
		assert.ok(html.includes('data-testid="setup-cta-keys"'));
		assert.match(html, />Sign in to Claude or ChatGPT<\/button>/);
		assert.ok(!html.includes('data-testid="setup-cta"'), "the models CTA's testid must not appear on the sign-in pill");
	});
});

describe("SetupKeysBody — stage 1 is the subscription sign-in", () => {
	it("shows the Claude and ChatGPT connections and no key input", () => {
		const html = renderToStaticMarkup(createElement(SetupKeysBody));
		assert.ok(html.includes('data-testid="setup-stage-keys"'));
		assert.ok(html.includes('data-testid="subscription-connections"'));
		assert.ok(html.includes("ChatGPT"));
		assert.ok(!html.includes("setup-key-input"), "no key paste field");
		assert.ok(!/API key|Paste key/.test(html));
	});
});
