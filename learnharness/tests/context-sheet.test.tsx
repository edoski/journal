/**
 * Context on the course page head (components/course-context/course-context.md,
 * components/ui/sheet.md): pressing Context opens a sheet that slides in from
 * the window's right edge with what Context holds, and Escape closes it and
 * gives focus back to Context.
 */

import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import type { CourseContext, StudyCourse } from "../src/core/index.ts";
import { ContextButton } from "../components/course-page/course-head/head-parts.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";

const WS = "/study/probability";
const CONTEXT: CourseContext = {
	workspace: WS,
	description: "Be fluent with conditional probability and expectation",
	folders: [],
	websites: [],
	files: [{ handle: "blitzstein", path: "material/blitzstein.pdf", title: "Blitzstein and Hwang, contents" }],
};
const course = { map: { workspace: WS, title: "Probability" } } as StudyCourse;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const realFetch = globalThis.fetch;

afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = realFetch;
});

async function press(target: Element, key: string) {
	await act(async () => {
		const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(event, { key });
		target.dispatchEvent(event);
	});
}

describe("Context on the course head", () => {
	it("opens a sheet at the right edge that slides in with Context's sections, and Escape closes it and returns focus to Context", async () => {
		globalThis.fetch = (async (url: string) =>
			String(url).startsWith("/api/courses/context") ? new Response(JSON.stringify(CONTEXT)) : new Response("{}", { status: 404 })) as typeof fetch;
		host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		await act(async () =>
			root!.render(
				<ServerEventsProvider connect={() => ({ close() {}, onOpen() {}, onEvent() {} })}>
					<ContextButton course={course} />
				</ServerEventsProvider>,
			),
		);

		const opener = document.querySelector<HTMLButtonElement>("[data-slot=course-context]")!;
		opener.focus();
		await act(async () => opener.click());
		await act(async () => new Promise((r) => setTimeout(r, 0)));

		const sheet = document.querySelector("[role=dialog]");
		assert.ok(sheet, "Context opens a dialog");
		assert.equal(sheet.getAttribute("data-slot"), "context-sheet");
		const classes = (sheet.getAttribute("class") ?? "").split(/\s+/);
		for (const anchor of ["fixed", "inset-y-0", "right-0"]) assert.ok(classes.includes(anchor), `the sheet is anchored to the right edge (${anchor})`);
		assert.ok(classes.includes("motion-safe:data-[state=open]:animate-sheet-in"), "it slides in from the right, unless he asked for reduced motion");
		assert.equal(sheet.querySelector("h2")?.textContent, "Context");
		for (const slot of ["context-description", "context-folders", "context-websites", "context-files"]) assert.ok(sheet.querySelector(`[data-slot=${slot}]`), `the sheet holds ${slot}`);
		assert.match(sheet.querySelector("[data-slot=context-file]")?.textContent ?? "", /Blitzstein and Hwang/);

		await press(document.activeElement ?? sheet, "Escape");
		await act(async () => new Promise((r) => setTimeout(r, 0)));

		assert.equal(document.querySelector("[role=dialog]"), null, "Escape closes the sheet");
		assert.equal(document.activeElement, opener, "focus goes back to Context");
	});
});
