/**
 * Every agent runs Claude Opus 5.5 at high effort (owner, 2026-11-14),
 * whatever the settings file says: none at all, or one saved when Lessons,
 * Helpers and Pictures each had their own model and the background roles
 * their own pins. Pinned where the agents get their engines: the
 * conversation (prober, teacher, practice) through a real turn, the
 * background roles (research, demos, figures, PDFs, extraction) through
 * the job runner's and extraction pipeline's seam, and the `claude`
 * command line a call actually spawns.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, normalizeContext } from "@earendil-works/pi-ai";
import { SETTINGS_FILE } from "../config.ts";
import { agentEngine, handleChatRequest } from "../src/server/chat-handler.ts";
import { createTeacherAgent } from "../src/agent/teacher-agent.ts";
import type { PiEngine } from "../src/agent/models.ts";
import { PUT as putSection } from "../app/api/settings/[section]/route.ts";
import { effectiveSettings, stores } from "../src/server/stores.ts";
import { runningTurn } from "../src/server/turn-runs.ts";
import { signInTestClaude } from "./claude-fixture.ts";

const SLOT_DAYS_RECORD = {
	version: 1,
	agent: {
		models: {
			researcher: { model: { provider: "chatgpt", id: "gpt-5" }, thinkingLevel: "minimal" },
			extractor: { model: { provider: "claude-subscription", id: "claude-haiku-5-5" }, thinkingLevel: "low" },
		},
		tools: { demo: false },
	},
	models: {
		strong: { model: { provider: "chatgpt", id: "gpt-5" }, thinkingLevel: "low" },
		cheap: { model: { provider: "claude-subscription", id: "claude-haiku-5-5" }, thinkingLevel: "minimal" },
		vision: { model: { provider: "claude-subscription", id: "claude-sonnet-5-5" }, thinkingLevel: "max" },
	},
};

const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-fake-claude-"));
const argsFile = path.join(fakeDir, "args.txt");
const originalPath = process.env.PATH;

before(async () => {
	await signInTestClaude();
	fs.writeFileSync(path.join(fakeDir, "claude"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${argsFile}"\n`, { mode: 0o755 });
	process.env.PATH = `${fakeDir}${path.delimiter}${originalPath ?? ""}`;
});
after(() => {
	process.env.PATH = originalPath;
	fs.rmSync(fakeDir, { recursive: true, force: true });
	fs.rmSync(SETTINGS_FILE, { force: true });
});
beforeEach(() => fs.rmSync(SETTINGS_FILE, { force: true }));

function writeRecord(record: unknown): void {
	fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
	fs.writeFileSync(SETTINGS_FILE, JSON.stringify(record));
}

/** The engine one real turn hands the conversation agent. */
async function conversationEngine(): Promise<PiEngine> {
	const chat = stores.chatStore.createChat("Test: which engine");
	const faux = createFauxCore({});
	faux.setResponses([fauxAssistantMessage("Hello.")]);
	let handed: PiEngine | undefined;
	const res = await handleChatRequest(
		new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "teach me" } }) }),
		(opts) => {
			handed = opts.engine;
			return createTeacherAgent(undefined, { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, messages: opts.messages });
		},
	);
	assert.equal(res.status, 200);
	const handle = runningTurn(chat.id);
	if (handle) await new Response(handle.subscribe()).text();
	assert.ok(handed, "the turn built its agent");
	return handed;
}

/** The arguments one real call on this engine hands `claude`. */
async function spawnedArgs(engine: PiEngine): Promise<string[]> {
	fs.rmSync(argsFile, { force: true });
	const stream = engine.streamFn(engine.model, normalizeContext({ systemPrompt: "Reply.", messages: [{ role: "user", content: "hi", timestamp: 1 }] }), {});
	await stream.result();
	return fs.readFileSync(argsFile, "utf8").trim().split("\n");
}

async function assertOpusHigh(engine: PiEngine, who: string): Promise<void> {
	assert.equal(engine.model.id, "claude-opus-5-5", who);
	assert.equal(engine.model.provider, "claude-subscription", who);
	assert.equal(engine.level, "high", who);
	const args = await spawnedArgs(engine);
	assert.equal(args[args.indexOf("--model") + 1], "claude-opus-5-5", `${who} spawns Opus 5.5`);
	assert.equal(args[args.indexOf("--effort") + 1], "high", `${who} spawns high effort`);
}

describe("every agent runs Claude Opus 5.5 at high effort", () => {
	it("with no settings file", async () => {
		await assertOpusHigh(await conversationEngine(), "the conversation");
		await assertOpusHigh(agentEngine(), "the background roles");
	});

	it("with a settings file saved when Lessons, Helpers and Pictures had their own models", async () => {
		writeRecord(SLOT_DAYS_RECORD);
		await assertOpusHigh(await conversationEngine(), "the conversation");
		await assertOpusHigh(agentEngine(), "the background roles");
	});
});

describe("PUT /api/settings/claude", () => {
	const put = (body: unknown) => putSection(
		new Request("http://test/api/settings/claude", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
		{ params: Promise.resolve({ section: "claude" }) },
	);

	it("switches every agent to a Claude account T3 Code has, and flushes the old slots from the file", async () => {
		writeRecord(SLOT_DAYS_RECORD);
		const res = await put({ account: "claude-subscription" });
		assert.equal(res.status, 200);
		const written = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
		assert.deepEqual(written.claude, { account: "claude-subscription" });
		assert.equal("models" in written, false, "the slots are gone from disk");
		assert.equal("agent" in written, false, "the role pins and tool switches are gone from disk");
		assert.equal(effectiveSettings().claude.account, "claude-subscription");
	});

	it("refuses an account T3 Code does not have, and anything that is not a Claude account", async () => {
		assert.equal((await put({ account: "claude-subscription-gone" })).status, 400);
		assert.equal((await put({ account: "chatgpt" })).status, 400);
		assert.equal(fs.existsSync(SETTINGS_FILE), false, "a refused write writes nothing");
	});
});

describe("the connection gate", () => {
	it("a turn on a Claude account that is not signed in refuses with 503 before anything runs", async () => {
		writeRecord({ version: 1, claude: { account: "claude-subscription-elsewhere" } });
		const chat = stores.chatStore.createChat("Test: signed-out account");
		const res = await handleChatRequest(
			new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "teach me" } }) }),
			() => { throw new Error("must not build an agent"); },
		);
		assert.equal(res.status, 503);
		const body = (await res.json()) as { code: string; provider: string };
		assert.deepEqual([body.code, body.provider], ["provider_key_missing", "claude-subscription-elsewhere"]);
		assert.equal(stores.chatStore.getChat(chat.id)!.messages.length, 0, "nothing durable from a refused turn");
	});
});
