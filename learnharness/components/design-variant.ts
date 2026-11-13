"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

export type DesignVariant = "current" | "proposed";

/** The study homes `/` can be, one per candidate (spec:
 *  components/study-home/study-home.md). */
export const HOME_OPTIONS = ["agenda", "split", "map", "path"] as const;
/** "current" keeps `/` the composer; an option makes it that study home. */
export type HomeVariant = "current" | (typeof HOME_OPTIONS)[number];

/** The topic page's candidates (spec:
 *  components/unit-inbox/topic-page/topic-page.md). */
export const TOPIC_OPTIONS = ["brief", "steps", "trail", "hybrid"] as const;
/** "current" keeps the topic page as it is. */
export type TopicVariant = "current" | (typeof TOPIC_OPTIONS)[number];

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Design is Current or Proposed; Home is Current or one of its
 *  options, Sidebar Current or Proposed, and anything but Current wears
 *  Design's Proposed; Topic is Current or one of the topic page's
 *  candidates. Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", options: HOME_OPTIONS, requires: { design: "proposed" } },
	{ id: "sidebar", label: "Sidebar", requires: { design: "proposed" } },
	{ id: "topic", label: "Topic", options: TOPIC_OPTIONS, requires: { design: "proposed" } },
];

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");
const readHomeCurrent = (): HomeVariant => "current";
const readHome = (): HomeVariant => HOME_OPTIONS.find((option) => option === polishVariant("home")) ?? "current";
const readTopicCurrent = (): TopicVariant => "current";
const readTopic = (): TopicVariant => TOPIC_OPTIONS.find((option) => option === polishVariant("topic")) ?? "current";
const readSidebar = (): DesignVariant => (polishVariant("sidebar") === "proposed" ? "proposed" : "current");

/** The one reader of the design switch: "proposed" only in development with the guide on Proposed.
 *  Production builds always get "current" until a surface ships. */
export function useDesignVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSwitch : readCurrent, readCurrent);
}

/** Which study home `/` is, or "current" while it stays the composer.
 *  Production builds get "current". */
export function useHomeVariant(): HomeVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readHome : readHomeCurrent, readHomeCurrent);
}

/** Whether the Proposed design's sidebar lists course topics ("proposed",
 *  spec: components/unit-inbox/unit-inbox.md) or stays as it is
 *  ("current"). Production builds get "current". */
export function useSidebarVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readSidebar : readCurrent, readCurrent);
}

/** Which topic page `/unit/...` draws, or "current" for the page as it is.
 *  Production builds get "current". */
export function useTopicVariant(): TopicVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readTopic : readTopicCurrent, readTopicCurrent);
}
