"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ChatListItem, StudyCourse, StudyListing, UnreadableCourse } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { useDayChange } from "@/components/day-change";
import { buildInbox, type FoldedShelf, type UnitInbox } from "@/components/unit-inbox/units";
import { withLessonHere } from "@/components/study-home/study-facts";

/** Without the engine every session is listed under Other, and
 *  `unavailable` says the courses could not be read. `chats` is the
 *  session list the inbox was built from; `unreadable` the courses whose
 *  record the engine could not read, under the course filter. */
export type InboxState =
	| { status: "loading" }
	| {
			status: "ready";
			inbox: UnitInbox;
			courses: readonly StudyCourse[];
			unreadable: readonly UnreadableCourse[];
			chats: readonly ChatListItem[];
			unavailable: boolean;
	  };

type StudyRead = { courses: StudyCourse[]; failed: UnreadableCourse[] };

/** Every course's map, read once per mount and again whenever a course
 *  record changes, a course is added, renamed or deleted, or the day turns
 *  over. Reads never overlap: an event during a read asks for one more
 *  read when it ends, so a burst of events costs at most two. A failed read
 *  keeps the last map. */
function useStudyCourses(): StudyRead | null | "unavailable" {
	const [courses, setCourses] = useState<StudyRead | null | "unavailable">(null);
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
				setCourses(listing.available ? { courses: listing.courses, failed: listing.failed } : "unavailable");
			} catch {
				setCourses((prev) => prev ?? "unavailable");
			}
		} while (again.current);
		reading.current = false;
	}, []);
	useEffect(() => void read(), [read]);
	useServerEvent("course-changed", () => void read());
	useServerEvent("courses-changed", () => void read());
	useServerResync(() => void read());
	useDayChange(() => void read());
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
	const [storedScope, setScope] = useStored("lh:unit-inbox-scope", parseScope);
	const [folded, setFolded] = useStored("lh:topic-sidebar-folded", parseFolded);
	const read = courses === "unavailable" ? null : courses;
	const scope = read?.courses.some((c) => c.map.workspace === storedScope) ? storedScope : null;
	const state = useMemo<InboxState>(() => {
		if (courses === null || chats === null) return { status: "loading" };
		// "You are here" as Home places it (round 14, m6).
		const listed = withLessonHere(read?.courses ?? [], chats);
		const unreadable = scope === null ? (read?.failed ?? []) : [];
		return { status: "ready", inbox: buildInbox(listed, chats, scope), courses: listed, unreadable, chats, unavailable: courses === "unavailable" };
	}, [courses, read, chats, scope]);
	const fold = useCallback((shelf: FoldedShelf, next: boolean) => setFolded({ ...folded, [shelf]: next }), [folded, setFolded]);
	return { state, scope, setScope, folded, fold };
}
