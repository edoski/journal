/**
 * A session the app opens with a long question carries a short name of its
 * own (round 11, 1 N14, shot 65): the course head's Ask the tutor named its
 * session after its opening words, so the breadcrumb read "My exam plan
 * has no room for Geometric distribution, Expectation and…".
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-session-name-"));
process.env.LH_DATA_DIR = TMP_DATA;
const WS = "/study/prob";
useFakeEngine(TMP_DATA, [{ workspace: WS, title: "Probability" }]);

const { POST } = await import("../app/api/chats/route.ts");
const { examGapAskCreation } = await import("../components/unit-inbox/start-unit.ts");

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

describe("a session's own name (1 N14)", () => {
	it("Ask the tutor about the exam opens with his question and names the session plainly", async () => {
		const creation = examGapAskCreation(WS, ["Geometric distribution", "Expectation and linearity"]);
		assert.match(creation.title, /^My exam plan has no room for Geometric distribution and Expectation and linearity\./, "the opening stays his question");
		const res = await POST(new Request("http://test/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creation) }));
		const { title } = (await res.json()) as { title: string };
		assert.equal(title, "Fitting the exam's topics in");
	});
});
