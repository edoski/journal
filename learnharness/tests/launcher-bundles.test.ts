/**
 * After a rename the Spotlight launcher's .app under its old name sits beside
 * the new one: the copy with the current name removes the other copies of the
 * launcher, and nothing else in the folder. PlistBuddy reads the bundle ids,
 * so this runs on the Mac (CI's runner) only.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { removeRenamedBundles } = require("../scripts/launcher/bundles.cjs") as {
	removeRenamedBundles: (bundle: string, name: string) => string[];
};

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bundles-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

/** A .app with this bundle id, and the launcher's checkout.json when `launcher`. */
function app(folder: string, name: string, id: string, launcher = true) {
	const contents = path.join(folder, `${name}.app`, "Contents");
	fs.mkdirSync(path.join(contents, "Resources", "app"), { recursive: true });
	fs.writeFileSync(
		path.join(contents, "Info.plist"),
		`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string></dict></plist>\n`,
	);
	if (launcher) fs.writeFileSync(path.join(contents, "Resources", "app", "checkout.json"), "{}");
	return path.join(folder, `${name}.app`);
}

describe("the launcher after a rename", { skip: process.platform !== "darwin" && "PlistBuddy is macOS only" }, () => {
	it("removes its old copy from the new one, and leaves every other app", () => {
		const folder = fs.mkdtempSync(path.join(scratch, "apps-"));
		const current = app(folder, "Chiron", "com.learnharness.launcher");
		const old = app(folder, "LearnHarness", "com.learnharness.launcher");
		const other = app(folder, "Other", "com.example.other");
		const sameIdNotLauncher = app(folder, "Lookalike", "com.learnharness.launcher", false);

		// Run from the old copy (a relaunch before the rebuild), it removes nothing.
		assert.deepEqual(removeRenamedBundles(old, "Chiron"), []);
		assert.ok(fs.existsSync(current));

		assert.deepEqual(removeRenamedBundles(current, "Chiron"), [old]);
		assert.deepEqual(
			[current, old, other, sameIdNotLauncher].map((copy) => fs.existsSync(copy)),
			[true, false, true, true],
		);
	});
});
