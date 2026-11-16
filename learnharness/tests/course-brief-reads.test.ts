/**
 * The course brief's engine reads are kept until a course record changes or
 * the study day turns (round 12, 3 D8). Each turn ran eleven engine
 * processes before the tutor could start, each replaying every course's
 * plan: about 3 s on an idle Mac and 15 s beside other work, on every turn.
 * The engine is the fake CLI, which logs each call; the data dir is
 * temporary.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-brief-reads-")));
const PROB = path.join(TMP, "study", "prob");
const LA = path.join(TMP, "study", "la");
for (const dir of [PROB, LA]) fs.mkdirSync(dir, { recursive: true });
const engine = useFakeEngine(TMP, [{ workspace: PROB, title: "Probability" }, { workspace: LA, title: "Linear Algebra" }]);
process.env.LH_DATA_DIR = path.join(TMP, "data");
process.env.LEARNING_TODAY = "2026-11-08";
process.env.FAKE_ENGINE_RESUME = JSON.stringify({ today: "2026-11-08", due: [], task: null });

const { POST: createChatRoute } = await import("../app/api/chats/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { fetchCourseBrief, courseBriefReadsSettled } = await import("../src/server/course-brief.ts");
const { emit } = await import("../src/core/events.ts");
const { beginTurn, endTurn } = await import("../src/server/turn-liveness.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

async function startFrom(body: unknown): Promise<string> {
	const res = await createChatRoute(new Request("http://test/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
	assert.equal(res.status, 200);
	return ((await res.json()) as { id: string }).id;
}

/** The engine processes a brief runs: its course's `resume`, the listing,
 *  and every course's `map` and `plan`. */
async function engineCalls(read: () => Promise<unknown>): Promise<string[]> {
	const before = engine.calls().length;
	await read();
	return engine.calls().slice(before).map((c) => c.args.filter((a) => !a.startsWith("/") && a !== "--workspace").join(" "));
}

describe("the brief's engine reads", () => {
	it("are made once, and kept for the next turn while no course changed", async () => {
		const chat = await startFrom({ title: "Poisson distribution", course: { workspace: PROB }, topics: ["poisson"] });
		const brief = () => fetchCourseBrief(chatStore.getChat(chat)!);
		const first = await engineCalls(brief);
		assert.ok(first.includes("resume") && first.filter((c) => c.startsWith("map")).length === 2, `the first brief reads the engine: ${first.join(", ")}`);
		assert.deepEqual(await engineCalls(brief), [], "the next turn's brief runs no engine process");
		assert.equal((await brief())?.text, (await brief())?.text);
	});

	it("are read again after any course's record changed, the other course's included", async () => {
		const chat = await startFrom({ title: "Binomial distribution", course: { workspace: PROB }, topics: ["binomial"] });
		const brief = () => fetchCourseBrief(chatStore.getChat(chat)!);
		await brief();
		emit("course-changed", { workspace: LA });
		await courseBriefReadsSettled();
		assert.deepEqual(await engineCalls(brief), [], "a write with no turn running is read again ahead, so the brief finds it ready");
		const again = await engineCalls(async () => {
			emit("course-changed", { workspace: PROB });
			await courseBriefReadsSettled();
		});
		assert.ok(again.includes("resume") && again.some((c) => c.startsWith("plan")), `read again: ${again.join(", ")}`);
	});

	it("are read again on a new study day", async () => {
		const chat = await startFrom({ title: "Expectation", course: { workspace: PROB }, topics: ["expectation"] });
		const brief = () => fetchCourseBrief(chatStore.getChat(chat)!);
		await brief();
		process.env.LEARNING_TODAY = "2026-11-09";
		try {
			assert.ok((await engineCalls(brief)).includes("resume"), "the day turned");
		} finally {
			process.env.LEARNING_TODAY = "2026-11-08";
		}
	});

	it("are made ahead as a turn settles, so his next input waits on none", async () => {
		const chat = await startFrom({ title: "Variance", course: { workspace: PROB }, topics: ["variance"] });
		const brief = () => fetchCourseBrief(chatStore.getChat(chat)!);
		await brief();
		const ahead = await engineCalls(async () => {
			emit("turn-started", { chatId: chat });
			emit("turn-settled", { chatId: chat });
			await courseBriefReadsSettled();
		});
		assert.deepEqual(ahead, [], "nothing changed, so nothing is read");
		assert.ok(beginTurn(chat));
		const during = await engineCalls(async () => {
			emit("course-changed", { workspace: PROB });
			await courseBriefReadsSettled();
		});
		assert.deepEqual(during, [], "a save mid-turn reads nothing yet: the turn may save again");
		const settled = await engineCalls(async () => {
			endTurn(chat);
			emit("turn-settled", { chatId: chat });
			await courseBriefReadsSettled();
		});
		assert.ok(settled.includes("resume"), "the turn's save is read again as it settles");
		assert.deepEqual(await engineCalls(brief), [], "and his next input's brief runs no engine process");
	});
});
