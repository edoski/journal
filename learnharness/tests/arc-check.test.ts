/**
 * An arc's check, started from Check it on the course page: the session it
 * creates is practice on the arc's live topics and carries the arc, the
 * chats route keeps the arc on the record, and the course brief of that
 * session then carries the arc's check from the engine's `arcs_ready`. A
 * session started any other way, or on an arc no longer ready, carries no
 * check. The engine is the fake CLI; the data dir is temporary.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-arc-check-")));
const LINALG = path.join(TMP, "study", "linalg");
fs.mkdirSync(LINALG, { recursive: true });
useFakeEngine(TMP, [{ workspace: LINALG, title: "Linear Algebra" }]);
process.env.LH_DATA_DIR = path.join(TMP, "data");

const { POST: createChatRoute } = await import("../app/api/chats/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { fetchCourseBrief } = await import("../src/server/course-brief.ts");
const { projectCourseBrief } = await import("../src/core/course-brief.ts");
const { arcCheckCreation } = await import("../components/unit-inbox/start-unit.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));
afterEach(() => delete process.env.FAKE_ENGINE_RESUME);

const READY = {
	arc: "spaces",
	title: "Vector spaces",
	question: "What can combinations of vectors reach?",
	topics: ["vectors", "span", "independence"],
	pairs: [["span", "independence"]],
};
const RESUME = { today: "2026-11-08", due: [], task: null, arcs_ready: [READY] };
const SPACES = { handle: "spaces", title: "Vector spaces" };

async function startFrom(body: unknown): Promise<string> {
	const res = await createChatRoute(new Request("http://test/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
	assert.equal(res.status, 200);
	return ((await res.json()) as { id: string }).id;
}

describe("a session started from Check it", () => {
	it("is practice on the arc's live topics, opened on the arc's name, and carries the arc", () => {
		assert.deepEqual(arcCheckCreation(LINALG, SPACES, ["vectors", "span", "independence"]), {
			title: "Vector spaces check",
			kind: "practice",
			course: { workspace: LINALG },
			topics: ["vectors", "span", "independence"],
			arcCheck: "spaces",
		});
	});

	it("keeps the arc on its record, and its brief carries the arc's check from arcs_ready", async () => {
		process.env.FAKE_ENGINE_RESUME = JSON.stringify(RESUME);
		const id = await startFrom(arcCheckCreation(LINALG, SPACES, READY.topics));
		const record = chatStore.getChat(id)!;
		assert.equal(record.arcCheck, "spaces");
		assert.deepEqual(record.topics, READY.topics);
		const brief = await fetchCourseBrief(record);
		assert.ok(brief, "the session has a brief");
		assert.match(brief.text, /^Arc check: he pressed Check it on Vector spaces \(spaces\)/m);
		assert.match(brief.text, /^ {2}question: What can combinations of vectors reach\?$/m);
		assert.match(brief.text, /^ {2}one unaided item per topic, in mixed order: vectors, span, independence$/m);
		assert.match(brief.text, /^ {2}one choose-the-method item per pair: span or independence$/m);
		assert.match(brief.text, /checkpoint "spaces"/);
	});

	it("gives a session started another way no check, though an arc is ready", async () => {
		process.env.FAKE_ENGINE_RESUME = JSON.stringify(RESUME);
		const id = await startFrom({ title: "Span", course: { workspace: LINALG }, topics: ["span"] });
		const record = chatStore.getChat(id)!;
		assert.equal(record.arcCheck, undefined);
		assert.doesNotMatch((await fetchCourseBrief(record))!.text, /Arc check/);
	});
});

describe("the check block", () => {
	it("says nothing once the arc is no longer ready, and re-sends the brief when it goes", () => {
		const shown = projectCourseBrief(RESUME, "practice", { arcCheck: "spaces" });
		const gone = projectCourseBrief({ ...RESUME, arcs_ready: undefined }, "practice", { arcCheck: "spaces" });
		assert.doesNotMatch(gone.text, /Arc check/);
		assert.notEqual(shown.key, gone.key);
	});

	it("leaves out the pairs line for an arc with no competing methods", () => {
		const { text } = projectCourseBrief({ ...RESUME, arcs_ready: [{ ...READY, pairs: [] }] }, "teach", { arcCheck: "spaces" });
		assert.match(text, /Arc check/);
		assert.doesNotMatch(text, /choose-the-method/);
	});
});
