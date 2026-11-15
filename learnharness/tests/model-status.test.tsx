import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { useModelStatus } from "../components/model-status.ts";
import { useModelSetup } from "../components/setup-cta.tsx";
import { notifySettingsSaved } from "../components/settings-signal.ts";
import type { ModelStatus } from "../src/core/index.ts";
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
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; globalThis.fetch = originalFetch; snapshots = {}; });

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

test("a forced refresh re-checks the sign-in on the server and counts as a fresh read (round 10, 4 minor 1)", async () => {
 const paths: string[] = [];
 globalThis.fetch = async (input) => { paths.push(String(input)); return Response.json(body("claude-subscription")); };
 let latest: ReturnType<typeof useModelStatus> | undefined;
 function Probe() { latest = useModelStatus(); return null; }
 await mount(<Probe />);
 const before = latest!.read;
 await act(async () => latest!.refresh(true));
 assert.equal(paths.at(-1), "/api/models?refresh=1");
 assert.ok(latest!.read > before, "each landed read counts, so a watcher knows a read came after its moment");
});

test("a turn that runs while the status says signed out re-reads it, so the pill leaves with a success (round 10, 4 minor 1, 55)", async () => {
 let connected = false;
 globalThis.fetch = async () => Response.json(body("claude-subscription", connected));
 let unconnected: boolean | undefined;
 function Pill({ working }: { working: boolean }) { unconnected = useModelSetup(working).unconnected; return null; }
 await mount(<Pill working={false} />);
 assert.equal(unconnected, true);
 connected = true;
 await act(async () => root!.render(<Pill working={true} />));
 await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
 assert.equal(unconnected, false);
});
