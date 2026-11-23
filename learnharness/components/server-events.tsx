"use client";

/**
 * THE NOTIFICATION CHANNEL'S CLIENT HALF (push-architecture slice 3,
 * 2026-10-02): ONE EventSource("/api/events") per open window, held for
 * the window's lifetime — the channel that retires the app's poll
 * lattice. Every server-initiated change arrives as a named SSE frame;
 * consumers respond by fetching truth (notify → fetch, the architecture's
 * whole trick — see src/core/events.ts and server/events-stream.ts).
 *
 * This file is the ONE place in the app that knows EventSource exists.
 * Auto-reconnect is EventSource's own, and where it gives up for good (an
 * answer that is not its stream) the channel opens a new one
 * (openEventsChannel): every (re)open fires the resync callbacks, so a reconnect heals with
 * one ordinary fetch per consumer (a dev-server restart self-heals here).
 *
 * Shape: the provider holds a hub (window-local fan-out — the client twin
 * of the server bus; per-window, NOT globalThis: each window's connection
 * is its own) and wires ONE source into it. The hooks are thin: latest-ref
 * callbacks (events fire between renders — never trust a stale closure)
 * plus hub membership for the component's lifetime.
 *
 * TEST SEAM: `connect` injects the source factory — the hub + wiring are
 * plain functions the tests drive directly (no React, no server); the
 * React glue is an adapter seam like lh:turn-state (untested by
 * precedent, components/session.ts).
 */
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { EVENTS_RETRY_MS, SERVER_EVENT_TYPES, type ServerEventType, type ServerEvents } from "@/src/core";

/** The minimal source surface the provider consumes — EventSource behind
 *  this in production, fakes in tests. */
export interface NotifySource {
	close(): void;
	onOpen(cb: () => void): void;
	onEvent(name: string, cb: (data: string) => void): void;
}

/** The minimal EventSource surface the channel drives (a fake in tests). */
export interface EventStream {
	readonly readyState: number;
	onopen: ((ev: Event) => void) | null;
	onerror: ((ev: Event) => void) | null;
	addEventListener(name: string, cb: (ev: Event) => void): void;
	close(): void;
}

/** EventSource's CLOSED state: it gave up and will not reconnect. */
const CLOSED = 2;

/**
 * The window's channel. EventSource reconnects by itself after a dropped
 * connection, but gives up for good on any answer that is not its stream (a
 * restarting app answering an error, a proxy's 502): round 8 found the
 * lesson sitting about 29 s after a restart before it resumed. So when it
 * gives up, the channel opens a new one after the server's `retry` wait,
 * once per failure, until one opens; every open fires the resyncs as any
 * reconnect does.
 */
export function openEventsChannel(open: () => EventStream = () => new EventSource("/api/events"), later: (run: () => void, ms: number) => unknown = setTimeout): NotifySource {
	const opens: (() => void)[] = [];
	const events: [string, (data: string) => void][] = [];
	let closed = false;
	let es: EventStream;
	const connect = () => {
		if (closed) return;
		es = open();
		es.onopen = () => opens.forEach((cb) => cb());
		es.onerror = () => {
			if (es.readyState === CLOSED && !closed) later(connect, EVENTS_RETRY_MS);
		};
		for (const [name, cb] of events) es.addEventListener(name, (ev) => cb((ev as MessageEvent).data));
	};
	connect();
	return {
		close: () => {
			closed = true;
			es.close();
		},
		onOpen: (cb) => void opens.push(cb),
		onEvent: (name, cb) => {
			events.push([name, cb]);
			es.addEventListener(name, (ev) => cb((ev as MessageEvent).data));
		},
	};
}

/** The per-window fan-out: typed subscriptions over one source. Listener
 *  errors are isolated per the bus's law (one bad consumer never breaks
 *  the window), and dispatch iterates a snapshot (an unsubscribe during
 *  dispatch is safe). */
export function createNotifyHub() {
	const byType = new Map<string, Set<(data: never) => void>>();
	const resyncs = new Set<() => void>();
	return {
		subscribe<K extends ServerEventType>(type: K, cb: (payload: ServerEvents[K]) => void) {
			const set = byType.get(type) ?? new Set<(data: never) => void>();
			byType.set(type, set);
			const slot = cb as unknown as (data: never) => void;
			set.add(slot);
			return () => set.delete(slot);
		},
		/** Resync callbacks: fired on the source's every (re)open — "you may
		 *  have missed events while disconnected; refetch". A consumer that
		 *  mounts while ALREADY open gets no fire (it missed nothing by
		 *  birth); its own mount fetch is its initial truth. */
		onResync(cb: () => void) {
			resyncs.add(cb);
			return () => resyncs.delete(cb);
		},
		/** One named frame arrived: parse, fan out. Unparseable frames are
		 *  dropped loudly — the channel's payloads are tiny and schemaless,
		 *  a bad frame must never half-fire. */
		dispatch(name: string, raw: string) {
			const set = byType.get(name);
			if (!set) return;
			let payload: unknown;
			try {
				payload = JSON.parse(raw);
			} catch (err) {
				console.error(`[events] unparseable frame for ${name}:`, err);
				return;
			}
			for (const cb of [...set]) {
				try {
					(cb as unknown as (data: unknown) => void)(payload);
				} catch (err) {
					console.error(`[events] ${name} handler failed:`, err);
				}
			}
		},
		fireOpen() {
			for (const cb of [...resyncs]) {
				try {
					cb();
				} catch (err) {
					console.error("[events] resync handler failed:", err);
				}
			}
		},
	};
}

/** Wire one source into a hub — the provider's ENTIRE effect body, factored
 *  out so the wiring is testable without React. Returns the disconnect. */
export function wireSource(source: NotifySource, hub: ReturnType<typeof createNotifyHub>): () => void {
	for (const name of SERVER_EVENT_TYPES) source.onEvent(name, (raw) => hub.dispatch(name, raw));
	source.onOpen(() => hub.fireOpen());
	return () => source.close();
}

// ── the React glue ──────────────────────────────────────────────────────────

const EventsContext = createContext<ReturnType<typeof createNotifyHub> | null>(null);

/** Transport adapters may also be mounted in isolation with an injected bridge. */
export function useNotifyHub() { return useContext(EventsContext); }

export function ServerEventsProvider({ children, connect }: { children: ReactNode; connect?: () => NotifySource }) {
	const hub = useMemo(() => createNotifyHub(), []);
	useEffect(() => wireSource((connect ?? openEventsChannel)(), hub), [hub, connect]);
	useEffect(() => {
		const off = hub.subscribe("courses-changed", (p) => void (p.deleted && deletedHere.add(p.deleted)));
		return () => void off();
	}, [hub]);
	return <EventsContext.Provider value={hub}>{children}</EventsContext.Provider>;
}

/** The courses this window heard deleted. Back serves a lesson's page as
 *  it was before its course was deleted, so the page reads this to draw
 *  the deleted notice from its first frame, not after a course read that
 *  took seconds under load (round 20, m15: a live "Your answer" box for
 *  about 3 s). */
const deletedHere = new Set<string>();

export function deletedInThisWindow(workspace: string | undefined): boolean {
	return workspace !== undefined && deletedHere.has(workspace);
}

/** Subscribe to one event type for this component's lifetime. The callback
 *  is a latest-ref: pass inline closures freely — the freshest render's
 *  closure runs, so state captured at the last completed render is safe to
 *  read (the provider re-stores it every render). */
export function useServerEvent<K extends ServerEventType>(type: K, cb: (payload: ServerEvents[K]) => void): void {
	const hub = useContext(EventsContext);
	if (!hub) throw new Error("useServerEvent requires <ServerEventsProvider>");
	const cbRef = useRef(cb);
	cbRef.current = cb;
	useEffect(() => {
		const off = hub.subscribe(type, (payload) => cbRef.current(payload));
		return () => {
			off();
		};
	}, [hub, type]);
}

/** Refetch truth on every (re)connect of the window's channel — the
 *  self-heal seam for EventSource reconnects and dev-server restarts. */
export function useServerResync(cb: () => void): void {
	const hub = useContext(EventsContext);
	if (!hub) throw new Error("useServerResync requires <ServerEventsProvider>");
	const cbRef = useRef(cb);
	cbRef.current = cb;
	useEffect(() => {
		const off = hub.onResync(() => cbRef.current());
		return () => {
			off();
		};
	}, [hub]);
}
