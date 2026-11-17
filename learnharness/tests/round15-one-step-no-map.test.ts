/**
 * Round 15, 2 n6 (m32; round 14, m39's remainder): Kernel's lesson map was
 * one "Part (c) of sheet 4" card at the top right of an empty pane, the
 * sheet session's plan holding that one step. A plan of one step says no
 * more than Now, so it draws no map and the history takes the width; a
 * plan of two steps or more still draws.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlanned, mapLessonAtFirst } from "../components/unit-inbox/topic-page/hybrid/hybrid-facts.ts";
import type { SessionEntry, TopicAction } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { chat } from "./fixtures/now-demo.ts";

const session = (id: string, nodes: string[]): SessionEntry =>
	({ chat: chat(id, { title: id }), state: "left", day: "2026-11-08", own: true, plan: { tree: { nodes: nodes.map((n) => ({ id: n, title: n })), edges: [], version: 1 }, current: nodes[0], visited: [] } }) as unknown as SessionEntry;

describe("a lesson's plan as the topic page's map", () => {
	it("draws no map for one step, the sheet's part (c) alone", () => {
		const sheet = session("chat_sheet", ["sheet4-c"]);
		assert.equal(isPlanned(sheet), false);
		assert.equal(mapLessonAtFirst([sheet], { kind: "resume", chat: sheet.chat } as unknown as TopicAction), null, "the history takes the width");
	});

	it("draws one for two steps or more, a step repeated counted once", () => {
		assert.equal(isPlanned(session("chat_lesson", ["kernel", "rank-nullity"])), true);
		assert.equal(isPlanned(session("chat_again", ["kernel", "kernel"])), false);
	});
});
