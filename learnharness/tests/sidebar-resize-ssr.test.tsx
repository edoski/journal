import { test } from "node:test";
import assert from "node:assert/strict";
import { createRef } from "react";
import { renderToString } from "react-dom/server";
import { SidebarResizeHandle } from "@/components/unit-inbox/sidebar-resize-handle";

test("the sidebar's resize handle draws the same HTML on the server as on the client's first render, with no window-dependent maximum", () => {
	const html = renderToString(<SidebarResizeHandle width={267} sidebarId="sidebar" sidebar={createRef<HTMLElement>()} />);
	assert.match(html, /role="separator"/);
	assert.match(html, /aria-valuemin="208"/);
	assert.doesNotMatch(html, /aria-valuemax/, "the server cannot know the window, so it leaves the maximum to the client after hydration");
});
