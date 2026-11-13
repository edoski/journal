"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarListing, ChatListItem } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";

export type CalendarRead =
	| { status: "loading" }
	| { status: "unavailable"; reason: string }
	| { status: "ready"; listing: Extract<CalendarListing, { available: true }>; chats: ChatListItem[] };

/** The courses with their run-ups, the Journal's study windows and every
 *  session, read once per mount and again after a turn settles, a record
 *  changes or the session list changes. A failed read keeps the last. */
export function useCalendarRead(): CalendarRead {
	const [read, setRead] = useState<CalendarRead>({ status: "loading" });
	const load = useCallback(async () => {
		try {
			const [listing, { chats }] = await Promise.all([
				fetch("/api/calendar", { cache: "no-store" }).then((r) => r.json() as Promise<CalendarListing>),
				fetch("/api/chats", { cache: "no-store" }).then((r) => r.json() as Promise<{ chats: ChatListItem[] }>),
			]);
			setRead(listing.available ? { status: "ready", listing, chats } : { status: "unavailable", reason: listing.reason });
		} catch {
			setRead((prev) => (prev.status === "loading" ? { status: "unavailable", reason: "The calendar could not be read" } : prev));
		}
	}, []);
	useEffect(() => void load(), [load]);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const later = () => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => void load(), 1000);
	};
	useEffect(() => () => clearTimeout(timer.current), []);
	useServerEvent("turn-settled", later);
	useServerEvent("record-changed", later);
	useServerEvent("chats-changed", later);
	useServerResync(() => void load());
	return read;
}
