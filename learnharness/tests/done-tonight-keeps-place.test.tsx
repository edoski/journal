/**
 * Done for today keeps its place once the lesson is closed for today, so
 * the roadmap strip beside it stays still (round 6, visual polish m2: the
 * strip jumped 146px right and landed under the pointer).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DoneTonightButton } from "../components/lesson/done-tonight.tsx";

test("closed for today, Done for today still holds its room, unseen and out of reach", () => {
	const html = renderToStaticMarkup(<DoneTonightButton onDone={() => {}} gone />);
	assert.match(html, /data-testid="done-tonight"/, "its room stays in the bar");
	assert.match(html, /\binvisible\b/);
	assert.match(html, /aria-hidden="true"/);
	assert.match(html, /tabindex="-1"/);
	assert.match(html, /disabled=""/);
});
