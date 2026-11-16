/**
 * The page's first frame is the settled layout: the server draws the
 * sidebar open or folded, at its width, as the learner left it (its
 * cookies), so hydration changes nothing and nothing slides in on load
 * (round 8: the sidebar started folded and slid open after mount, shifting
 * the page). Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarProvider, useSidebar } from "../components/sidebar.tsx";
import { sidebarFirstFrame } from "../components/sidebar-cookies.ts";
import { SIDEBAR_DEFAULT_WIDTH, useSidebarWidth } from "../components/unit-inbox/sidebar-width.ts";
import { readFileSync } from "node:fs";

/** What the sidebar draws from on the server: its open state and width. */
function Probe() {
	const { open } = useSidebar();
	const width = useSidebarWidth();
	return <aside data-state={open ? "open" : "folded"} data-width={width} />;
}

const serverFrame = (initial?: { open: boolean | null; width: number }) => {
	const html = renderToStaticMarkup(
		<SidebarProvider initial={initial}>
			<Probe />
		</SidebarProvider>,
	);
	return { state: html.match(/data-state="(\w+)"/)?.[1], width: Number(html.match(/data-width="(\d+)"/)?.[1]), animated: html.includes("lh-sidebar-motion") };
};

describe("the sidebar's first frame", () => {
	it("reads the open state and width the learner left from the cookies", () => {
		assert.deepEqual(sidebarFirstFrame("1", "320"), { open: true, width: 320 });
		assert.deepEqual(sidebarFirstFrame("0", undefined), { open: false, width: SIDEBAR_DEFAULT_WIDTH });
		assert.deepEqual(sidebarFirstFrame(undefined, "wide"), { open: null, width: SIDEBAR_DEFAULT_WIDTH });
	});

	it("is drawn by the server as it will settle, with no motion: open at his width, or folded", () => {
		assert.deepEqual(serverFrame({ open: true, width: 320 }), { state: "open", width: 320, animated: false });
		assert.deepEqual(serverFrame({ open: false, width: 320 }), { state: "folded", width: 320, animated: false });
	});

	it("is read on the server from a module the server can call (no \"use client\")", () => {
		assert.doesNotMatch(readFileSync(new URL("../components/sidebar-cookies.ts", import.meta.url), "utf8"), /^["']use client["']/m);
		assert.match(readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8"), /sidebarFirstFrame\(/);
	});

	it("opens on a load with no cookie yet, as a first run does, so the common case never slides in", () => {
		assert.deepEqual(serverFrame(), { state: "open", width: SIDEBAR_DEFAULT_WIDTH, animated: false });
	});
});
