/**
 * The topic page's read: the engine's `show` parsed into attempts and task
 * days, a stored session's plan, and GET /api/topic through the real route
 * and server seam against the fake engine CLI. The show outputs and the
 * session records are the seeded demo's own (fixtures/topic).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { ChatRecord } from "../src/core/contracts/chat.ts";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "topic");
const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8"));
const SHOW_RANK = fixture("show.rank+task.json");
const SHOW_MANY = fixture("show.many.json");
const chatFixture = (id: string) => fixture(`${id}.json`) as ChatRecord;

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-topic-read-")));
const LINALG = path.join(TMP, "study", "linalg");
const PROBABILITY = path.join(TMP, "study", "probability");
const engineFake = useFakeEngine(TMP, [
	{ workspace: LINALG, title: "Linear Algebra" },
	{ workspace: PROBABILITY, title: "Probability" },
]);
process.env.LH_DATA_DIR = path.join(TMP, "data");

const { topicRecordOf, sessionPlanOf } = await import("../src/server/topic.ts");
const { GET } = await import("../app/api/topic/route.ts");

/** A seeded session stored under this run's data folder, in a course. */
function store(id: string, workspace: string, as = id) {
	const chats = path.join(TMP, "data", "chats");
	fs.mkdirSync(chats, { recursive: true });
	fs.writeFileSync(path.join(chats, `${as}.json`), JSON.stringify({ ...chatFixture(id), id: as, course: { workspace, title: "A course" } }));
}
store("chat_demo_eigen", LINALG);
store("chat_demo_rank", LINALG);
store("chat_demo_det", PROBABILITY, "chat_elsewhere");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));
afterEach(() => {
	delete process.env.FAKE_ENGINE_FAIL;
	delete process.env.FAKE_ENGINE_SHOW;
});

describe("the engine's show as the topic's record", () => {
	it("gives the scored attempts newest first, each with whether it was unaided", () => {
		const rank = topicRecordOf(SHOW_RANK, "rank", ["sheet-4"])!;
		assert.deepEqual(
			rank.attempts.map((a) => [a.id, a.date, a.result, a.unaided, a.sure]),
			[
				["o15", "2026-11-03", "partial", false, null],
				["o12", "2026-10-30", "incorrect", true, "neutral"],
			],
		);
		assert.equal(rank.attempts[0]!.text, "Row-reduced a 3x3 matrix and counted pivots, slipping once on a sign");
		assert.equal(rank.attempts[0]!.recorded, "2026-11-03T18:45:48.056175+00:00");
		assert.deepEqual(
			topicRecordOf(SHOW_MANY, "matmul", [])!.attempts.map((a) => [a.id, a.result]),
			[
				["o17", "incorrect"],
				["o13", "correct"],
				["o10", "correct"],
			],
		);
	});

	it("says when each open task asked for was last touched, and leaves out a key that is not a task", () => {
		assert.deepEqual(topicRecordOf(SHOW_RANK, "rank", ["sheet-4", "rank", "sheet-9"])!.tasks, [{ key: "sheet-4", updated: "2026-11-06" }]);
		assert.deepEqual(topicRecordOf(SHOW_RANK, "rank", [])!.tasks, []);
	});

	it("names where the topic is in his material: each source's title and the place in it, in the record's order", () => {
		const show = {
			items: { poisson: { kind: "topic", title: "Poisson distribution", observations: [], refs: [{ source: "bh", locator: "Section 4.7" }, { source: "notes" }, { source: "gone", locator: "p. 3" }] } },
			sources: { bh: { path: "material/bh.md", title: "Blitzstein and Hwang" }, notes: { path: "notes.md" } },
		};
		assert.deepEqual(topicRecordOf(show, "poisson", [])!.refs, [
			{ source: "Blitzstein and Hwang", locator: "Section 4.7" },
			{ source: "notes", locator: null },
		]);
		assert.deepEqual(topicRecordOf(SHOW_MANY, "matmul", [])!.refs, [], "a topic its record points nowhere for");
	});

	it("names the method he reached for in the topic's place", () => {
		const [last] = topicRecordOf(SHOW_MANY, "elimination", [])!.attempts;
		assert.equal(last!.chose, "cramer");
		assert.equal(topicRecordOf(SHOW_MANY, "matmul", [])!.attempts[0]!.chose, null);
	});

	it("has no attempts for a topic taught and not tried", () => {
		assert.deepEqual(topicRecordOf(SHOW_MANY, "cramer", [])!.attempts, []);
		assert.deepEqual(topicRecordOf(SHOW_MANY, "invertibility", [])!.attempts, []);
	});

	it("drops a self-report and an attempt a later one corrects, counts an exam as unaided, and reads an unknown sureness as none", () => {
		const show = {
			items: { rank: { kind: "topic", observations: ["o6", "o5", "o4", "o3", "o2", "o1"] } },
			evidence: {
				o6: { kind: "self_report", text: "Says rank feels easy now", date: "2026-11-06" },
				o5: { kind: "attempt", text: "Counted pivots of a 3x4 matrix", help: "none", result: "correct", corrects: ["o4"], date: "2026-11-05" },
				o4: { kind: "attempt", text: "Counted pivots of a 3x4 matrix", help: "none", result: "incorrect", date: "2026-11-05" },
				o3: { kind: "exam", text: "Midterm question 2", result: "partial", sure: "certain", date: "2026-11-01" },
				o2: { kind: "attempt", text: "No result recorded", help: "none", date: "2026-10-30" },
			},
		};
		const { attempts } = topicRecordOf(show, "rank", [])!;
		assert.deepEqual(
			attempts.map((a) => a.id),
			["o5", "o3"],
			"o6 is his own statement, o4 was corrected by o5, o2 has no result, o1 is past the engine's limit",
		);
		assert.deepEqual([attempts[1]!.unaided, attempts[1]!.sure, attempts[1]!.recorded], [true, null, null]);
	});

	it("is null for a handle that is not a topic, and for anything that is not a show answer", () => {
		assert.equal(topicRecordOf(SHOW_RANK, "sheet-4", []), null);
		assert.equal(topicRecordOf(SHOW_RANK, "eigen", []), null);
		for (const garbage of [null, "not json", [], { items: ["rank"] }, { items: { rank: "topic" } }]) {
			assert.equal(topicRecordOf(garbage, "rank", []), null);
		}
	});
});

describe("a stored session's plan", () => {
	it("is the tree its tutor authored with the step the newest tagged question is about and the steps earlier ones were", () => {
		const eigen = sessionPlanOf(chatFixture("chat_demo_eigen"))!;
		assert.equal(eigen.id, "chat_demo_eigen");
		assert.equal(eigen.tree.nodes.length, 7);
		assert.equal(eigen.tree.edges.length, 7);
		assert.deepEqual(eigen.tree.nodes.find((n) => n.id === "compute"), { id: "compute", title: "Computing a 2×2 spectrum" });
		assert.equal(eigen.current, "compute");
		assert.deepEqual(eigen.visited, ["equation"]);
	});

	it("puts a lesson that tagged one question on that step with none before it", () => {
		const det = sessionPlanOf(chatFixture("chat_demo_det"))!;
		assert.equal(det.tree.nodes.length, 4);
		assert.equal(det.current, "product");
		assert.deepEqual(det.visited, []);
	});

	it("is null for a session whose tutor planned nothing", () => {
		assert.equal(sessionPlanOf(chatFixture("chat_demo_rank")), null);
		assert.equal(sessionPlanOf({ ...chatFixture("chat_demo_det"), tree: { nodes: [], edges: [], version: 1 } }), null);
	});
});

describe("GET /api/topic", () => {
	const get = (workspace: string, topic: string, tasks: string[] = [], sessions: string[] = []) => {
		const query = new URLSearchParams({ workspace, topic });
		for (const task of tasks) query.append("task", task);
		for (const session of sessions) query.append("session", session);
		return GET(new Request(`http://localhost/api/topic?${query}`));
	};

	it("answers the topic's record from the engine's show, and the plans of its sessions that have one", async () => {
		process.env.FAKE_ENGINE_SHOW = JSON.stringify(SHOW_RANK);
		const response = await get(LINALG, "rank", ["sheet-4"], ["chat_demo_eigen", "chat_demo_rank"]);
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.equal(body.ok, true);
		assert.deepEqual(body.record.attempts.map((a: { id: string }) => a.id), ["o15", "o12"]);
		assert.deepEqual(body.record.tasks, [{ key: "sheet-4", updated: "2026-11-06" }]);
		assert.deepEqual(body.plans.map((p: { id: string; current: string }) => [p.id, p.current]), [["chat_demo_eigen", "compute"]]);
		assert.deepEqual(engineFake.calls().at(-1)!.args, ["--workspace", LINALG, "show", "--", "rank", "sheet-4"]);
	});

	it("sends nothing of a transcript but the plan", async () => {
		const body = await (await get(LINALG, "eigen", [], ["chat_demo_eigen"])).json();
		assert.deepEqual(Object.keys(body.plans[0]).sort(), ["current", "id", "tree", "visited"]);
		assert.deepEqual(Object.keys(body.plans[0].tree).sort(), ["edges", "nodes"]);
	});

	it("leaves out a session of another course, and one that does not exist", async () => {
		const body = await (await get(LINALG, "rank", [], ["chat_elsewhere", "chat_missing", "chat_demo_eigen"])).json();
		assert.deepEqual(body.plans.map((p: { id: string }) => p.id), ["chat_demo_eigen"]);
	});

	it("still answers the plans when the engine fails, with no record", async () => {
		process.env.FAKE_ENGINE_FAIL = "show";
		const response = await get(LINALG, "rank", [], ["chat_demo_eigen"]);
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.equal(body.record, null);
		assert.equal(body.plans.length, 1);
	});

	it("answers no record when the engine's show does not hold the topic", async () => {
		const body = await (await get(LINALG, "rank")).json();
		assert.deepEqual([body.ok, body.record, body.plans], [true, null, []]);
	});

	it("refuses a folder the engine does not list, without reading it", async () => {
		const before = engineFake.calls().length;
		const response = await get(path.join(TMP, "elsewhere"), "rank", [], ["chat_demo_eigen"]);
		assert.equal(response.status, 404);
		assert.equal((await response.json()).code, "unknown_course");
		assert.ok(
			engineFake.calls().slice(before).every((c) => c.args[0] === "plan"),
			"only the listing ran",
		);
	});

	it("refuses a request with no topic, a session id that is not one, or more than 20 sessions", async () => {
		const before = engineFake.calls().length;
		for (const response of [
			await get(LINALG, ""),
			await get(LINALG, "rank", [], ["../settings"]),
			await get(LINALG, "rank", [], Array.from({ length: 21 }, (_, i) => `chat_${i}`)),
		]) {
			assert.equal(response.status, 400);
			assert.equal((await response.json()).code, "bad_request");
		}
		assert.equal(engineFake.calls().length, before, "nothing was read");
		assert.equal((await get(LINALG, "rank", [], Array.from({ length: 20 }, (_, i) => `chat_${i}`))).status, 200);
	});
});
