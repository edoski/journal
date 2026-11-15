/**
 * Every declared package earns its place: the app's code imports it, or a
 * package it declares requires it as a peer. Thirteen registry leftovers sat
 * in package.json unused until round 9's clean-up.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

function files(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "node_modules" || entry.name.startsWith(".") ? [] : files(path);
		return /\.(tsx?|mts|mjs|cjs|js|css)$/.test(entry.name) ? [path] : [];
	});
}

const code = ["app", "components", "lib", "src", "electron", "scripts", "tests"].flatMap((dir) => files(join(ROOT, dir)))
	.concat(["config.ts", "next.config.ts", "instrumentation.ts", "proxy.ts", "postcss.config.mjs", "eslint.config.mjs"].map((f) => join(ROOT, f)).filter(existsSync))
	.map((file) => readFileSync(file, "utf8"))
	.join("\n");

const imported = (name: string) => new RegExp(`(from |import\\(|require\\(|@import |@plugin |plugins: \\{\\s*)["']${name.replace(/[/.]/g, "\\$&")}(["'/])`).test(code);

function requiredPeers(name: string): string[] {
	const manifest = join(ROOT, "node_modules", name, "package.json");
	if (!existsSync(manifest)) return [];
	const json = JSON.parse(readFileSync(manifest, "utf8")) as { peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }> };
	return Object.keys(json.peerDependencies ?? {}).filter((peer) => !json.peerDependenciesMeta?.[peer]?.optional);
}

describe("declared packages", () => {
	it("every runtime dependency is imported, or is a peer a dependency requires", () => {
		const peers = new Set(Object.keys(pkg.dependencies).flatMap(requiredPeers));
		const unused = Object.keys(pkg.dependencies).filter((name) => !imported(name) && !peers.has(name));
		assert.deepEqual(unused, []);
	});
});
