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

/** Where the hybrid topic page resumes a lesson, in or around its
 *  composer (spec: components/unit-inbox/topic-page/resume/resume.md). */
export const RESUME_OPTIONS = ["line", "target", "chips"] as const;
/** "current" keeps the hybrid's composer as the other candidates have it. */
export type ResumeVariant = "current" | (typeof RESUME_OPTIONS)[number];

/** Where the hybrid topic page puts the lesson to pick up: in its history,
 *  sorted by relevance (spec:
 *  components/unit-inbox/topic-page/pickup/pickup.md). */
export const PICKUP_OPTIONS = ["sections", "block"] as const;
/** "current" keeps the hybrid's dated history. */
export type PickupVariant = "current" | (typeof PICKUP_OPTIONS)[number];

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Design is Current or Proposed; Home is Current or one of its
 *  options, Sidebar Current or Proposed, and anything but Current wears
 *  Design's Proposed; Topic is Current or one of the topic page's
 *  candidates; Resume is Current or one of the hybrid topic page's resume
 *  options, and wears Topic's hybrid; Pick up is Current or one of its
 *  options, wears Topic's hybrid and turns Resume to Current, since its
 *  pane holds the action the Resume options put in the composer. Read
 *  only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", options: HOME_OPTIONS, requires: { design: "proposed" } },
	{ id: "sidebar", label: "Sidebar", requires: { design: "proposed" } },
	{ id: "topic", label: "Topic", options: TOPIC_OPTIONS, requires: { design: "proposed" } },
	{ id: "resume", label: "Resume", options: RESUME_OPTIONS, requires: { design: "proposed", topic: "hybrid" } },
	{ id: "pickup", label: "Pick up", options: PICKUP_OPTIONS, requires: { design: "proposed", topic: "hybrid", resume: "current" } },
];

const DEV = process.env.NODE_ENV === "development";
const subscribeNever = () => () => {};
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");
const readHomeCurrent = (): HomeVariant => "current";
const readHome = (): HomeVariant => HOME_OPTIONS.find((option) => option === polishVariant("home")) ?? "current";
const readTopicCurrent = (): TopicVariant => "current";
const readTopic = (): TopicVariant => TOPIC_OPTIONS.find((option) => option === polishVariant("topic")) ?? "current";
const readResumeCurrent = (): ResumeVariant => "current";
const readResume = (): ResumeVariant => RESUME_OPTIONS.find((option) => option === polishVariant("resume")) ?? "current";
const readPickupCurrent = (): PickupVariant => "current";
const readPickup = (): PickupVariant => PICKUP_OPTIONS.find((option) => option === polishVariant("pickup")) ?? "current";
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

/** Where the hybrid topic page resumes a lesson, or "current" for the
 *  composer alone. Production builds get "current". */
export function useResumeVariant(): ResumeVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readResume : readResumeCurrent, readResumeCurrent);
}

/** Where the hybrid topic page puts the lesson to pick up, or "current"
 *  for its dated history. Production builds get "current". */
export function usePickupVariant(): PickupVariant {
	return useSyncExternalStore(DEV ? onPolishChange : subscribeNever, DEV ? readPickup : readPickupCurrent, readPickupCurrent);
}
