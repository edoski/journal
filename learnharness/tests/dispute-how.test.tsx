/**
 * The dispute can argue how an answer counted, not only its mark (round 6
 * N9): his row in the transcript says what he thinks, in the card's words.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DisputeRow } from "../components/answer-mark.tsx";

describe("his dispute in the transcript", () => {
	it("says how he thinks it should count, beside the mark he picked", () => {
		const html = renderToStaticMarkup(<DisputeRow data={{ answerId: "q1", observations: ["o4"], proposed: "correct", proposedHow: "ownWork" }} />);
		assert.match(html, /You think: Right, On your own/);
	});
	it("says it alone when he argued only how it counted", () => {
		const html = renderToStaticMarkup(<DisputeRow data={{ answerId: "q1", observations: ["o4"], proposedHow: "withHelp" }} />);
		assert.match(html, /You think: With help/);
	});
});
