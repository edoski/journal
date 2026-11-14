/**
 * GOLDEN FIXTURES (owner ruling, 2026-10-10): real user data, verbatim,
 * read through the PRODUCTION read paths. tests/fixtures/golden-data/ is a
 * real data dir (see its README); this suite copies it to a temp dir, points
 * the stores at it via the LH_DATA_DIR seam (set BEFORE any config-loading
 * import — every app-module import is dynamic), and asserts:
 *
 *   1. every record parses and passes the contract folds the app itself
 *      runs (phases, pending questions/problems, plan tree, summaries);
 *   2. the model's face (sdkInputBlocks) reads each full record: every
 *      message is model output the session holds or becomes input blocks,
 *      and nothing throws;
 *   3. marker COVERAGE: every custom-marker kind of the current contract
 *      appears in real data here (a new marker without a fixture update
 *      fails this suite);
 *   4. reads are READ-ONLY: after everything above, the copy is
 *      byte-identical to the fixture source.
 *
 * THE FIXTURE LAW: an intentional format change updates the fixtures in the
 * same commit; an unintentional one fails here.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, "fixtures", "golden-data");

// ── the seam, BEFORE any config-loading import ──────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-golden-"));
fs.cpSync(GOLDEN, TMP, { recursive: true });
process.env.LH_DATA_DIR = TMP;

const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { settingsStore } = await import("../src/store/settings.ts");
const { sdkInputBlocks } = await import("../src/core/sdk-session.ts");
const { QUESTION_TOOLS } = await import("../src/core/pending.ts");
const { phaseAt3Lh } = await import("../src/core/phases.ts");
const { danglingQuestionOf, activeProblemOf, isUiOnlyMarker } = await import("../src/core/native-messages.ts");

const TEACH = "chat_mv27rrra_feff23b6";
const PRACTICE = "chat_mv293wv5_10656952";

function snapshotTree(dir: string): Map<string, Buffer> {
	const out = new Map<string, Buffer>();
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		const st = fs.statSync(p);
		if (st.isDirectory()) for (const [k, v] of snapshotTree(p)) out.set(`${name}/${k}`, v);
		else out.set(name, fs.readFileSync(p));
	}
	return out;
}
const BEFORE = snapshotTree(TMP);

test.after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
});

// ── chats: records, folds, and the wire ─────────────────────────────────────

test("chats: both fixture records parse through the production read path", () => {
	const list = chatStore.listChats();
	const ids = new Set(list.map((c) => c.id));
	assert.ok(ids.has(TEACH), "the teach master record lists");
	assert.ok(ids.has(PRACTICE), "the practice lifecycle record lists");

	for (const id of [TEACH, PRACTICE]) {
		const r = chatStore.getChat(id);
		assert.ok(r, `${id} reads`);
		assert.ok(Array.isArray(r!.messages) && r!.messages.length > 0);
		// the folds the app itself runs per render/turn:
		assert.equal(typeof phaseAt3Lh(r!.messages), "string", "the phase fold runs clean");
		assert.equal(danglingQuestionOf(r!.messages), null, "no dangling question tool call");
		activeProblemOf(r!.messages); // must not throw
	}
});

test("chats: every record message is model output the session holds or becomes input blocks", () => {
	for (const id of [TEACH, PRACTICE]) {
		const r = chatStore.getChat(id)!;
		const blocks = sdkInputBlocks(r.messages);
		assert.ok(blocks.length > 0, `${id} owes the model input when sent whole`);
		for (const b of blocks) {
			if (b.type === "text") assert.ok(b.text.length > 0, `no empty text block in ${id}`);
			else assert.ok(b.source.data.length > 0 && b.source.media_type.startsWith("image/"), `a well-formed image block in ${id}`);
		}
		for (const m of r.messages) {
			const own = sdkInputBlocks([m]);
			const input = m.role === "user"
				|| (m.role === "custom" && !isUiOnlyMarker(m) && m.customType !== "compaction" && Boolean((m as { content?: string }).content))
				|| (m.role === "toolResult" && (QUESTION_TOOLS as readonly string[]).includes(m.toolName));
			if (input) assert.ok(own.length > 0, `${m.role} ${m.id} in ${id} reaches the model`);
			else assert.equal(own.length, 0, `${m.role} ${m.id} in ${id} is held by the session, never re-sent`);
		}
	}
});

test("markers: the fixture pair covers EVERY custom-marker kind of the current contract", () => {
	// The coverage law: a new customType added to the contract without real
	// fixture data fails here — extend the fixtures in the same commit.
	const EXPECTED = [
		"graph-context",
		"probe-handoff",
		"subagent-steer",
		"subagent-abort",
		"plan-block",
		"practice-thinking",
		"practice-next",
		"problem-dismissed",
		"compaction",
	] as const;
	const seen = new Set<string>();
	for (const id of [TEACH, PRACTICE]) {
		for (const m of chatStore.getChat(id)!.messages) {
			if ((m as { role?: string }).role === "custom") seen.add((m as { customType: string }).customType);
		}
	}
	for (const kind of EXPECTED) assert.ok(seen.has(kind), `marker ${kind} appears in real fixture data`);
});

test("tools: the core tool surface appears in real fixture data", () => {
	// A living inventory, not an exhaustive pin: teach tools in the teach
	// record, practice tools in the practice record. New TOOLS don't fail
	// this (they fail their own suites) — the pinned CORE set must simply
	// stay representable in real records.
	const teachTools = new Set<string>();
	const practiceTools = new Set<string>();
	for (const m of chatStore.getChat(TEACH)!.messages) {
		for (const b of (m as { content?: Array<{ type?: string; name?: string }> }).content ?? []) {
			if (b.type === "toolCall" && b.name) teachTools.add(b.name);
		}
	}
	for (const m of chatStore.getChat(PRACTICE)!.messages) {
		for (const b of (m as { content?: Array<{ type?: string; name?: string }> }).content ?? []) {
			if (b.type === "toolCall" && b.name) practiceTools.add(b.name);
		}
	}
	for (const t of ["quiz", "ask_user_question", "plan_init", "probe_done", "recall", "explain", "research", "demo", "visual", "pdf"]) {
		assert.ok(teachTools.has(t), `teach tool ${t} exercised in the fixture record`);
	}
	for (const t of ["problem", "conclude"]) {
		assert.ok(practiceTools.has(t), `practice tool ${t} exercised in the fixture record`);
	}
});

// ── jobs + settings ─────────────────────────────────────────────────────────

test("jobs: the kind × status matrix parses through the job store", () => {
	const kinds = new Set<string>();
	const statuses = new Set<string>();
	for (const f of fs.readdirSync(path.join(GOLDEN, "jobs"))) {
		const id = f.replace(/\.json$/, "");
		const j = jobStore.getJob(id);
		assert.ok(j, `${id} reads through the job store`);
		assert.ok(["research", "demo", "visual", "pdf"].includes(j!.kind), `${id}: known kind`);
		assert.ok(["done", "error"].includes(j!.status), `${id}: terminal status`);
		kinds.add(j!.kind);
		statuses.add(j!.status);
	}
	assert.deepEqual([...kinds].sort(), ["demo", "pdf", "research", "visual"], "every job kind is fixture-d");
	assert.deepEqual([...statuses].sort(), ["done", "error"], "both terminal statuses are fixture-d");
});

test("settings: the stamped record parses", () => {
	const s = settingsStore.readSettings();
	assert.ok(s, "settings record reads");
	assert.equal(s!.version, 1, "settings carry their version stamp");
	assert.equal("models" in s!, false, "the model slots from before one model ran everything are dropped on read");
});

// ── read-only: readers never write ──────────────────────────────────────────

test("read-only: after every read above, the data dir is byte-identical to the fixture source", () => {
	const after = snapshotTree(TMP);
	assert.deepEqual([...after.keys()].sort(), [...BEFORE.keys()].sort(), "no files added or removed");
	for (const [name, buf] of after) {
		assert.ok(BEFORE.has(name), `${name} existed before`);
		assert.deepEqual(buf, BEFORE.get(name), `${name} unchanged by reads`);
	}
});
