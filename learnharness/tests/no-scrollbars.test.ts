/**
 * No scrollbar is ever drawn (Edo's ruling), by one base-layer rule: the app's
 * stylesheet is compiled with the classes scroll boxes carry, and every rule
 * that sets a bar sets none. No component hides its own bar, since the base
 * rule already does.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { compile, optimize } from "@tailwindcss/node";
import postcss, { type AtRule, type Rule } from "postcss";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function compiled(classes: string[]) {
	const app = join(ROOT, "app/");
	const compiler = await compile(readFileSync(`${app}globals.css`, "utf8"), { base: app, onDependency() {} });
	return postcss.parse(optimize(compiler.build(classes)).code);
}

function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sources(path);
		return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
	});
}

describe("no visible scrollbars", () => {
	it("every box draws no bar, from one rule in the base layer", async () => {
		const css = await compiled(["overflow-y-auto", "overflow-x-auto", "overflow-auto", "max-h-72"]);
		const bars: { selector: string; value: string; layer: string | undefined }[] = [];
		const webkit: string[] = [];
		css.walkDecls(/^scrollbar-(width|color)$/, (decl) => {
			const rule = decl.parent as Rule;
			const layer = rule.parent?.type === "atrule" && (rule.parent as AtRule).name === "layer" ? (rule.parent as AtRule).params : undefined;
			bars.push({ selector: rule.selector, value: `${decl.prop}: ${decl.value}`, layer });
		});
		css.walkRules(/::-webkit-scrollbar/, (rule) => { webkit.push(rule.selector); });
		assert.deepEqual(bars.filter((bar) => bar.value !== "scrollbar-width: none"), [], "no rule draws a bar");
		assert.ok(bars.some((bar) => bar.selector === "*" && bar.layer === "base"), "the base layer sets it on every box");
		// FullCalendar's own stylesheet hides its bar its own way.
		assert.deepEqual(webkit.filter((selector) => !selector.startsWith(".fc-")), [], "no webkit bar styling of the app's: scrollbar-width wins in Chromium");
	});

	it("no component hides its own bar or wraps a scroller to hide one", () => {
		const offenders = ["app", "components", "lib"].flatMap((dir) => sources(join(ROOT, dir)))
			.filter((file) => !file.endsWith("globals.css"))
			.filter((file) => /scrollbar-width|::-webkit-scrollbar|ScrollArea/.test(readFileSync(file, "utf8")));
		assert.deepEqual(offenders, []);
	});
});
