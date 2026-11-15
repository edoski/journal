/**
 * The sidebar's resize handle hydrates as the server drew it: the server
 * cannot know the window, so its `aria-valuemax` waits for the client, and
 * then follows the window as it resizes (round 9: the server wrote
 * `aria-valuemax="Infinity"`, the client 208, and React logged a
 * hydration mismatch on every load).
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { TooltipProvider } from "../components/ui/tooltip.tsx";
import { SidebarResizeHandle } from "../components/unit-inbox/sidebar-resize-handle.tsx";
import { maxSidebarWidth } from "../components/unit-inbox/sidebar-width.ts";

function Handle() {
	const sidebar = React.useRef<HTMLElement | null>(null);
	return <SidebarResizeHandle width={208} sidebarId="sidebar" sidebar={sidebar} />;
}

/** The handle's HTML as a server draws it, with no window or document. */
function serverHtml(): string {
	const hidden = ["window", "document"] as const;
	const kept = hidden.map((key) => Object.getOwnPropertyDescriptor(globalThis, key)!);
	for (const key of hidden) delete (globalThis as Record<string, unknown>)[key];
	try {
		return renderToString(<TooltipProvider><Handle /></TooltipProvider>);
	} finally {
		hidden.forEach((key, i) => Object.defineProperty(globalThis, key, kept[i]!));
	}
}

const separator = () => dom.document.querySelector("[role=separator]")!;

describe("the sidebar's resize handle", () => {
	it("hydrates without a mismatch, then gives the window's bound and follows a resize", async () => {
		const html = serverHtml();
		assert.doesNotMatch(html, /aria-valuemax/, "the server leaves the bound out, as it cannot know the window");

		Object.assign(dom.window, { innerWidth: 848 });
		const host = dom.document.createElement("div");
		host.innerHTML = html;
		dom.document.body.appendChild(host);
		const logged: string[] = [];
		const error = console.error;
		console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
		let root: ReturnType<typeof hydrateRoot> | null = null;
		try {
			await act(async () => {
				root = hydrateRoot(host, <TooltipProvider><Handle /></TooltipProvider>, { onRecoverableError: (e) => void logged.push(String(e)) });
			});
		} finally {
			console.error = error;
		}
		assert.deepEqual(logged.filter((line) => /hydrat|did not match/i.test(line)), [], "hydration logs no mismatch");
		assert.equal(separator().getAttribute("aria-valuemax"), String(maxSidebarWidth(848)));

		await act(async () => {
			Object.assign(dom.window, { innerWidth: 1512 });
			dom.window.dispatchEvent(new dom.window.Event("resize"));
		});
		assert.equal(separator().getAttribute("aria-valuemax"), String(maxSidebarWidth(1512)), "the bound follows the window");

		await act(async () => root!.unmount());
		host.remove();
	});
});
