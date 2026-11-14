import React from "react";
(globalThis as Record<string, unknown>).React = React;
import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsDialogBody } from "../components/settings/settings-dialog.tsx";

Object.assign(globalThis, { localStorage: { getItem: () => null, setItem() {} } });

test("Accounts is the first/default page; General is last and other pages keep relative order", () => {
	const html = renderToStaticMarkup(<SettingsDialogBody onClose={() => {}} />);
	const ids = [...html.matchAll(/data-testid="settings-nav-([^"]+)"/g)].map((m) => m[1]);
	assert.deepEqual(ids, ["keys", "agent", "appearance", "keyboard", "general"]);
	assert.match(html, /settings-nav-keys[^>]*aria-selected="true"/); assert.match(html, /settings-nav-keys[^>]*><span[^>]*>Accounts<\/span><\/button>/);
	assert.doesNotMatch(html, />Model providers</);
});

test("Accounts holds no API-key group and no key field", () => {
	const html = renderToStaticMarkup(<SettingsDialogBody onClose={() => {}} />);
	assert.doesNotMatch(html, /group-provider-keys|Model API keys|Add provider key/);
});
