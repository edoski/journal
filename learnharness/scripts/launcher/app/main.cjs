// The .app's own main. It only finds the checkout and hands over to the
// launcher there (scripts/launcher/launch.cjs), so a merge into main changes
// the launcher without reinstalling the .app. install.sh writes checkout.json
// beside this file; run straight from the repository, the checkout is the one
// holding this folder. LH_CHECKOUT overrides either.
const fs = require("node:fs");
const path = require("node:path");

const baked = path.join(__dirname, "checkout.json");
const installed = fs.existsSync(baked);
const checkout = process.env.LH_CHECKOUT
	? path.resolve(process.env.LH_CHECKOUT)
	: installed
		? JSON.parse(fs.readFileSync(baked, "utf8")).checkout
		: path.resolve(__dirname, "..", "..", "..", "..");

try {
	require(path.join(checkout, "learnharness", "scripts", "launcher", "launch.cjs")).launch({
		checkout,
		// <name>.app/Contents/MacOS/Electron. A run on another checkout never
		// rebuilds the .app, which would bake that checkout in.
		bundle: installed && !process.env.LH_CHECKOUT ? path.resolve(process.execPath, "..", "..", "..") : null,
	});
} catch (error) {
	const { app, dialog } = require("electron");
	dialog.showErrorBox("Could not open the app", `${checkout}\n\n${error.stack ?? error}`);
	app.exit(1);
}
