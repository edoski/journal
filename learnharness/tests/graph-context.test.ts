/**
 * THE GRAPH-CONTEXT MARKER of older sessions: a session started from picks
 * on the retired knowledge map carries its context as a separate custom
 * message before the learner's first user message. Nothing writes it any
 * more, but those records still open: the model reads the marker's content
 * (sdkInputBlocks gives it as text in the turn's user message, like every
 * marker) and the transcript shows its collapsible GraphContextCard. A new
 * session never gets one, whatever the creation body carries.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

// ── the seam, BEFORE any config-loading import ──────────────────────────────
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-graph-context-"));
process.env.LH_DATA_DIR = TMP_DATA;
const COURSE = { workspace: "/study/course" };
useFakeEngine(TMP_DATA, [{ ...COURSE, title: "Course" }]);

const { sdkInputBlocks } = await import("../src/core/sdk-session.ts");
import type { LhMessage } from "../src/core/native-messages.ts";
const { projectView } = await import("../src/core/view.ts");
const { POST } = await import("../app/api/chats/route.ts");
const { initialPromptOwed } = await import("../components/chat.tsx");
const { chatStore } = await import("../src/store/chats.ts");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

const PICKS = [
	{ id: "n_a", name: "Modus ponens", statement: "If P implies Q and P holds, Q holds." },
	{ id: "n_b", name: "Soundness", statement: "A valid argument from true premises has a true conclusion." },
];

/** The marker as older records store it. */
const MARKER = {
	id: "msg_graph_context",
	role: "custom",
	customType: "graph-context",
	content: "[Session context] — picked from the learner's knowledge map when starting this session:\n\nPropositions (name: statement):\n- Modus ponens: If P implies Q and P holds, Q holds.",
	display: true,
	details: { propositions: PICKS, chains: [] },
	timestamp: 0,
} as unknown as LhMessage;

describe("an older session's graph-context marker", () => {
	it("sdkInputBlocks gives its content as a text block of the turn's user message (the model's face)", () => {
		const blocks = sdkInputBlocks([MARKER]);
		assert.equal(blocks.length, 1);
		assert.equal(blocks[0]!.type, "text");
		assert.ok((blocks[0] as { text: string }).text.includes("[Session context]"));
	});

	it("projectView: a user-side data part — never a text bubble", () => {
		const view = projectView([MARKER]);
		assert.equal(view.length, 1);
		assert.equal(view[0]!.role, "user");
		const part = view[0]!.parts[0] as { type: string; data: unknown };
		assert.equal(part.type, "data-graph-context");
		assert.deepEqual(part.data, { propositions: PICKS, chains: [] });
	});
});

// ── the first-send gate (the dead first turn, owner report 2026-10-04) ──────

describe("initialPromptOwed", () => {
	it("a marker-only record still owes the prompt — scaffolding is not conversation", () => {
		assert.equal(initialPromptOwed([MARKER as never], "drill me on logic"), true);
	});

	it("once a user or assistant message exists, the prompt is spent", () => {
		const user = { role: "user" } as never;
		assert.equal(initialPromptOwed([MARKER as never, user], "drill me"), false);
		assert.equal(initialPromptOwed([{ role: "assistant" } as never], "drill me"), false);
	});

	it("no prompt → nothing owed (the empty-draft case)", () => {
		assert.equal(initialPromptOwed([], undefined), false);
	});
});

describe("POST /api/chats", () => {
	it("writes no graph-context marker, even when the body still carries picks", async () => {
		const res = await POST(new Request("http://test/api/chats", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "drill me on logic", course: COURSE, graphContext: { propositions: PICKS } }),
		}));
		assert.equal(res.status, 200);
		const { id } = (await res.json()) as { id: string };
		assert.equal(chatStore.getChat(id)!.messages.length, 0);
	});
});
