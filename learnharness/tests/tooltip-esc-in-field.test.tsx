/**
 * Round 15, 3 free (m33): with a half answer in the box, the first Esc did
 * nothing he could see; the second switched to Ask. The meter's hint, left
 * open by the pointer, was the topmost layer and claimed the Esc, so the
 * answer box's own Esc never ran. A tooltip still closes on Esc and still
 * claims it from a button (a trigger refocused as its popover closes must
 * not abort the turn), but where he types, the Esc goes on to the field.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip.tsx";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
});

async function mount() {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<TooltipProvider>
				<Tooltip open>
					<TooltipTrigger asChild>
						<button data-testid="meter">Neutral</button>
					</TooltipTrigger>
					<TooltipContent>How sure you are</TooltipContent>
				</Tooltip>
				<textarea data-testid="box" defaultValue="the axes, stretched by 2" />
			</TooltipProvider>,
		),
	);
}

/** Esc pressed in `target`; whether it reached the window, where the lesson's Esc runs. */
async function escapeFrom(target: HTMLElement): Promise<boolean> {
	let reached = false;
	const onKey = (e: Event) => {
		if ((e as KeyboardEvent).key === "Escape") reached = true;
	};
	window.addEventListener("keydown", onKey);
	try {
		target.focus();
		await act(async () => {
			const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
			Object.assign(event, { key: "Escape" });
			target.dispatchEvent(event);
		});
	} finally {
		window.removeEventListener("keydown", onKey);
	}
	return reached;
}

describe("Esc with a hint open", () => {
	it("goes on to the box he types in", async () => {
		await mount();
		assert.ok(document.querySelector('[data-slot="tooltip-content"]'), "the hint is open");
		assert.equal(await escapeFrom(document.querySelector<HTMLElement>('[data-testid="box"]')!), true);
	});

	it("is the hint's alone from a button", async () => {
		await mount();
		assert.equal(await escapeFrom(document.querySelector<HTMLElement>('[data-testid="meter"]')!), false);
	});
});
