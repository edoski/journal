import { useCallback, useEffect, useRef, useState } from "react";
import { useServerEvent } from "@/components/server-events";
import type { SessionStatus } from "@/components/session-core";

/** What the lesson's busy look (its working line, Stop and box) reads. */
export interface BusyFacts {
	/** This view's own stream runs (its send, or an attached replay). */
	localStream: boolean;
	/** A server turn this view is attaching to (chat.tsx turnInFlight). */
	attached: boolean;
	/** The server's own fact, the one the sidebar's "Tutor writing" reads:
	 *  a turn of this chat began and has not settled. */
	serverTurn: boolean;
	/** The server is setting up a turn it starts itself (a handoff's next
	 *  agent, a job's result). */
	waking: boolean;
	/** He stopped the reply, and the turn it stopped has not settled. */
	stopAsked: boolean;
}

/** Whether the lesson looks busy. One fact for every part of it, the
 *  server's own included (round 14, 3 M2: after the probe's last answer,
 *  29 s with no status, no Stop and an open box, while the sidebar said
 *  "Tutor writing"; 3 free: the box's words flickered between the two
 *  agents of a handoff). His stop ends it at once (4 minor 10). Pure. */
export function lessonBusy(f: BusyFacts): boolean {
	return f.localStream || ((f.attached || f.serverTurn || f.waking) && !f.stopAsked);
}

/**
 * The session's busy fact, from the server's turn events for this chat:
 * every turn's turn-started and turn-settled, a turn this view never
 * attached to included, and turn-waking for a turn it sets up itself.
 *
 * A handoff's next agent begins as the turn before it closes, so its
 * turn-started reaches the view while the view's own stream is still
 * ending, and the view cannot attach then. When that stream ends with the
 * fact still up, `attachIfRunning` asks the record and attaches; busy
 * holds meanwhile, so nothing between the two turns looks finished.
 */
export function useSessionBusy(o: {
	chatId: string;
	status: SessionStatus;
	attached: boolean;
	initiallyInFlight: boolean;
	attachIfRunning: () => void;
	/** The connection dropped the turn this view read, and nothing says yet
	 *  what became of it. */
	dropped?: boolean;
}) {
	const [serverTurn, setServerTurn] = useState(o.initiallyInFlight);
	const [waking, setWaking] = useState(false);
	const [stopAsked, setStopAsked] = useState(false);
	const serverTurnRef = useRef(serverTurn);
	serverTurnRef.current = serverTurn;
	// A dropped connection leaves the turn's fact unknown: no settle may
	// ever come (the app restarted), so the lesson stops looking busy, and
	// the heal asks the record (round 15, m20: "Thinking…" and Stop stood
	// through the outage under "Press Enter to try again").
	useEffect(() => {
		if (!o.dropped) return;
		setServerTurn(false);
		setWaking(false);
	}, [o.dropped]);
	useServerEvent("turn-started", (p) => {
		if (p.chatId === o.chatId) setServerTurn(true);
	});
	useServerEvent("turn-settled", (p) => {
		if (p.chatId !== o.chatId) return;
		setServerTurn(false);
		setStopAsked(false);
	});
	useServerEvent("turn-waking", (p) => {
		if (p.chatId === o.chatId) setWaking(p.waking);
	});
	const attachRef = useRef(o.attachIfRunning);
	attachRef.current = o.attachIfRunning;
	const prevStatus = useRef(o.status);
	useEffect(() => {
		const ended = prevStatus.current !== "ready" && o.status === "ready";
		prevStatus.current = o.status;
		if (ended && serverTurnRef.current) attachRef.current();
	}, [o.status]);
	const localStream = o.status === "submitted" || o.status === "streaming";
	return {
		busy: lessonBusy({ localStream, attached: o.attached, serverTurn, waking, stopAsked }),
		/** Read at call time by the resync and the ready flip. */
		serverTurnRef,
		/** His stop: the reply reads as stopped until its turn settles. */
		askStop: useCallback(() => setStopAsked(true), []),
		/** Nothing ran to stop: the record decides. */
		stopSpent: useCallback(() => setStopAsked(false), []),
		/** The record says no turn runs: a settle this view missed. */
		noTurnRunning: useCallback(() => setServerTurn(false), []),
	};
}
