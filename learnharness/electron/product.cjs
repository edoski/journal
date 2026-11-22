// The app's name, the one constant a rename changes: the shell names its menu
// with it, and scripts/launcher/install.sh its .app.
// DATA_FOLDER is the app's first name and stays: it names the folders that
// hold his data, preferences and logs (Application Support, Logs), so a
// rename moves nothing on disk.
const path = require("node:path");

const PRODUCT_NAME = "Chiron";
const DATA_FOLDER = "LearnHarness";

/** Names the app and pins its userData folder, before anything reads it.
 *  LH_USER_DATA_DIR overrides the folder (the launcher's tests). */
function nameApp(app, env) {
	app.setName(PRODUCT_NAME);
	app.setPath("userData", env.LH_USER_DATA_DIR ? path.resolve(env.LH_USER_DATA_DIR) : path.join(app.getPath("appData"), DATA_FOLDER));
}

module.exports = { PRODUCT_NAME, DATA_FOLDER, nameApp };
