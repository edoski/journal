// The launcher's .app copies in one folder (~/Applications). No Electron here,
// so tests load it as plain Node.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const bundleId = (copy) =>
	spawnSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", path.join(copy, "Contents", "Info.plist")], { encoding: "utf8" }).stdout?.trim() || null;

/** A rename leaves the .app under its old name beside the new one, both found
 *  by Spotlight. Run from the copy that carries the current name, this
 *  removes every other copy of the launcher (same bundle id) in its folder;
 *  run from any other copy it removes nothing. Returns what it removed. */
function removeRenamedBundles(bundle, name, log = () => {}) {
	if (path.basename(bundle) !== `${name}.app`) return [];
	const own = bundleId(bundle);
	if (!own) return [];
	const folder = path.dirname(bundle);
	const removed = [];
	for (const entry of fs.readdirSync(folder)) {
		const other = path.join(folder, entry);
		// Only a launcher carries checkout.json: other apps are never read.
		if (other === bundle || !fs.existsSync(path.join(other, "Contents", "Resources", "app", "checkout.json")) || bundleId(other) !== own) continue;
		log(`removing the launcher's old copy: ${other}`);
		fs.rmSync(other, { recursive: true, force: true });
		removed.push(other);
	}
	return removed;
}

module.exports = { removeRenamedBundles };
