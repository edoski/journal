/**
 * Round 18, m4 (2 m1; round 17's m13, not fixed): after the Eigen recall
 * the tutor asked "Practise eigenvalue problems now? 1 Yes, some practice
 * problems 2 Stop here for today", and the sheet "Part (c) is done… 1 Go
 * on to part (d) 2 Stop here for today". Home's Today and the sidebar
 * listed "Continue Eigenvalues and eigenvectors · Your turn". An offer to
 * do more asks him nothing: the session is left where it is.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-offer-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LEARNING_TODAY = "2026-11-08";
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { sessionState } = await import("../components/nav/session-state.ts");
const { sessionRowStatus } = await import("../components/unit-inbox/unit-row.tsx");
const { todayRows } = await import("../components/study-home/study-facts.ts");
const { COURSE } = await import("./fixtures/round8-home.ts");
after(() => {
	delete process.env.LEARNING_TODAY;
	fs.rmSync(scratch, { recursive: true, force: true });
});

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const LA = { workspace: "/s/la", title: "Linear Algebra" };
const asked = (options: unknown[]) => ({
	id: "offer",
	role: "assistant",
	content: [{ type: "text", text: "Eigenvalues of a 2×2 matrix are yours now." }, { type: "toolCall", id: "ask-1", name: "ask_user_question", arguments: { question: "Practise eigenvalue problems now?", options } }],
	api: "faux",
	provider: "test",
	model: "test",
	usage: USAGE,
	stopReason: "toolUse",
	timestamp: Date.parse("2026-11-08T10:00:00"),
});
const session = (options: unknown[]) => {
	const created = chatStore.createChat("Eigenvalues and eigenvectors lesson", LA, ["eigen"]);
	chatStore.saveMessages(created.id, [{ ...newUserMessage("Continue Eigenvalues and eigenvectors"), timestamp: Date.parse("2026-11-08T09:50:00") }, asked(options)] as never);
	return { ...chatStore.listChats().find((c) => c.id === created.id)!, busy: false };
};

describe("an offer to do more is no turn of his (round 18, m4)", () => {
	const offer = session([{ label: "Yes, some practice problems" }, { label: "Stop here for today", stops: true }]);

	it("reads Left off today in the one status function, with its choice still in the box", () => {
		assert.equal(sessionState(offer), "left");
		assert.deepEqual(sessionRowStatus(offer, sessionState(offer), "2026-11-08"), { kind: "task", words: "Left off today" });
		assert.equal(offer.pendingQuestion, true, "opening it still shows the choice");
	});

	it("Home's Today lists no row for it", () => {
		const rows = todayRows([{ ...COURSE, map: { ...COURSE.map, today: "2026-11-08", topics: COURSE.map.topics.map((t) => ({ ...t, review: null })) }, due: [] }], [offer], "2026-11-08");
		assert.ok(!rows.some((row) => row.kind === "session" && row.chat.id === offer.id), JSON.stringify(rows.map((r) => r.kind)));
	});

	it("a choice with no way to stop is still his turn", () => {
		const choice = session([{ label: "The eigenvector" }, { label: "The eigenvalue" }]);
		assert.equal(sessionState(choice), "your-turn");
	});
});
