/**
 * Round 15, m4 (1 m3): the Ask-the-tutor session that took up the
 * Expectation lesson was the Geometric page's Now ("Fitting the exam's
 * topics in · Resume"). Ask the tutor from the exam's gaps opens a session
 * on the gap topics (Geometric, Variance, …); the tutor then reviewed Random
 * variables and saved the Expectation lesson's task, so the session was that
 * lesson, yet it kept the gap topics as its own and the name it opened with.
 * When a session takes up a task, its topic and its title follow the task.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { ChatListItem, CourseMapTopic, TopicHandle } from "../src/core/index.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-ask-task-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { topicAction } = await import("../components/unit-inbox/topic-page/topic-facts.ts");
const { map, topic } = await import("./fixtures/round8-home.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const save = (changes: unknown) => {
	const id = `s${++n}`;
	return [
		{ id: `a${n}`, role: "assistant", content: [{ type: "toolCall", id, name: "course_save", arguments: { changes } }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: n },
		{ id: `r${n}`, role: "toolResult", toolCallId: id, toolName: "course_save", content: [{ type: "text", text: "{}" }], details: {}, isError: false, timestamp: n },
	];
};

describe("an Ask-the-tutor session that takes up a lesson's task (round 15, m4)", () => {
	const course = { workspace: "/s/prob", title: "Probability" };
	const created = chatStore.createChat("Fitting the exam's topics in", course, ["geometric", "variance", "poisson"], undefined, true);
	chatStore.saveMessages(created.id, [
		newUserMessage("My exam plan has no room for Geometric distribution and Variance. How can I still fit them in before the exam?"),
		...save({ observations: [{ topics: ["random-variables"], text: "Found the PMF of the largest of three rolls", result: "correct", help: "none" }] }),
		...save({ observations: [{ topics: ["expectation"], text: "Found the expected number of letters in their own envelopes", result: "correct", help: "none" }] }),
		...save({ tasks: { "expectation-lesson": { title: "Expectation and linearity lesson", topics: ["expectation"], step: "Answer the open Expectation and linearity question" } } }),
	] as never);
	const listed = { ...chatStore.listChats().find((c) => c.id === created.id)!, busy: false, ended: "left" } as ChatListItem;

	it("belongs to the task's topic and is named after its task", () => {
		assert.deepEqual(listed.ownTopics, ["expectation"]);
		assert.equal(listed.title, "Expectation and linearity lesson");
	});

	it("is the Expectation page's to resume, never the Geometric page's", () => {
		const topics: CourseMapTopic[] = ["geometric", "variance", "poisson", "expectation", "random-variables"].map((h) => topic(h, h, { level: h === "random-variables" ? "assisted" : "new", introduced: null }));
		const probability = { ...map({ topics, today: "2026-11-17" }), workspace: course.workspace, title: course.title };
		const geometric = topicAction(topics[0]!, probability, [listed]);
		assert.ok(!("chat" in geometric && geometric.chat.id === created.id), `Geometric's Now: ${JSON.stringify(geometric)}`);
		const expectation = topicAction(topics.find((t) => t.handle === ("expectation" as TopicHandle))!, probability, [listed]);
		assert.ok("chat" in expectation && expectation.chat.id === created.id, `Expectation's Now: ${JSON.stringify(expectation)}`);
	});
});
