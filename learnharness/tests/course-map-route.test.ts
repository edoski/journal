/**
 * GET /api/courses/map through the real route and server seam, against the
 * fake engine CLI: only a course the engine lists is read, and each engine
 * failure answers with its own code.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-map-")));
const LINALG = path.join(TMP, "study", "linalg");
fs.mkdirSync(LINALG, { recursive: true });
const engineFake = useFakeEngine(TMP, [{ workspace: LINALG, title: "Linear Algebra" }]);
process.env.LH_DATA_DIR = path.join(TMP, "data");

const { GET } = await import("../app/api/courses/map/route.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));
afterEach(() => {
	delete process.env.FAKE_ENGINE_FAIL;
	delete process.env.FAKE_ENGINE_MAP;
});

const get = (workspace: string) => GET(new Request(`http://localhost/api/courses/map?workspace=${encodeURIComponent(workspace)}`));

describe("GET /api/courses/map", () => {
	it("answers a listed course's map from the engine's map verb", async () => {
		process.env.FAKE_ENGINE_MAP = JSON.stringify({
			today: "2026-11-08",
			revision: 3,
			title: "Linear Algebra",
			current: "rank",
			topics: [
				{ topic: "basis", title: "Basis", needs: [], contrasts: [], level: "independent", weak: false, tasks: [] },
				{ topic: "rank", title: "Rank", needs: ["basis"], contrasts: [], level: "assisted", weak: true, tasks: [] },
			],
		});
		const response = await get(LINALG);
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.equal(body.ok, true);
		assert.equal(body.map.workspace, LINALG);
		assert.equal(body.map.current, "rank");
		assert.deepEqual(body.map.edges, [{ kind: "needs", prerequisite: "basis", topic: "rank" }]);
		assert.deepEqual(engineFake.calls().at(-1)!.args, ["--workspace", LINALG, "map"]);
	});

	it("refuses a folder the engine does not list, without reading it", async () => {
		const before = engineFake.calls().length;
		const response = await get(path.join(TMP, "elsewhere"));
		assert.equal(response.status, 404);
		assert.equal((await response.json()).code, "unknown_course");
		assert.ok(
			engineFake.calls().slice(before).every((c) => c.args[0] === "plan"),
			"only the listing ran",
		);
	});

	it("says when the engine fails or cannot run", async () => {
		process.env.FAKE_ENGINE_FAIL = "map";
		const failed = await get(LINALG);
		assert.equal(failed.status, 502);
		assert.equal((await failed.json()).code, "engine_failed");
		process.env.FAKE_ENGINE_FAIL = "plan";
		const unavailable = await get(LINALG);
		assert.equal(unavailable.status, 503);
		assert.equal((await unavailable.json()).code, "engine_unavailable");
	});
});
