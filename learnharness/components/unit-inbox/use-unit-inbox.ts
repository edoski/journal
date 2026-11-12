"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ChatListItem, StudyCourse, StudyListing } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { buildInbox, type Shelf, type UnitInbox } from "@/components/unit-inbox/units";

/** Without the engine every session is listed under Other. */
export type InboxState = { status: "loading" } | { status: "ready"; inbox: UnitInbox; courses: readonly StudyCourse[] };

/** Every course's map, read once per mount and again after a turn settles
 *  (a lesson's saves move levels and reviews). A failed read keeps the
 *  last map. */
function useStudyCourses(): StudyCourse[] | null | "unavailable" {
	const [courses, setCourses] = useState<StudyCourse[] | null | "unavailable">(null);
	const read = useCallback(async () => {
		try {
			const listing = (await (await fetch("/api/study", { cache: "no-store" })).json()) as StudyListing;
			setCourses(listing.available ? listing.courses : "unavailable");
		} catch {
			setCourses((prev) => prev ?? "unavailable");
		}
	}, []);
	useEffect(() => void read(), [read]);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const later = () => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => void read(), 1000);
	};
	useEffect(() => () => clearTimeout(timer.current), []);
	useServerEvent("turn-settled", later);
	useServerEvent("record-changed", later);
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
	const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(key), () => null);
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

/** Which shelves are folded. Learning and Review start open, Known and
 *  Other start folded: the inbox shows what to do, the rest one click away. */
export type Folded = Readonly<Record<Shelf | "other", boolean>>;
const FOLDED: Folded = { learning: false, review: false, known: true, other: true };
const parseFolded = (raw: string | null): Folded => {
	const v = json(raw);
	return typeof v === "object" && v !== null ? { ...FOLDED, ...(v as Partial<Folded>) } : FOLDED;
};

/** The sidebar's inbox over the session list it already holds: the course
 *  scope (every course, or one), and the folded shelves. */
export function useUnitInbox(chats: readonly ChatListItem[] | null) {
	const courses = useStudyCourses();
	const [storedScope, setScope] = useStored("lh:unit-inbox-scope", parseScope);
	const [folded, setFolded] = useStored("lh:unit-inbox-folded", parseFolded);
	const scope = Array.isArray(courses) && courses.some((c) => c.map.workspace === storedScope) ? storedScope : null;
	const state = useMemo<InboxState>(() => {
		if (courses === null || chats === null) return { status: "loading" };
		const listed = courses === "unavailable" ? [] : courses;
		return { status: "ready", inbox: buildInbox(listed, chats, scope), courses: listed };
	}, [courses, chats, scope]);
	const fold = useCallback((shelf: Shelf | "other", next: boolean) => setFolded({ ...folded, [shelf]: next }), [folded, setFolded]);
	return { state, scope, setScope, folded, fold };
}
