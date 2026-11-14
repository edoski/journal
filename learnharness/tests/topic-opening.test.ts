/**
 * A session opened on a topic (its page's Start, Review or Continue, Home's
 * review) tells the tutor so: its course brief names the topic, and every
 * agent's course doctrine says what that line means, so the topic's title
 * the app posted as his first message is read as a lesson on it, never as
 * a focused question or a topic to put off (round 5, 14 Nov 2026). A
 * session the tutor named, or an arc's check, names no topic it was
 * opened on. The engine is the fake CLI; the data dir is temporary.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-topic-opening-")));
const PROB = path.join(TMP, "study", "prob");
fs.mkdirSync(PROB, { recursive: true });
useFakeEngine(TMP, [{ workspace: PROB, title: "Probability" }]);
process.env.LH_DATA_DIR = path.join(TMP, "data");
process.env.FAKE_ENGINE_RESUME = JSON.stringify({ today: "2026-11-08", due: [], task: null });

const { POST: createChatRoute } = await import("../app/api/chats/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { fetchCourseBrief } = await import("../src/server/course-brief.ts");
const { courseRecordPrompt } = await import("../src/agent/prompt-segments.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

async function startFrom(body: unknown): Promise<string> {
	const res = await createChatRoute(new Request("http://test/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
	assert.equal(res.status, 200);
	return ((await res.json()) as { id: string }).id;
}

describe("a session opened on a topic", () => {
	it("names the topic in its course brief", async () => {
		const id = await startFrom({ title: "Poisson distribution", course: { workspace: PROB }, topics: ["poisson"] });
		const brief = await fetchCourseBrief(chatStore.getChat(id)!);
		assert.match(brief!.text, /^Opened on: poisson\b/m);
	});

	it("names none when the tutor named the session after his own words", async () => {
		const id = await startFrom({ title: "what is a Poisson variable?", course: { workspace: PROB } });
		chatStore.nameSession(id, { title: "Poisson variables", topic: "poisson" });
		const record = chatStore.getChat(id)!;
		assert.deepEqual(record.topics, ["poisson"], "naming gives the session its topic");
		assert.doesNotMatch((await fetchCourseBrief(record))!.text, /Opened on/);
	});

	it("names none for an arc's check, which carries its own block", async () => {
		const id = await startFrom({ title: "Distributions check", kind: "practice", course: { workspace: PROB }, topics: ["binomial", "poisson"], arcCheck: "distributions" });
		assert.doesNotMatch((await fetchCourseBrief(chatStore.getChat(id)!))!.text, /Opened on/);
	});

	it("is a line every agent's course doctrine explains", () => {
		for (const agent of ["prober", "teacher", "practice"] as const) {
			assert.match(courseRecordPrompt(agent, { arcs: false }), /`Opened on`/, `${agent} is not told what the line means`);
		}
	});
});
