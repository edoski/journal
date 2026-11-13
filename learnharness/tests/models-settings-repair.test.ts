import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import type { ModelsSettings, ModelSlotName } from "../src/core/settings.ts";
import type { Model } from "@earendil-works/pi-ai";
import type { LoadedClaudeAccount } from "../src/agent/claude-accounts.ts";

// Every app import follows isolation. No installed credentials, ambient keys,
// OAuth, or provider requests: ChatGPT state comes from synthetic IPC and
// Claude Code's sign-in from a fake `claude auth status`.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-models-repair-"));
process.env.LH_DATA_DIR = directory;
process.env.LH_CREDENTIALS_DIR = directory;
const originalSend = Object.getOwnPropertyDescriptor(process, "send");
const originalConnected = Object.getOwnPropertyDescriptor(process, "connected");
const marker = process.env.LH_DESKTOP_SERVER, secret = process.env.LH_DESKTOP_API_SECRET;
process.env.LH_DESKTOP_SERVER = "1";
process.env.LH_DESKTOP_API_SECRET = "d".repeat(64);
Object.defineProperty(process, "connected", { configurable: true, value: true });

const { piModels, piEngineForSpec } = await import("../src/agent/models.ts");
const { refreshChatGPTModels } = await import("../src/agent/chatgpt-bridge.ts");
const { refreshClaudeConnections } = await import("../src/agent/claude-connection.ts");
const { modelCatalog, validateModelsSettings } = await import("../src/server/model-catalog.ts");
const { readSettings: readSettingsRecord, writeSettings: writeSettingsRecord } = await import("../src/store/settings.ts");
const { PUT } = await import("../app/api/settings/[section]/route.ts");
const { clampThinkingLevel, normalizeContext } = await import("@earendil-works/pi-ai");
const responses = piModels().getModels("openai").filter((model): model is Model<"openai-responses"> => model.api === "openai-responses");
const native = responses[0]!;
const stale = { provider: "chatgpt", id: native.id };
const replacement = { provider: "claude-subscription", id: "claude-opus-5-5" };
const slots: ModelSlotName[] = ["strong", "cheap", "vision"];
const initial: ModelsSettings = Object.fromEntries(slots.map((slot) => [slot, { model: stale, thinkingLevel: "high" }]));
let connected = false, revision = 0, leases = 0;
function catalog() {
	const account = { id: "fixture-account", email: "fixture@example.invalid", registration: "fixture", connected: true, planEnabled: true };
	return {
		epoch: revision, authorityRevision: revision, revision,
		status: { available: true, pending: false, allowBackgroundUse: true, activeId: connected ? account.id : null, accounts: connected ? [account] : [], error: null },
		accountId: connected ? account.id : null, models: connected ? [{ id: native.id, name: "Fixture ChatGPT" }] : [],
	};
}
Object.defineProperty(process, "send", { configurable: true, value: (message: { id: string; op: string }, callback?: () => void) => {
	if (message.op !== "models") { leases++; throw new Error("No credential lease expected"); }
	queueMicrotask(() => (process.emit as (event: string, value: unknown) => boolean)("message", { channel: "lh:chatgpt", id: message.id, op: message.op, ok: true, value: catalog() }));
	callback?.(); return true;
} });
async function connection(value: boolean) { connected = value; revision++; await refreshChatGPTModels(responses); }
const claudeCode: LoadedClaudeAccount = { providerId: "claude-subscription", label: "Claude Code", email: null, auth: "default", instanceId: null };
await refreshClaudeConnections({ force: true, load: () => [claudeCode], binary: () => "/fake/claude", run: async () => ({ code: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" }), stderr: "" }) });
async function put(body: unknown) {
	return PUT(new Request("http://localhost/api/settings/models", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ section: "models" }) });
}
beforeEach(async () => {
	await connection(false);
	writeSettingsRecord({ version: 1, models: initial, general: { autoUpdate: false }, graph: { rendering: false } });
});
after(() => {
	if (originalSend) Object.defineProperty(process, "send", originalSend); else delete process.send;
	if (originalConnected) Object.defineProperty(process, "connected", originalConnected); else delete (process as { connected?: boolean }).connected;
	for (const [key, value] of [["LH_DESKTOP_SERVER", marker], ["LH_DESKTOP_API_SECRET", secret]]) {
		if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
	}
	fs.rmSync(directory, { recursive: true, force: true });
});

for (const slot of slots) test(`${slot} can be replaced while the other disconnected slots remain saved`, async () => {
	const response = await put({ ...initial, [slot]: { model: replacement, thinkingLevel: "minimal" } });
	assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
	const stored = readSettingsRecord()!;
	assert.deepEqual(stored.models?.[slot], { model: replacement, thinkingLevel: "low" }, "known metadata clamps on write");
	for (const other of slots.filter((name) => name !== slot)) assert.deepEqual(stored.models?.[other], initial[other]);
	assert.deepEqual(stored.general, { autoUpdate: false });
	assert.deepEqual(stored.graph, { rendering: false });
	assert.deepEqual((await response.json()).settings, stored);
	assert(!modelCatalog().models.some((model) => model.provider === stale.provider), "saving stale pins must not make them available choices");
});

test("all three slots can be repaired successively without reconnecting", async () => {
	for (const slot of slots) {
		const response = await put({ ...readSettingsRecord()!.models, [slot]: { model: replacement } });
		assert.equal(response.status, 200);
	}
	assert.deepEqual(readSettingsRecord()!.models, Object.fromEntries(slots.map((slot) => [slot, { model: replacement }])));
});

test("thinking preferences on unchanged disconnected models can be changed, removed, and restored", async () => {
	for (const thinkingLevel of ["max", undefined, "minimal"] as const) {
		const strong = { model: stale, ...(thinkingLevel ? { thinkingLevel } : {}) };
		const response = await put({ ...initial, strong });
		assert.equal(response.status, 200);
		assert.deepEqual(readSettingsRecord()!.models?.strong, strong);
	}
	await connection(true);
	const engine = piEngineForSpec({ ...stale, thinkingLevel: "minimal" }, false);
	assert.equal(engine.level, clampThinkingLevel(native, "minimal"), "reconnected runtime clamps the saved preference");
	assert.equal((await put(readSettingsRecord()!.models)).status, 200);
	assert.equal(readSettingsRecord()!.models?.strong?.thinkingLevel, engine.level, "known metadata still clamps on write");
});

test("introduced or replaced unknown models still reject, without writing any section", async () => {
	for (const model of [
		{ provider: stale.provider, id: "fixture-not-in-catalog" },
		{ provider: "github-copilot-subscription", id: stale.id },
		{ provider: "fixture-unknown-provider", id: stale.id },
		{ provider: replacement.provider, id: "fixture-not-in-catalog" },
	]) {
		const before = readSettingsRecord();
		assert.equal((await put({ ...initial, strong: { model } })).status, 400);
		assert.deepEqual(readSettingsRecord(), before);
	}
	writeSettingsRecord({ version: 1, models: { strong: initial.strong } });
	assert.equal((await put({ strong: initial.strong, cheap: initial.strong })).status, 400, "a pin saved in one slot cannot authorize another slot");
	assert.equal((await put(initial)).status, 400, "missing slots cannot introduce disconnected models");
});

test("a first models write cannot introduce disconnected selections", async () => {
	fs.unlinkSync(path.join(directory, "settings.json"));
	assert.equal((await put(initial)).status, 400);
	assert.equal(readSettingsRecord(), null);
});

test("a replaced stale selection cannot be reintroduced without availability", async () => {
	assert.equal((await put({ ...initial, strong: { model: replacement } })).status, 200);
	assert.equal((await put(initial)).status, 400);
	assert.deepEqual(readSettingsRecord()!.models?.strong?.model, replacement);
});

test("slot removal still replaces the whole section, including clearing all slots", async () => {
	assert.equal((await put({ cheap: initial.cheap })).status, 200);
	assert.deepEqual(readSettingsRecord()!.models, { cheap: initial.cheap });
	assert.equal((await put({})).status, 200);
	assert.deepEqual(readSettingsRecord()!.models, {});
});

test("unchanged model identity does not bypass body shape validation", async () => {
	for (const body of [
		{ ...initial, strong: { model: stale, thinkingLevel: 7 } },
		{ ...initial, strong: { thinkingLevel: "high" } },
		{ ...initial, strong: { model: { provider: stale.provider } } },
	]) assert.equal((await put(body)).status, 400);
	assert.deepEqual(readSettingsRecord()!.models, initial);
});

test("standalone catalog validation stays strict without a stored section", () => {
	assert.equal(validateModelsSettings(initial).ok, false);
	assert.equal(validateModelsSettings({ strong: { model: replacement } }).ok, true);
});

test("retained selections remain unavailable at runtime, with no API-key fallback or credential lease", async () => {
	await connection(true);
	const engine = piEngineForSpec(stale, false);
	await connection(false);
	assert.equal((await put({ ...initial, cheap: { model: replacement } })).status, 200);
	assert.throws(() => piEngineForSpec(stale, false), /catalog has no model/);
	let requests = 0;
	const before = leases;
	const key = process.env.OPENAI_API_KEY;
	process.env.OPENAI_API_KEY = "fixture-must-not-be-used";
	try {
		const result = await engine.streamFn(engine.model, normalizeContext({ messages: [] }), { fetch: async () => { requests++; throw new Error("Must not dispatch"); } }).result();
		assert.equal(result.stopReason, "error");
		assert.match(result.errorMessage ?? "", /No API-key fallback was used/);
		assert.equal(requests, 0);
		assert.equal(leases, before);
	} finally {
		if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
	}
});
