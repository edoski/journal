/**
 * Ask the tutor shows his question (round 13, 1 n8). On the Probability
 * head, Ask the tutor opened a lesson whose reply began "You fit them in…"
 * with no question above it: the start was on topics, so its opening, his
 * question "My exam plan has no room for … How can I still fit them in
 * before the exam?", was taken for the app's instruction and drew no
 * bubble. A start the app words as his question (named apart from its
 * opening, round 11, 1 N14) keeps its opening as his message. The engine
 * is the fake CLI; the data dir is temporary.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-ask-shows-")));
const PROB = path.join(TMP, "study", "prob");
fs.mkdirSync(PROB, { recursive: true });
useFakeEngine(TMP, [{ workspace: PROB, title: "Probability" }]);
process.env.LH_DATA_DIR = path.join(TMP, "data");

const { POST: createChatRoute } = await import("../app/api/chats/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { openedByApp } = await import("../src/core/session-opening.ts");
const { examGapAskCreation, topicCreation } = await import("../components/unit-inbox/start-unit.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

async function startFrom(body: unknown) {
	const res = await createChatRoute(new Request("http://test/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
	assert.equal(res.status, 200);
	const { id } = (await res.json()) as { id: string };
	return { ...chatStore.getChat(id)!, messages: [{ role: "user", content: (body as { title: string }).title }] };
}

describe("Ask the tutor's opening is his question (1 n8)", () => {
	it("draws as his message, while a press on a topic stays the app's opening", async () => {
		const ask = await startFrom(examGapAskCreation(PROB, ["Variance", "Expectation"]));
		assert.equal(openedByApp(ask), false, "his question shows");
		const press = await startFrom(topicCreation(PROB, { title: "Variance", handle: "variance" as never, review: null }, "2026-11-17"));
		assert.equal(openedByApp(press), true, "Start Variance stays the app's words");
	});
});
