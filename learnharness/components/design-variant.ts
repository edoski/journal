"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

/** How the hybrid topic page ties its list to the lesson map (spec: components/unit-inbox/topic-page/link/link.md). */
export const LINK_OPTIONS = ["split", "connected"] as const;
/** "current" keeps the two panes side by side with nothing between them. */
export type LinkVariant = "current" | (typeof LINK_OPTIONS)[number];

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Link is the topic page's panes as they are or one of its
 *  options. Every other surface has one version. Read only through the
 *  hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "link", label: "Link", options: LINK_OPTIONS },
];

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
const readLinkCurrent = (): LinkVariant => "current";
const readLink = (): LinkVariant => LINK_OPTIONS.find((option) => option === polishVariant("link")) ?? "current";
/** How the hybrid topic page ties its list to the lesson map, or "current"
 *  for nothing between them. Production builds get "current". */
export function useLinkVariant(): LinkVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readLink : readLinkCurrent, readLinkCurrent);
}
