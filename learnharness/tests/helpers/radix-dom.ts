import { parseHTML } from "linkedom";

/** An isolated linkedom DOM with the browser APIs Radix layers reach for
 *  (computed style, ResizeObserver, form elements), so a test can mount a
 *  real open menu, select, popover or dialog and press its keys. Import this
 *  module before any component: Radix picks its layout effect when it loads,
 *  and without a document then it never mounts a portal. */
function installRadixDom() {
	const dom = parseHTML("<!doctype html><html><head></head><body></body></html>");
	class NoopResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	const w = dom.window as unknown as Record<string, unknown>;
	const getComputedStyle = () => ({ getPropertyValue: () => "", animationName: "none", display: "block" });
	const globals = {
		window: dom.window,
		document: dom.document,
		navigator: { userAgent: "node" },
		Node: dom.window.Node,
		Element: dom.window.Element,
		HTMLElement: dom.window.HTMLElement,
		HTMLInputElement: dom.window.HTMLInputElement,
		HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
		HTMLFormElement: w.HTMLFormElement ?? class {},
		HTMLSelectElement: w.HTMLSelectElement ?? class {},
		CustomEvent: dom.window.CustomEvent,
		// linkedom's facade throws on `new`; Select builds one while closed.
		DocumentFragment: function DocumentFragment() { return dom.document.createDocumentFragment(); },
		ResizeObserver: NoopResizeObserver,
		MutationObserver: w.MutationObserver ?? NoopResizeObserver,
		NodeFilter: w.NodeFilter ?? { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
		getComputedStyle,
		IS_REACT_ACT_ENVIRONMENT: true,
		requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0),
		cancelAnimationFrame: (id: number) => clearTimeout(id),
	};
	for (const [key, value] of Object.entries(globals)) {
		Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
	}
	Object.assign(dom.window, { innerWidth: 1280, innerHeight: 800, ResizeObserver: NoopResizeObserver, getComputedStyle });
	dom.window.HTMLElement.prototype.scrollIntoView = () => {};
	return dom;
}

export const dom = installRadixDom();
