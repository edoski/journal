import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "../components/ui/alert-dialog.tsx";

// The app rules every overlay primitive carries (components/ui/overlay.md),
// checked on the real Radix layers mounted against an isolated DOM.
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

/** Mounts one open layer whose onOpenChange reports here. */
async function mountOpen(render: (onOpenChange: (open: boolean) => void) => React.ReactElement) {
	const changes: boolean[] = [];
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(render((open) => changes.push(open))); });
	return changes;
}

/** Presses Esc where the app's shortcut layer would hear it: a window
 *  listener, like KeyboardShortcuts' abort. */
async function pressEscape(): Promise<number> {
	let reachedWindow = 0;
	const onWindow = (e: Event) => { if ((e as KeyboardEvent).key === "Escape") reachedWindow++; };
	window.addEventListener("keydown", onWindow);
	await act(async () => {
		const key = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(key, { key: "Escape" });
		(document.activeElement ?? document.body).dispatchEvent(key);
	});
	window.removeEventListener("keydown", onWindow);
	return reachedWindow;
}

const LAYERS = {
	"dropdown-menu": (onOpenChange) => (
		<DropdownMenu open onOpenChange={onOpenChange}>
			<DropdownMenuTrigger>Course</DropdownMenuTrigger>
			<DropdownMenuContent><DropdownMenuItem>Linear algebra</DropdownMenuItem></DropdownMenuContent>
		</DropdownMenu>
	),
	popover: (onOpenChange) => (
		<Popover open onOpenChange={onOpenChange}>
			<PopoverTrigger>Details</PopoverTrigger>
			<PopoverContent>Model</PopoverContent>
		</Popover>
	),
	select: (onOpenChange) => (
		<Select open onOpenChange={onOpenChange} value="a">
			<SelectTrigger><SelectValue /></SelectTrigger>
			<SelectContent><SelectItem value="a">High</SelectItem></SelectContent>
		</Select>
	),
	"alert-dialog": (onOpenChange) => (
		<AlertDialog open onOpenChange={onOpenChange}>
			<AlertDialogContent aria-describedby={undefined}><AlertDialogTitle>Delete session?</AlertDialogTitle></AlertDialogContent>
		</AlertDialog>
	),
} satisfies Record<string, (onOpenChange: (open: boolean) => void) => React.ReactElement>;

describe("overlay primitives (overlay.md)", () => {
	for (const [name, render] of Object.entries(LAYERS)) {
		it(`${name}: one Esc closes the layer and never reaches the shortcut layer`, async () => {
			const changes = await mountOpen(render);
			const reachedWindow = await pressEscape();
			assert.deepEqual(changes, [false], "Esc asks the layer to close");
			assert.equal(reachedWindow, 0, "the window listener (turn abort) must not hear it");
		});
	}

	it("portalled menus sit in Radix's popper wrapper, which the outside-click guards count as inside", async () => {
		for (const name of ["dropdown-menu", "popover", "select"] as const) {
			await mountOpen(LAYERS[name]);
			const content = document.querySelector(`[data-slot="${name}-content"]`);
			assert.ok(content, `${name} content renders`);
			assert.ok(content.closest("[data-radix-popper-content-wrapper]"), `${name} content sits in the popper wrapper`);
			await act(async () => { root?.unmount(); });
			host?.remove();
		}
	});
});
