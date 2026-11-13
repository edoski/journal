"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, setPolishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

/** Whether the linked columns draw the line from the selected row to its
 *  node (spec: components/linked-columns/linked-columns.md): Current is
 *  the two columns with no tie, Connected draws it. */
export const LINK_OPTIONS = ["connected"] as const;
export type LinkVariant = "current" | (typeof LINK_OPTIONS)[number];
/** What anyone who has not picked sees, and what production builds draw
 *  (Edo, 14 Nov 2026). */
const LINK_DEFAULT: LinkVariant = "connected";

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Link is whether the course page and the topic page tie their
 *  list to their map with a line. Every other surface has one version.
 *  Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [{ id: "link", label: "Link", options: LINK_OPTIONS }];

/** A group nobody has picked (or set to an option since deleted, such as
 *  the topic page's `split`) starts on its default rather than Current,
 *  so the guide shows what the app draws. The registry is the one place
 *  that reads the switch's storage; the dev host calls this once it has
 *  registered the groups. */
export function seedDefaults(): void {
	try {
		const stored = localStorage.getItem("polish:link");
		const known = stored === "current" || LINK_OPTIONS.some((option) => option === stored);
		if (!known && !new URLSearchParams(location.search).has("polish-link")) setPolishVariant("link", LINK_DEFAULT);
	} catch {
		// No storage: the hooks read the default.
	}
}

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
/** A switch moved, or the guide registered the groups: before it does, a
 *  group's options read as Current, so a page drawn before then reads
 *  again once they are known. */
function subscribeSwitch(onChange: () => void): () => void {
	const off = onPolishChange(onChange);
	window.addEventListener("polish:host", onChange);
	return () => {
		off();
		window.removeEventListener("polish:host", onChange);
	};
}
const readLinkDefault = (): LinkVariant => LINK_DEFAULT;
/** Current only once picked: before the guide registers the group, or with
 *  nothing stored, the default. */
function readLink(): LinkVariant {
	const value = polishVariant("link");
	if (value === "connected") return value;
	try {
		const picked = new URLSearchParams(location.search).get("polish-link") ?? localStorage.getItem("polish:link");
		return picked === "current" ? "current" : LINK_DEFAULT;
	} catch {
		return LINK_DEFAULT;
	}
}
/** Whether the course page and the topic page draw the tie's line.
 *  Production builds draw it. */
export function useLinkVariant(): LinkVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readLink : readLinkDefault, readLinkDefault);
}
