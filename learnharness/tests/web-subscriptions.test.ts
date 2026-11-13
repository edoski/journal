import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lh-web-sub-"));
process.env.LH_CREDENTIALS_DIR = directory;
process.env.LH_DATA_DIR = path.join(directory, "data");
delete process.env.LH_DESKTOP_SERVER; delete process.env.LH_DESKTOP_API_SECRET;
const require = createRequire(import.meta.url);
const { SCOPES } = require("../electron/chatgpt.cjs");
const { createWebSubscriptionOwner, webSubscriptionOwner, webSubscriptionsEnabled } = await import("../src/server/web-subscriptions.ts");
const { subscriptionControlsResponse, subscriptionBrowserResponse } = await import("../src/server/web-subscription-http.ts");
const chat = await import("../src/agent/chatgpt-bridge.ts");
const { piModels } = await import("../src/agent/models.ts");
const { refreshConnectionCatalog } = await import("../src/server/model-catalog.ts");
const model = piModels().getModels("openai").find((entry) => entry.api === "openai-responses")!;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
	assert.equal(String(input), "https://api.openai.com/v1/models", "unexpected network request forbidden");
	return Response.json({ models: [{ slug: model.id, display_name: "Fixture ChatGPT", visibility: "list" }] });
};
await fs.writeFile(path.join(directory, "chatgpt-credentials.json"), JSON.stringify({ version: 1, hostId: "fixture-host", allowBackgroundUse: true, activeId: "fixture-account", registrations: [{ id: "fixture-account", clientId: "oaiapp_fixture", issuer: "https://auth.openai.com", subject: "fixture-subject", email: "fixture@example.invalid", tokens: { accessToken: "fixture-chatgpt-access", refreshToken: "fixture-chatgpt-refresh", idToken: "fixture-id-token", scopes: SCOPES, expiresAt: Date.now() + 3600000 } }] }), { mode: 0o600 });
function request(command?: Record<string, unknown>, origin = "http://192.168.1.10:3000") {
	return new Request(`${origin}/api/subscriptions`, { method: command ? "POST" : "GET", headers: { host: new URL(origin).host, origin, "sec-fetch-site": "same-origin", "x-learnharness-subscriptions": "1", "content-type": "application/json" }, ...(command ? { body: JSON.stringify(command) } : {}) });
}
after(async () => { webSubscriptionOwner().close(); globalThis.fetch = originalFetch; await fs.rm(directory, { recursive: true, force: true }); });

test("ordinary web restores configured sibling credentials, private runtime leases work for LAN-owned requests", async () => {
	await refreshConnectionCatalog();
	assert(chat.chatGPTConnected());
	assert.equal((await chat.chatGPTLease(chat.chatGPTScope(model.id), false)).accessToken, "fixture-chatgpt-access");
	const response = await subscriptionControlsResponse(request());
	assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
	const publicState = await response.text();
	for (const secret of ["fixture-chatgpt-access", "fixture-chatgpt-refresh", "fixture-id-token"]) assert(!publicState.includes(secret));
	assert(publicState.includes("fixture@example.invalid"));
});

test("web background OFF immediately aborts background streams, retains foreground and rejects private background leases", async () => {
	const foreground = chat.chatGPTAbortController(false), background = chat.chatGPTAbortController(true);
	try {
		assert.equal((await subscriptionControlsResponse(request({ providerId: "chatgpt", op: "consent", enabled: false }))).status, 200);
		assert(background.controller.signal.aborted); assert(!foreground.controller.signal.aborted);
		const scope = chat.chatGPTScope(model.id); await chat.chatGPTLease(scope, false); await assert.rejects(chat.chatGPTLease(scope, true));
	} finally { foreground.release(); background.release(); }
});

test("HTTP controls reject cross-origin, simple-form and private credential operations; desktop never falls back", async () => {
	const forged = request({ providerId: "chatgpt", op: "consent", enabled: true }); forged.headers.set("origin", "https://unrelated.invalid");
	assert.equal((await subscriptionControlsResponse(forged)).status, 403);
	const noHeader = request(); noHeader.headers.delete("x-learnharness-subscriptions");
	assert.equal((await subscriptionControlsResponse(noHeader)).status, 403);
	const noOrigin = request({ providerId: "chatgpt", op: "cancel" }); noOrigin.headers.delete("origin");
	assert.equal((await subscriptionControlsResponse(noOrigin)).status, 403);
	for (const op of ["lease", "models", "snapshot", "token", "openExternal"]) assert.equal((await subscriptionControlsResponse(request({ providerId: "chatgpt", op }))).status, 400);
	for (const providerId of ["github-copilot", "xai"]) assert.equal((await subscriptionControlsResponse(request({ providerId, op: "login" }))).status, 400);
	const huge = request({ providerId: "chatgpt", op: "cancel", padding: "x".repeat(16384) });
	assert.equal((await subscriptionControlsResponse(huge)).status, 413);
	const browser = new Request("http://localhost:3000/api/subscriptions/browser?id=00000000-0000-4000-8000-000000000001");
	assert.equal((await subscriptionBrowserResponse(browser)).status, 403);
	for (const [marker, secret] of [["1", undefined], [undefined, "fixture-capability"]]) {
		if (marker) process.env.LH_DESKTOP_SERVER = marker; else delete process.env.LH_DESKTOP_SERVER;
		if (secret) process.env.LH_DESKTOP_API_SECRET = secret; else delete process.env.LH_DESKTOP_API_SECRET;
		assert(!webSubscriptionsEnabled());
		assert.equal((await subscriptionControlsResponse(request())).status, 404);
		await assert.rejects(chat.chatGPTRequest("status"), /desktop app/);
	}
	delete process.env.LH_DESKTOP_SERVER; delete process.env.LH_DESKTOP_API_SECRET;
});

test("web ChatGPT login supplies only an opaque browser action; cancel/replacement invalidates earlier launch", async () => {
	const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "lh-web-chat-action-"));
	const owner = createWebSubscriptionOwner({ directory: scratch });
	try {
		const first = await owner.control({ op: "login" }, "http://localhost:3000");
		assert(first.browserAction); assert(!JSON.stringify(first).includes("auth.openai.com"));
		await owner.control({ op: "cancel" }, "http://localhost:3000");
		const second = await owner.control({ op: "login" }, "http://localhost:3000");
		assert(second.browserAction);
		const firstId = new URL(first.browserAction, "http://localhost:3000").searchParams.get("id")!;
		assert.equal(await owner.takeBrowserAction(firstId, "http://localhost:3000"), undefined);
		const secondId = new URL(second.browserAction, "http://localhost:3000").searchParams.get("id")!;
		assert.equal(await owner.takeBrowserAction(secondId, "http://other.invalid"), undefined);
		const target = new URL((await owner.takeBrowserAction(secondId, "http://localhost:3000"))!);
		assert.equal(target.origin, "https://auth.openai.com");
		const callback = new URL(target.searchParams.get("redirect_uri")!);
		assert.equal(callback.hostname, "127.0.0.1"); assert.equal(callback.pathname, "/auth/callback");
		assert(target.searchParams.has("state")); assert(target.searchParams.has("code_challenge"));
		assert.equal(await owner.takeBrowserAction(secondId, "http://localhost:3000"), undefined);
	} finally { owner.close(); await fs.rm(scratch, { recursive: true, force: true }); }
});
