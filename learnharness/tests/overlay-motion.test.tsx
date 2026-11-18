/**
 * The overlay primitives move as their specs say (components/ui/overlay.md,
 * dialog.md, popover.md, sheet.md): each is rendered open, the app's
 * stylesheet is compiled for the classes it carries, and the rules that
 * match it are read as the browser would. Without tw-animate-css the
 * animate-in, fade, zoom and slide utilities compile to nothing, so a dialog
 * or a menu just appeared (round 9). Under reduced motion nothing moves.
 */

import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { compile, optimize } from "@tailwindcss/node";
import postcss, { type AtRule, type Container, type Rule } from "postcss";
import { createRoot, type Root } from "react-dom/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.tsx";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../components/ui/sheet.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip.tsx";

type Decl = { prop: string; value: string; layered: boolean; reduced: boolean };
type Motion = { name: string; ms: number; vars: Record<string, string> };

let root: Root;
let host: HTMLDivElement;
let rules: { selector: string; decls: Decl[] }[] = [];
let keyframes = new Set<string>();

before(async () => {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () =>
		root.render(
			<TooltipProvider>
				<Dialog open>
					<DialogContent>
						<DialogTitle>Setup</DialogTitle>
						<DialogDescription>Choose a course</DialogDescription>
					</DialogContent>
				</Dialog>
				<Sheet open>
					<SheetContent>
						<SheetTitle>Context</SheetTitle>
						<SheetDescription>What Context holds</SheetDescription>
					</SheetContent>
				</Sheet>
				<Popover open>
					<PopoverTrigger>Mistakes</PopoverTrigger>
					<PopoverContent>Two mistakes</PopoverContent>
				</Popover>
				<DropdownMenu open>
					<DropdownMenuTrigger>Course</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem>Rename</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<Tooltip open>
					<TooltipTrigger>Mark</TooltipTrigger>
					<TooltipContent>Correct</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		),
	);
	const classes = new Set<string>();
	for (const el of document.querySelectorAll("[class]")) for (const c of (el.getAttribute("class") ?? "").split(/\s+/)) if (c) classes.add(c);
	const app = fileURLToPath(new URL("../app/", import.meta.url));
	const compiler = await compile(readFileSync(`${app}globals.css`, "utf8"), { base: app, onDependency() {} });
	const css = optimize(compiler.build([...classes])).code;
	postcss.parse(css).walk((node) => {
		if (node.type === "atrule" && /keyframes$/.test(node.name)) keyframes.add(node.params);
		if (node.type !== "rule" || node.parent?.type === "atrule" && /keyframes$/.test((node.parent as AtRule).name)) return;
		const rule = node as Rule;
		let layered = false;
		let reduced = false;
		for (let p: Container | undefined = rule.parent; p && p.type === "atrule"; p = p.parent as Container | undefined) {
			const at = p as AtRule;
			// Tailwind's fallback for browsers without @property; Electron has it.
			if (at.name === "layer" && at.params === "properties") return;
			if (at.name === "layer") layered = true;
			if (at.name === "media" && /prefers-reduced-motion:\s*reduce/.test(at.params)) reduced = true;
		}
		const decls: Decl[] = [];
		rule.each((d) => {
			if (d.type === "decl") decls.push({ prop: d.prop, value: d.value, layered, reduced });
		});
		rules.push({ selector: rule.selector, decls });
	});
});

after(async () => {
	await act(async () => root.unmount());
	host.remove();
	rules = [];
	keyframes = new Set();
});

function matches(el: Element, selector: string) {
	try {
		return el.matches(selector);
	} catch {
		return false;
	}
}

function resolveVars(value: string, vars: Record<string, string>): string {
	const at = value.lastIndexOf("var(");
	if (at < 0) return value;
	let depth = 0;
	let end = at + 3;
	for (; end < value.length; end++) {
		if (value[end] === "(") depth++;
		if (value[end] === ")" && --depth === 0) break;
	}
	const inner = value.slice(at + 4, end);
	const comma = inner.indexOf(",");
	const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
	const fallback = comma < 0 ? "" : inner.slice(comma + 1);
	return resolveVars(`${value.slice(0, at)} ${vars[name] ?? fallback} ${value.slice(end + 1)}`, vars);
}

/** The element's animation as the cascade leaves it: unlayered rules beat
 *  the utilities layer, later rules beat earlier ones, and the reduced-motion
 *  rules apply only when he asked for reduced motion. */
function motionOf(el: Element, state: "open" | "delayed-open" | "closed", reducedMotion = false): Motion {
	el.setAttribute("data-state", state);
	const live = rules.filter((r) => matches(el, r.selector)).flatMap((r) => r.decls).filter((d) => reducedMotion || !d.reduced);
	const ordered = [...live.filter((d) => d.layered), ...live.filter((d) => !d.layered)];
	const vars: Record<string, string> = {};
	let animation = "none";
	for (const d of ordered) {
		if (d.prop.startsWith("--")) vars[d.prop] = d.value;
		if (d.prop === "animation") animation = d.value;
	}
	const [name = "none", duration = "0s"] = resolveVars(animation, vars).trim().split(/\s+/);
	const ms = duration.endsWith("ms") ? Number(duration.slice(0, -2)) : Number(duration.slice(0, -1)) * 1000;
	return { name, ms, vars };
}

const slot = (name: string) => {
	const el = document.querySelector(`[data-slot=${name}]`);
	assert.ok(el, `${name} is open`);
	return el;
};

describe("overlay motion", () => {
	it("a dialog fades and zooms in from 95% over 150ms, and back out", () => {
		const content = slot("dialog-content");
		const open = motionOf(content, "open");
		assert.equal(open.name, "enter", "the dialog animates in");
		assert.ok(keyframes.has("enter") && keyframes.has("exit"), "the enter and exit keyframes exist");
		assert.equal(open.ms, 150);
		assert.equal(open.vars["--tw-enter-opacity"], "0");
		assert.match(open.vars["--tw-enter-scale"] ?? "", /^0?\.95$/);
		const closed = motionOf(content, "closed");
		assert.equal(closed.name, "exit", "the dialog animates out");
		assert.equal(closed.vars["--tw-exit-opacity"], "0");
		const overlay = slot("dialog-overlay");
		assert.equal(motionOf(overlay, "open").name, "enter", "its dim layer fades in");
		assert.equal(motionOf(overlay, "closed").vars["--tw-exit-opacity"], "0", "and out");
	});

	it("the sheet slides in from the right edge over 200ms and out over 150ms, its dim layer with it", () => {
		const content = slot("sheet-content");
		const open = motionOf(content, "open");
		assert.equal(open.name, "enter");
		assert.equal(open.ms, 200);
		assert.equal(open.vars["--tw-enter-translate-x"], "100%");
		const closed = motionOf(content, "closed");
		assert.equal(closed.name, "exit");
		assert.equal(closed.ms, 150);
		assert.equal(closed.vars["--tw-exit-translate-x"], "100%");
		const overlay = slot("sheet-overlay");
		assert.deepEqual([motionOf(overlay, "open").ms, motionOf(overlay, "closed").ms], [200, 150]);
		assert.equal(motionOf(overlay, "open").vars["--tw-enter-opacity"], "0");
	});

	for (const name of ["popover-content", "dropdown-menu-content"]) {
		it(`${name} fades and zooms in over 150ms from the trigger's side, and back out`, () => {
			const content = slot(name);
			assert.equal(content.getAttribute("data-side"), "bottom");
			const open = motionOf(content, "open");
			assert.equal(open.name, "enter");
			assert.equal(open.ms, 150);
			assert.equal(open.vars["--tw-enter-opacity"], "0");
			assert.match(open.vars["--tw-enter-scale"] ?? "", /^0?\.95$/);
			assert.equal(open.vars["--tw-enter-translate-y"]?.replace(/\s/g, ""), "calc(2*var(--spacing)*-1)", "it slides 8px down from the trigger");
			assert.equal(motionOf(content, "closed").name, "exit");
		});
	}

	it("a tooltip fades and zooms in, and back out", () => {
		const content = slot("tooltip-content");
		const open = motionOf(content, "delayed-open");
		assert.equal(open.name, "enter");
		assert.equal(open.vars["--tw-enter-opacity"], "0");
		assert.equal(motionOf(content, "closed").name, "exit");
	});

	it("under reduced motion none of them moves", () => {
		for (const name of ["dialog-content", "dialog-overlay", "sheet-content", "sheet-overlay", "popover-content", "dropdown-menu-content", "tooltip-content"]) {
			const el = slot(name);
			assert.equal(motionOf(el, "open", true).name, "none", `${name} appears in place`);
			assert.equal(motionOf(el, "closed", true).name, "none", `${name} leaves in place`);
		}
	});
});
