// The app window's frame, shared by the shell's window (main.cjs) and the
// launcher's Updating window (scripts/launcher/launch.cjs), so the app's
// window opens exactly where the Updating one stood.

/** The traffic lights' top-left corner in the window, in points, and each
 *  light's drawn diameter. Whole points: AppKit draws the lights on whole
 *  points (a y of 22.5 drew them at 23). Measured in the running app on
 *  16 Nov 2026: 14pt lights 9pt apart, the first at x 16 to 30, y 23 to 37,
 *  so their centre is y + LIGHT_SIZE / 2 = 30. The lights stay physical
 *  under zoom; the renderer gets that centre (--lh-lights-centre) and
 *  centres the folded sidebar's open button on it (app/globals.css). */
const TRAFFIC_LIGHTS = { x: 16, y: 23 };
const LIGHT_SIZE = 14;

const WINDOW_FRAME = {
	width: 1440,
	height: 900,
	// Merged chrome (owner, 2026-09-17): the system title bar is gone;
	// the app's own header bands ARE the title bar, the traffic lights
	// float over the sidebar's top band (TRAFFIC_LIGHTS, above).
	// Dragging comes from the renderer's .lh-drag bands (app/globals.css).
	titleBarStyle: "hiddenInset",
	trafficLightPosition: TRAFFIC_LIGHTS,
	// Live-resize + first-paint flash (owner, 2026-09-17): during a resize
	// the native window surface changes size before Chromium's compositor
	// has a frame at the new size, and the gap shows the window's NATIVE
	// background — Electron's default is white, glaring on a dark app.
	// The app background (#141414) fills the lag instead.
	backgroundColor: "#141414",
	// Narrow-window behavior (owner, 2026-09-17): 640px is the floor —
	// below it even a wrapped chrome row gets cramped and the chat header
	// (lights gutter 92 + toggle + title) runs out of room. The sidebar
	// auto-closes below 928 = 640 + 288 (sidebar) in the renderer
	// (components/sidebar.tsx, SIDEBAR_AUTOCLOSE); its "lh:expand-window"
	// IPC widens the window back to that threshold.
	minWidth: 640,
	minHeight: 600,
};

module.exports = { TRAFFIC_LIGHTS, LIGHT_SIZE, WINDOW_FRAME };
