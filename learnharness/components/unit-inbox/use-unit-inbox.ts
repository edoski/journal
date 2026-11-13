"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ChatListItem, StudyCourse, StudyListing } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { buildInbox, linkStarts, type FoldedShelf, type TopicStarts, type UnitInbox } from "@/components/unit-inbox/units";

/** Without the engine every session is listed under Other, and
 *  `unavailable` says the courses could not be read. `chats` is the
 *  session list with each session started on a topic's page linked to it. */
export type InboxState =
	| { status: "loading" }
	| { status: "ready"; inbox: UnitInbox; courses: readonly StudyCourse[]; chats: readonly ChatListItem[]; unavailable: boolean };

/** Every course's map, read once per mount and again whenever a turn
 *  settles or a course record changes (a lesson's saves move levels and
 *  reviews). Reads never overlap: an event during a read asks for one more
 *  read when it ends, so a burst of events costs at most two. A failed read
 *  keeps the last map. */
function useStudyCourses(): StudyCourse[] | null | "unavailable" {
	const [courses, setCourses] = useState<StudyCourse[] | null | "unavailable">(null);
	const reading = useRef(false);
	const again = useRef(false);
	const read = useCallback(async () => {
		if (reading.current) {
			again.current = true;
			return;
		}
		reading.current = true;
		do {
			again.current = false;
			try {
				const listing = (await (await fetch("/api/study", { cache: "no-store" })).json()) as StudyListing;
				setCourses(listing.available ? listing.courses : "unavailable");
			} catch {
				setCourses((prev) => prev ?? "unavailable");
			}
		} while (again.current);
		reading.current = false;
	}, []);
	useEffect(() => void read(), [read]);
	useServerEvent("turn-settled", () => void read());
	useServerEvent("record-changed", () => void read());
	useServerResync(() => void read());
	return courses;
}

/** One stored value, kept across windows and launches. */
function useStored<T>(key: string, parse: (raw: string | null) => T): [T, (next: T) => void] {
	const event = `lh:stored:${key}`;
	const subscribe = useCallback(
		(onChange: () => void) => {
			window.addEventListener("storage", onChange);
			window.addEventListener(event, onChange);
			return () => {
				window.removeEventListener("storage", onChange);
				window.removeEventListener(event, onChange);
			};
		},
		[event],
	);
	const raw = useSyncExternalStore(
		subscribe,
		() => localStorage.getItem(key),
		() => null,
	);
	const value = useMemo(() => parse(raw), [parse, raw]);
	const set = useCallback(
		(next: T) => {
			localStorage.setItem(key, JSON.stringify(next));
			window.dispatchEvent(new Event(event));
		},
		[key, event],
	);
	return [value, set];
}

function json(raw: string | null): unknown {
	try {
		return JSON.parse(raw ?? "null");
	} catch {
		return null;
	}
}

const parseScope = (raw: string | null): string | null => {
	const v = json(raw);
	return typeof v === "string" ? v : null;
};

const parseStarts = (raw: string | null): TopicStarts => {
	const v = json(raw);
	return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as TopicStarts) : {};
};

/** The sessions started on a topic's page (units.ts TopicStarts), and the
 *  call that records one. */
export function useTopicStarts(): [TopicStarts, (chatId: string, handle: string) => void] {
	const [starts, setStarts] = useStored("lh:topic-starts", parseStarts);
	const record = useCallback((chatId: string, handle: string) => setStarts({ ...starts, [chatId]: handle }), [starts, setStarts]);
	return [starts, record];
}

/** Which shelves are folded. Every shelf starts folded, as T3 Code's do:
 *  the list shows what to do, the rest one click away. */
export type Folded = Readonly<Record<FoldedShelf, boolean>>;
const FOLDED: Folded = { working: true, learning: true, known: true, other: true };
const parseFolded = (raw: string | null): Folded => {
	const v = json(raw);
	return typeof v === "object" && v !== null ? { ...FOLDED, ...(v as Partial<Folded>) } : FOLDED;
};

/** The sidebar's topics over the session list it already holds, with the
 *  sessions started on a topic's page linked to it: the course filter
 *  (every course, or one), and the folded shelves. */
export function useUnitInbox(chats: readonly ChatListItem[] | null) {
	const courses = useStudyCourses();
	const [starts] = useTopicStarts();
	const [storedScope, setScope] = useStored("lh:unit-inbox-scope", parseScope);
	const [folded, setFolded] = useStored("lh:topic-sidebar-folded", parseFolded);
	const scope = Array.isArray(courses) && courses.some((c) => c.map.workspace === storedScope) ? storedScope : null;
	const state = useMemo<InboxState>(() => {
		if (courses === null || chats === null) return { status: "loading" };
		const listed = courses === "unavailable" ? [] : courses;
		const linked = linkStarts(chats, starts);
		return { status: "ready", inbox: buildInbox(listed, linked, scope), courses: listed, chats: linked, unavailable: courses === "unavailable" };
	}, [courses, chats, starts, scope]);
	const fold = useCallback((shelf: FoldedShelf, next: boolean) => setFolded({ ...folded, [shelf]: next }), [folded, setFolded]);
	return { state, scope, setScope, folded, fold };
}
