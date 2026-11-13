/**
 * A session opened on a message link jumps to that message as soon as it
 * mounts, on the DOM change itself, instead of on a 64 ms retry.
 */
import { dom } from "./helpers/radix-dom.ts";
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { it, mock } from "node:test";
import { createRoot } from "react-dom/client";
import { StickToBottom } from "use-stick-to-bottom";
import { SessionMessageNavigation } from "../components/session-navigation.tsx";

it("jumps to the linked message the moment it mounts, with no clock running", async () => {
	Object.defineProperty(dom.window, "location", { configurable: true, value: { hash: "#message-m1" } });
	Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }) });
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
	try {
		await act(async () => root.render(<StickToBottom><StickToBottom.Content><SessionMessageNavigation /></StickToBottom.Content></StickToBottom>));
		const scroller = host.querySelector("div") as HTMLElement;
		const content = scroller.querySelector("div") ?? scroller;
		const message = document.createElement("div");
		message.id = "message-m1";
		content.append(message);
		for (let i = 0; i < 3; i++) await act(async () => await Promise.resolve());
		assert.ok(message.classList.contains("lh-source-highlight"), "the linked message is flashed without any timer firing");
	} finally {
		mock.timers.reset();
		await act(async () => root.unmount());
	}
});
