import React from "react";
(globalThis as Record<string, unknown>).React = React;

import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RenameRow, SessionRow } from "../components/sidebar.tsx";
import { DeleteSessionDialog } from "../components/delete-session-dialog.tsx";
import type { ChatListItem } from "../src/core/index.ts";

/**
 * Wave 6 chunk A — the deletion + context-menu seams on the sidebar:
 * SessionRow's right-click seam (always carries the row testid now), the
 * inline RenameRow (same geometry, select-all entry), and the delete
 * dialog rendering nothing while closed (its body: dialogs-proposed).
 */

const chat: ChatListItem = {
	id: "c1",
	title: "Wave mechanics",
	updatedAt: new Date().toISOString(),
	busy: false,
} as unknown as ChatListItem;

describe("SessionRow — the right-click seam", () => {
	it("rows carry the session-row testid (context menu anchors to it)", () => {
		const html = renderToStaticMarkup(<SessionRow chat={chat} active={false} onOpen={() => {}} />);
		assert.ok(html.includes('data-testid="session-row"'));
	});
});

describe("RenameRow — the inline rename surface", () => {
	it("renders the draft input with the current title, keeping the meta line", () => {
		const html = renderToStaticMarkup(
			<RenameRow chat={chat} onCommit={() => {}} onCancel={() => {}} />,
		);
		assert.ok(html.includes('data-testid="session-rename-input"'));
		// controlled draft starts from the current title
		assert.ok(html.includes(`value="${chat.title}"`));
		// the meta line rides along (row never changes height mid-edit)
		assert.ok(html.includes("session-rename-row"));
		// (owner, polish round) NOTHING MOVES: no status spacer, no input
		// border/padding — the draft text sits at the idle row's title x,
		// and the input is the ONLY shift-proof editing cue (underline).
		assert.ok(!html.includes("w-3.5 shrink-0"), "no always-on spacer (idle rows have none)");
		const input = html.split('data-testid="session-rename-input"')[1]?.split("/>")[0] ?? "";
		assert.ok(input.includes("px-0"), "input carries no left padding");
		assert.ok(input.includes("border-b"), "the underline is the editing cue");
		assert.ok(!input.includes("bg-background"), "no filled field box — text stays put");
	});
});

describe("DeleteSessionDialog", () => {
	it("closed (chat=null) renders nothing", () => {
		const html = renderToStaticMarkup(
			<DeleteSessionDialog chat={null} onClose={() => {}} onDeleted={() => {}} />,
		);
		assert.equal(html, "");
	});
});
