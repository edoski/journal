// The app's name: the shell names its menu and notifications with it, and
// scripts/launcher/install.sh its .app. A rename also changes productName in
// electron-builder.yml and the pages' own words; tests/visible-name.test.ts
// fails on any place still showing the old name.
// DATA_FOLDER is the app's first name and stays: it names the folders that
// hold his data, preferences and logs (Application Support, Logs), so a
// rename moves nothing on disk.
const path = require("node:path");

const PRODUCT_NAME = "Chiron";
const DATA_FOLDER = "LearnHarness";

/** Names the app and pins its userData folder, before anything reads it.
 *  LH_USER_DATA_DIR overrides the folder (the launcher's tests). A dev shell
 *  (LH_DEV_URL) runs beside the packaged app in the folder's "-dev" twin, so
 *  it neither loses the single-instance lock to it nor shares its
 *  localStorage, auth.json or logs. Chromium reads the folder once, when
 *  Electron is ready: the launcher names the app before that, the shell
 *  again at its load, and both land on the same folder. */
function nameApp(app, env) {
	app.setName(PRODUCT_NAME);
	const folder = env.LH_USER_DATA_DIR ? path.resolve(env.LH_USER_DATA_DIR) : path.join(app.getPath("appData"), DATA_FOLDER);
	app.setPath("userData", env.LH_DEV_URL ? `${folder}-dev` : folder);
}

module.exports = { PRODUCT_NAME, DATA_FOLDER, nameApp };
