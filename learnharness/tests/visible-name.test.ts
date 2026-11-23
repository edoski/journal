/**
 * The app is called Chiron wherever a person sees its name: the Mac's app
 * name, menu, Dock and DMG, the window title, notifications, and every page,
 * error or prompt the app shows. Its first name, LearnHarness, survives only
 * in internal identifiers (folders, bundle id, package names), which are
 * lowercase or are not text the app shows.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const OLD_NAME = /Learn(ing)? ?Harness/;

const { PRODUCT_NAME, DATA_FOLDER, nameApp } = require("../electron/product.cjs") as {
	PRODUCT_NAME: string;
	DATA_FOLDER: string;
	nameApp: (app: object, env: Record<string, string>) => void;
};

/** Every file under `dir` (relative to the app) whose name passes `keep`. */
function files(dir: string, keep: (file: string) => boolean): string[] {
	const full = path.join(root, dir);
	if (fs.statSync(full).isFile()) return [full];
	return fs.readdirSync(full, { recursive: true, encoding: "utf8" }).map((f) => path.join(full, f)).filter((f) => fs.statSync(f).isFile() && keep(f));
}

/** The text a program can show: its string literals, template parts and JSX
 *  text, not its comments. The userData folder's name is the one exception. */
function shownText(file: string): string[] {
	const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
	const found: string[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isVariableDeclaration(node) && node.name.getText() === "DATA_FOLDER") return;
		if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) found.push(node.text);
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

describe("the app's visible name", () => {
	it("is Chiron on the Mac: app menu, Dock, Spotlight, DMG", () => {
		assert.equal(PRODUCT_NAME, "Chiron");
		const builder = fs.readFileSync(path.join(root, "electron-builder.yml"), "utf8");
		assert.equal(/^productName: (.+)$/m.exec(builder)?.[1], PRODUCT_NAME);
		assert.match(builder, /^ {2}title: "\$\{productName\} \$\{version\}"$/m);
		// The Spotlight launcher's .app takes its name from this line of install.sh.
		const line = fs.readFileSync(path.join(root, "scripts/launcher/install.sh"), "utf8").split("\n").find((l) => l.startsWith('name="$('));
		assert.ok(line);
		const name = execFileSync("bash", ["-c", `${line}\nprintf %s "$name"`], { env: { ...process.env, app_src: root }, encoding: "utf8" });
		assert.equal(name, PRODUCT_NAME);
	});

	it("names the app Chiron and keeps its data in the old folder", () => {
		const calls: Record<string, string> = {};
		const app = {
			setName: (name: string) => void (calls.name = name),
			getPath: (which: string) => (which === "appData" ? "/Users/x/Library/Application Support" : assert.fail(`read ${which} before setting it`)),
			setPath: (which: string, where: string) => void (calls[which] = where),
		};
		nameApp(app, {});
		assert.deepEqual(calls, { name: PRODUCT_NAME, userData: "/Users/x/Library/Application Support/LearnHarness" });
		assert.equal(DATA_FOLDER, "LearnHarness");
		nameApp(app, { LH_USER_DATA_DIR: "/tmp/fixture-user-data" });
		assert.equal(calls.userData, "/tmp/fixture-user-data");
	});

	it("never says LearnHarness in anything the app shows: pages, window title, menus, notifications, errors", () => {
		const code = ["app", "components", "lib", "src", "electron", "scripts/launcher", "proxy.ts", "config.ts"].flatMap((dir) => files(dir, (f) => /\.(c|m)?(j|t)sx?$/.test(f) && !f.endsWith(".d.ts")));
		assert.ok(code.length > 100, `scanned only ${code.length} files`);
		const shown = code.flatMap((file) => shownText(file).filter((text) => OLD_NAME.test(text)).map((text) => `${path.relative(root, file)}: ${text}`));
		assert.deepEqual(shown, []);
		assert.ok(shownText(path.join(root, "app/layout.tsx")).includes("Chiron"), "the document (and so the window) title is Chiron");
	});

	it("never names the app LearnHarness in the tutor's prompts", () => {
		const prompts = [...files("src", (f) => f.endsWith(".md")), ...files("../learning/skills/tutor/references", (f) => f.endsWith(".md"))];
		assert.ok(prompts.length > 5);
		const named = prompts.filter((file) => OLD_NAME.test(fs.readFileSync(file, "utf8"))).map((file) => path.relative(root, file));
		assert.deepEqual(named, []);
	});
});
