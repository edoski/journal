/**
 * A sheet stays a sheet (round 11, 2 N2): continuing Problem sheet 4, he
 * answered part (c) right; the probe concluded, and the teacher's wake
 * ("plan the full teaching arc… start teaching straight away") planned a
 * nine-step rank–nullity lesson from its basics and put it in front of
 * part (d), which he had just been asked to type. A probe that concludes in
 * a session holding an open task wakes the teacher to carry on with the
 * task's next step alone: a gap the assessment names comes before it, no
 * lesson from the basics, and a step that needs his material waits for it.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { probeDoneTool } from "../src/agent/tools/probe.ts";
import type { SteerMessage } from "../src/core/contracts.ts";
import { HANDOFF_TEXT, TASK_HANDOFF_TEXT } from "../src/core/contracts.ts";
import { newUserMessage, type LhMessage } from "../src/core/native-messages.ts";
import { chatStore } from "../src/store/chats.ts";
import { PATHS } from "../config.ts";

fs.mkdirSync(PATHS.data, { recursive: true });
const created: string[] = [];
after(() => {
	for (const id of created) {
		try {
			fs.unlinkSync(path.join(PATHS.chats, `${id}.json`));
		} catch {
			/* best effort */
		}
	}
});

const STAMPS = { api: "faux", provider: "test", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stopReason: "toolUse" } as const;
function saved(id: string, changes: unknown): LhMessage[] {
	return [
		{ id: `a_${id}`, role: "assistant", content: [{ type: "toolCall", id, name: "course_save", arguments: { changes } }], timestamp: 1, ...STAMPS } as never,
		{ id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: "course_save", content: [{ type: "text", text: "{}" }], details: null, isError: false, timestamp: 2 } as never,
	];
}
const ASSESSMENT = { strands: [{ strand: "Rank–nullity", assessment: "Floor: columns, unaided." }], summary: "Part (c) done. Part (d) next: ask him to type it." };

async function conclude(messages: LhMessage[]): Promise<SteerMessage[]> {
	const chat = chatStore.createChat("Problem sheet 4: rank and nullity");
	created.push(chat.id);
	chatStore.saveMessages(chat.id, messages);
	const delivered: SteerMessage[] = [];
	await probeDoneTool({ chatId: chat.id, chatStore, deliver: (s) => delivered.push(s) }).probe_done!.execute("t", { assessment: ASSESSMENT });
	return delivered;
}

describe("the teacher's wake in a session that continues a task", () => {
	it("asks for the task's next step alone, never a lesson from the basics, and waits for his material", async () => {
		const [wake] = await conclude([newUserMessage("Continue Problem sheet 4: rank and nullity"), ...saved("s1", { tasks: { "sheet-4": { step: "Part (d) of sheet 4" } }, focus: "sheet-4" })]);
		assert.equal(wake!.content, TASK_HANDOFF_TEXT);
		assert.doesNotMatch(TASK_HANDOFF_TEXT, /full teaching arc/);
		assert.match(TASK_HANDOFF_TEXT, /never a lesson on the topic from its basics/);
		assert.match(TASK_HANDOFF_TEXT, /ask me for it in one plain line[^.]*and end your turn/);
	});

	it("keeps the lesson's wake in a session holding no open task, and once the task is removed", async () => {
		assert.equal((await conclude([newUserMessage("Kernel")]))[0]!.content, HANDOFF_TEXT);
		const removed = [newUserMessage("Continue Problem sheet 4"), ...saved("s2", { focus: "sheet-4" }), ...saved("s3", { tasks: { "sheet-4": null } })];
		assert.equal((await conclude(removed))[0]!.content, HANDOFF_TEXT);
	});
});
