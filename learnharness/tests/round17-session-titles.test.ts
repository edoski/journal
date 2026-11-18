/**
 * Round 17, m5 (1 m2, 1 m3, 2 m5, 3 m5, 4 minor 7): session titles named a
 * review by a list it counted ("Gauss-Jordan reduction…, Matrix
 * multiplication and 5 more") or stored cut ("Review Inclusion-exclusion
 * principle, Conditional probability, Random…"), filed it under its first
 * topic's crumb, and search found no session by the topics its title hid.
 * A review of several topics is its course's review, a title is kept whole,
 * and search reads the topics it saved answers on.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-r17-titles-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { lessonPlaceTopics } = await import("../src/server/lesson-place.ts");
const { filterSessions } = await import("../components/sidebar-state.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const save = (topic: string, at: number) => [
	{ id: `a${at}`, role: "assistant", content: [{ type: "toolCall", id: `c${at}`, name: "course_save", arguments: { changes: { observations: [{ topics: [topic], text: "An answer", result: "correct", help: "none" }] } } }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: at },
	{ id: `r${at}`, role: "toolResult", toolCallId: `c${at}`, toolName: "course_save", content: [{ type: "text", text: "{}" }], details: {}, isError: false, timestamp: at },
];
const course = { workspace: "/s/calc", title: "Calculus I" };
const listed = (id: string) => chatStore.listChats().find((c) => c.id === id)!;

describe("a review's title (round 17, m5)", () => {
	it("is its course's review once it takes up several topics, never a count or a cut list", () => {
		// As the seed and earlier builds stored it.
		const counted = chatStore.createChat("Infinite limits…, The limit laws and 4 more", course, ["infinite-limits", "limit-laws", "chain-rule", "squeeze", "continuity", "ivt"]);
		chatStore.saveMessages(counted.id, [newUserMessage("Review Infinite limits"), ...save("chain-rule", 1)] as never);
		assert.equal(listed(counted.id).title, "Calculus I review");
		assert.doesNotMatch(listed(counted.id).title, /\band \d+ more\b|…/);
		const one = chatStore.createChat("Review The chain rule", course, ["chain-rule"]);
		chatStore.saveMessages(one.id, [newUserMessage("Review The chain rule")] as never);
		assert.equal(listed(one.id).title, "Review The chain rule", "a review of one topic keeps its name");
		chatStore.renameChat(counted.id, "Limits, my way");
		assert.equal(listed(counted.id).title, "Limits, my way", "a name he gave it stays");
	});

	it("has no topic crumb, since it is no one topic's", () => {
		const review = chatStore.createChat("Review Infinite limits, The limit laws", course, ["infinite-limits", "limit-laws"]);
		chatStore.saveMessages(review.id, [newUserMessage("Review Infinite limits, The limit laws")] as never);
		assert.deepEqual(lessonPlaceTopics(chatStore.getChat(review.id)!), []);
		const lesson = chatStore.createChat("The chain rule lesson", course, ["chain-rule"]);
		assert.deepEqual(lessonPlaceTopics(chatStore.getChat(lesson.id)!), ["chain-rule"], "a lesson keeps its topic's crumb");
	});

	it("is found by the topics it saved answers on", () => {
		const review = chatStore.createChat("Review Infinite limits, The limit laws", course, ["infinite-limits", "limit-laws"]);
		chatStore.saveMessages(review.id, [newUserMessage("Review Infinite limits, The limit laws"), ...save("chain-rule", 2)] as never);
		const titles: Record<string, string> = { "chain-rule": "The chain rule" };
		const found = filterSessions([{ ...listed(review.id), busy: false }], "chain rule", (_c, h) => titles[h]);
		assert.deepEqual(found.map((c) => c.id), [review.id]);
	});
});
