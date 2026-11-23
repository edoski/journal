/*
 * Preload (2026-09-17, narrow-window wave): the ONLY bridge between the
 * sandboxed renderer and the main process. contextIsolation + sandbox are
 * on (electron/main.cjs), so this file is the renderer's entire access to
 * Electron — keep it a minimal, explicit API surface.
 *
 *   window.lh.expandWindow() — widen the window to the sidebar auto-close
 *   threshold (928px) when the sidebar is opened below it. The main
 *   process clamps: no-op if the window is already wide enough.
 *
 *   window.lh.onZoom(cb) / window.lh.getZoom() — the zoom truth (owner
 *   round 7, 2026-10-05): every ⌘±/⌘0 change arrives as "lh:zoom" with
 *   the new factor; getZoom covers the first-paint race. The renderer
 *   publishes it as --lh-zoom so physical-constant lengths (the traffic-
 *   light gutter) can divide by it.
 *
 *   window.lh.lightsCentre — the traffic lights' centre from the window's
 *   top, in points (TRAFFIC_LIGHTS in electron/window-frame.cjs, passed as
 *   --lh-lights-centre); the renderer publishes it as --lh-lights-centre.
 *
 *   window.lh.pickFolder() — the system folder picker for Context's Link a
 *   folder; resolves to the folder's path, or null when cancelled.
 *
 *   window.lh.notify(notice) / onInUse(cb) / onOpen(cb) — the study
 *   notifications (components/desktop-notice-bridge.tsx): the renderer
 *   offers a notice, the shell shows it at most once (`showNotice` in
 *   electron/main.cjs); "lh:in-use" when the Mac wakes or unlocks; "lh:open"
 *   with the place a clicked notice names.
 *
 * Channel names are mirrored in electron/main.cjs — keep them in sync.
 */
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("lh", {
	expandWindow: () => ipcRenderer.send("lh:expand-window"),
	onZoom: (cb) => {
		const listener = (_event, factor) => cb(factor);
		ipcRenderer.on("lh:zoom", listener);
		return () => ipcRenderer.removeListener("lh:zoom", listener);
	},
	getZoom: () => ipcRenderer.invoke("lh:zoom:get"),
	lightsCentre: Number(process.argv.find((arg) => arg.startsWith("--lh-lights-centre="))?.split("=")[1]),
	pickFolder: () => ipcRenderer.invoke("lh:pick-folder"),
	/** A dropped file's or folder's path on his Mac (the composer puts it in his words). */
	pathForFile: (file) => webUtils.getPathForFile(file),
	notify: (notice) => ipcRenderer.send("lh:notify", notice),
	onInUse: (cb) => {
		const listener = () => cb();
		ipcRenderer.on("lh:in-use", listener);
		return () => ipcRenderer.removeListener("lh:in-use", listener);
	},
	onOpen: (cb) => {
		const listener = (_event, href) => cb(href);
		ipcRenderer.on("lh:open", listener);
		return () => ipcRenderer.removeListener("lh:open", listener);
	},
	/** The machine woke from sleep; returns unsubscribe. */
	onResume: (cb) => {
		const listener = () => cb();
		ipcRenderer.on("lh:resume", listener);
		return () => ipcRenderer.removeListener("lh:resume", listener);
	},
});
