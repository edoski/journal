/** Ask is one message (round 5): once the tutor's reply settles, the Prose
 *  composer answers again, so his next words go as his answer. */

import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { useProseAnswer, type ProseAnswer } from "../components/lesson/prose/prose-answer.tsx";

let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
});

let seen: ProseAnswer | null = null;
function Probe({ replying, draft }: { replying: boolean; draft: string }) {
	seen = useProseAnswer({ openKey: "p1", box: null, replying, askDraft: () => draft });
	return null;
}

async function show(replying: boolean, draft = "") {
	await act(async () => root!.render(<Probe replying={replying} draft={draft} />));
}

test("the composer answers again once the reply to his question settles", async () => {
	root = createRoot(document.createElement("div"));
	await show(false);
	await act(async () => seen!.setMode("ask"));
	await show(true);
	assert.equal(seen!.mode, "ask", "Ask holds while the tutor writes");
	await show(false);
	assert.equal(seen!.mode, "answer");
});

test("Ask stays while he is already typing his next question", async () => {
	root = createRoot(document.createElement("div"));
	await show(false);
	await act(async () => seen!.setMode("ask"));
	await show(true, "and why");
	await show(false, "and why");
	assert.equal(seen!.mode, "ask");
});
