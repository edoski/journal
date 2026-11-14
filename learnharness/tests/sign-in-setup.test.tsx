/**
 * The sign-in pill: with the Claude account signed out, the composer pill
 * asks for a sign-in. The dialog it opens is pinned in
 * setup-dialog-interaction.test.tsx.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignInPill } from "../components/setup-cta.tsx";

describe("SignInPill — the composer-hoisted notice", () => {
	it("asks for the Claude sign-in with its own testid", () => {
		const html = renderToStaticMarkup(createElement(SignInPill, { onOpen: () => {} }));
		assert.ok(html.includes('data-testid="setup-cta-keys"'));
		assert.match(html, />Sign in to Claude<\/button>/);
	});
});
