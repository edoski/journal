import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { ClaudeConnectionRow } from "../components/settings/claude-connection.tsx";
import type { ClaudeAccountStatus } from "../src/core/index.ts";

/** Round 12, 4 minor 6: Refresh in the sign-in dialog while still signed
 *  out left the dialog open, rightly, with focus on the page: the button
 *  he pressed was disabled for the check, and the browser drops focus from
 *  a disabled button. Focus comes back to Refresh once the check is done. */
const originalFetch = globalThis.fetch;
let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; globalThis.fetch = originalFetch; });

const signedOut: ClaudeAccountStatus = { account: { providerId: "claude-subscription", label: "Claude Code", email: null, auth: "default" }, connection: { state: "signed-out" }, usage: null, modelMissing: false };

test("a Refresh that leaves him signed out gives focus back to Refresh", async () => {
	let land!: () => void;
	const landed = new Promise<void>((done) => { land = done; });
	globalThis.fetch = async (input) => {
		const path = String(input);
		if (path === "/api/subscriptions/claude?refresh=1") await landed;
		if (path.startsWith("/api/subscriptions/claude")) return Response.json({ accounts: [signedOut] });
		if (path.startsWith("/api/models")) return Response.json({ account: "claude-subscription", connected: false, contextWindow: 1_000_000 });
		return new Response("not found", { status: 404 });
	};
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	await act(async () => root!.render(<ClaudeConnectionRow />));
	await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
	const refresh = document.querySelector<HTMLButtonElement>('[data-testid="claude-refresh"]')!;
	refresh.focus();
	await act(async () => { refresh.click(); await new Promise((r) => setTimeout(r, 0)); });
	assert.ok(refresh.disabled, "the check is running");
	refresh.blur(); // what the browser does to a focused button that becomes disabled
	await act(async () => { land(); await new Promise((r) => setTimeout(r, 0)); });
	assert.ok(!refresh.disabled);
	assert.ok(document.activeElement === refresh, "focus is back on Refresh");
});
