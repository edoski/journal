import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { useModelStatus } from "../components/model-status.ts";
import { useModelSetup } from "../components/setup-cta.tsx";
import { notifySettingsSaved } from "../components/settings-signal.ts";
import { SidebarProvider } from "../components/sidebar.tsx";
import { ChatGPTConnection, ChatGPTUIProvider } from "../components/settings/chatgpt-connection.tsx";
import type { ModelStatus, ChatGPTStatus } from "../src/core/index.ts";
const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, HTMLFormElement: (dom.window as unknown as Record<string, unknown>).HTMLFormElement ?? class {}, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true, localStorage: { getItem: () => null, setItem() {} } });
const originalFetch = globalThis.fetch;
let root: Root | undefined, host: HTMLDivElement | undefined;
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function body(account: string, connected = true): ModelStatus {
 return { account, connected, contextWindow: 8192 };
}
let snapshots: Record<string, { status?: ModelStatus; unconnected: boolean }> = {};
function Reader({ id }: { id: string }) {
 const { status } = useModelStatus();
 snapshots[id] = { status, unconnected: useModelSetup().unconnected };
 return <span data-testid={id}>{status ? status.account : "unavailable"}</span>;
}
async function mount(children: React.ReactNode) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(children)); }
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; globalThis.fetch = originalFetch; delete window.lh; snapshots = {}; });

test("one shared status read serves every reader; a sign-in change or account switch re-reads it and fences the older reply", async () => {
 const requests: ReturnType<typeof deferred<Response>>[] = [];
 globalThis.fetch = async (input) => { assert.equal(input, "/api/models"); const request = deferred<Response>(); requests.push(request); return request.promise; };
 await mount(<><Reader id="first" /><Reader id="second" /></>);
 assert.equal(requests.length, 1);
 await act(async () => requests[0]!.resolve(Response.json(body("claude-subscription"))));
 for (const value of Object.values(snapshots)) { assert.equal(value.unconnected, false); assert.equal(value.status?.account, "claude-subscription"); }
 await act(async () => notifySettingsSaved("claude"));
 assert.equal(requests.length, 2);
 await act(async () => notifySettingsSaved("keys"));
 assert.equal(requests.length, 3);
 await act(async () => requests[2]!.resolve(Response.json(body("claude-subscription-work", false))));
 await act(async () => requests[1]!.resolve(Response.json(body("stale"))));
 for (const value of Object.values(snapshots)) { assert.equal(value.status?.account, "claude-subscription-work"); assert.equal(value.unconnected, true); }
 assert(!document.body.textContent?.includes("stale"));
});

test("root-lifetime safe bridge publishes with Connections unmounted; commands/panel pushes do not duplicate global signals", async () => {
 let pushes: (() => void)[] = [], subscriptions = 0, unsubscriptions = 0, fetches = 0;
 const safe: ChatGPTStatus = { available: true, pending: false, allowBackgroundUse: false, activeId: "a", accounts: [{ id: "a", email: "dummy@example.invalid", registration: "oaiapp_dummy", connected: true, planEnabled: true }], error: null };
 window.lh = { expandWindow() {}, chatgpt: { status: async () => safe, login: async () => safe, cancel: async () => safe, select: async () => safe, disconnect: async () => safe, logout: async () => safe, consent: async () => safe, onChange: (cb) => { subscriptions++; pushes.push(cb); return () => { unsubscriptions++; pushes = pushes.filter((c) => c !== cb); }; } } };
 globalThis.fetch = async (input) => { assert.equal(input, "/api/models"); fetches++; return Response.json(body(`claude-subscription-${fetches}`)); };
 await mount(<SidebarProvider><Reader id="root" /></SidebarProvider>);
 assert.equal(subscriptions, 1);
 const before = fetches;
 await act(async () => { for (const callback of pushes) callback(); });
 assert.equal(fetches, before + 1);
 await act(async () => root!.render(<SidebarProvider><Reader id="root" /><ChatGPTUIProvider><ChatGPTConnection /></ChatGPTUIProvider></SidebarProvider>));
 assert.equal(subscriptions, 2);
 const mounted = fetches;
 await act(async () => { for (const callback of pushes) callback(); });
 assert.equal(fetches, mounted + 1, "one global publisher even when panel also reads pushed status");
 await act(async () => root!.render(<SidebarProvider><Reader id="root" /></SidebarProvider>));
 assert.equal(unsubscriptions, 1);
 await act(async () => { for (const callback of pushes) callback(); });
 assert.equal(fetches, mounted + 2);
});
