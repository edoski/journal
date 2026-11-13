"use client";

import { useSyncExternalStore } from "react";
import { onPolishChange, polishVariant, type PolishGroup } from "@/components/dev/polish-variant.js";

export type DesignVariant = "current" | "proposed";

/** The course page's candidates (spec:
 *  components/course-page/course-page.md). */
export const COURSE_OPTIONS = ["list", "map", "brief", "split"] as const;
/** "current" leaves the app with no course page: its address is an unknown
 *  route and course names stay plain text. */
export type CourseVariant = "current" | (typeof COURSE_OPTIONS)[number];

/** The Proposed sidebar's top candidates (spec:
 *  components/unit-inbox/unit-inbox.md, "Inbox switch"). */
export const INBOX_OPTIONS = ["today", "topics"] as const;
/** "current" keeps the Proposed sidebar's list as it is; an option draws
 *  its top as Today's lines (`needsYouNow`). */
export type InboxVariant = "current" | (typeof INBOX_OPTIONS)[number];

/** Home's overview candidates (spec:
 *  components/study-home/home-map.md, "Overview switch"). */
export const OVERVIEW_OPTIONS = ["follow"] as const;
/** "current" keeps Home's map behind course tabs; "follow" shows the
 *  course of the Today row he points at. */
export type OverviewVariant = "current" | (typeof OVERVIEW_OPTIONS)[number];

/** The topic map's node candidates, three card interiors (spec:
 *  components/course-map/topic-map/topic-map.md, "Node switch"): where
 *  he stands on top of the title, a ring beside it, or the card's edge
 *  filling as he learns. */
export const NODE_OPTIONS = ["header", "ring", "edge"] as const;
/** "current" keeps the node as the topic map drew it first. */
export type NodeVariant = "current" | (typeof NODE_OPTIONS)[number];

/** The topic page's candidates (spec:
 *  components/unit-inbox/topic-page/topic-page.md). */
export const TOPIC_OPTIONS = ["brief", "steps", "trail", "hybrid"] as const;
/** "current" keeps the topic page as it is. */
export type TopicVariant = "current" | (typeof TOPIC_OPTIONS)[number];

/** Where the hybrid topic page puts the lesson to pick up: in its history,
 *  sorted by relevance (spec:
 *  components/unit-inbox/topic-page/pickup/pickup.md). */
export const PICKUP_OPTIONS = ["sections"] as const;
/** "current" keeps the hybrid's dated history. */
export type PickupVariant = "current" | (typeof PICKUP_OPTIONS)[number];

/** How the hybrid topic page ties its list to the lesson map under Pick up
 *  (spec: components/unit-inbox/topic-page/link/link.md). */
export const LINK_OPTIONS = ["split", "connected"] as const;
/** "current" keeps the two panes side by side with nothing between them. */
export type LinkVariant = "current" | (typeof LINK_OPTIONS)[number];

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Design is Current or Proposed; Home is the composer or the study
 *  home, Sidebar Current or Proposed, and anything but Current wears
 *  Design's Proposed; Course is no course page or one of its candidates,
 *  each wearing the Proposed design and sidebar; Inbox is the Proposed
 *  sidebar's list as it is or one of its top candidates, each wearing the
 *  Proposed design and sidebar; Node is the topic map's node as it was or
 *  one of its candidates, wherever the topic map draws; Overview is Home's
 *  map behind tabs or following the pointed row; Topic is Current or one of
 *  the topic page's candidates; Pick up is Current or Sections, and wears
 *  Topic's hybrid; Link is Current or one of its options, and wears Pick
 *  up's Sections. Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", requires: { design: "proposed" } },
	{ id: "sidebar", label: "Sidebar", requires: { design: "proposed" } },
	{ id: "course", label: "Course", options: COURSE_OPTIONS, requires: { design: "proposed", sidebar: "proposed" } },
	{ id: "inbox", label: "Inbox", options: INBOX_OPTIONS, requires: { design: "proposed", sidebar: "proposed" } },
	{ id: "node", label: "Node", options: NODE_OPTIONS, requires: { design: "proposed" } },
	{ id: "overview", label: "Overview", options: OVERVIEW_OPTIONS, requires: { design: "proposed", home: "proposed" } },
	{ id: "topic", label: "Topic", options: TOPIC_OPTIONS, requires: { design: "proposed" } },
	{ id: "pickup", label: "Pick up", options: PICKUP_OPTIONS, requires: { design: "proposed", topic: "hybrid" } },
	{ id: "link", label: "Link", options: LINK_OPTIONS, requires: { design: "proposed", topic: "hybrid", pickup: "sections" } },
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
const readCurrent = (): DesignVariant => "current";
const readSwitch = (): DesignVariant => (polishVariant("design") === "proposed" ? "proposed" : "current");
const readHome = (): DesignVariant => (polishVariant("home") === "proposed" ? "proposed" : "current");
const readTopicCurrent = (): TopicVariant => "current";
const readTopic = (): TopicVariant => TOPIC_OPTIONS.find((option) => option === polishVariant("topic")) ?? "current";
const readPickupCurrent = (): PickupVariant => "current";
const readPickup = (): PickupVariant => PICKUP_OPTIONS.find((option) => option === polishVariant("pickup")) ?? "current";
const readLinkCurrent = (): LinkVariant => "current";
const readLink = (): LinkVariant => LINK_OPTIONS.find((option) => option === polishVariant("link")) ?? "current";
const readSidebar = (): DesignVariant => (polishVariant("sidebar") === "proposed" ? "proposed" : "current");
const readCourseCurrent = (): CourseVariant => "current";
const readCourse = (): CourseVariant => COURSE_OPTIONS.find((option) => option === polishVariant("course")) ?? "current";
const readInboxCurrent = (): InboxVariant => "current";
const readInbox = (): InboxVariant => INBOX_OPTIONS.find((option) => option === polishVariant("inbox")) ?? "current";
const readOverviewCurrent = (): OverviewVariant => "current";
const readOverview = (): OverviewVariant => OVERVIEW_OPTIONS.find((option) => option === polishVariant("overview")) ?? "current";
const readNodeCurrent = (): NodeVariant => "current";
const readNode = (): NodeVariant => NODE_OPTIONS.find((option) => option === polishVariant("node")) ?? "current";

/** The one reader of the design switch: "proposed" only in development with the guide on Proposed.
 *  Production builds always get "current" until a surface ships. */
export function useDesignVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readSwitch : readCurrent, readCurrent);
}

/** Whether `/` is the study home ("proposed", spec:
 *  components/study-home/study-home.md) or the composer ("current").
 *  Production builds get "current". */
export function useHomeVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readHome : readCurrent, readCurrent);
}

/** Whether the Proposed design's sidebar lists course topics ("proposed",
 *  spec: components/unit-inbox/unit-inbox.md) or stays as it is
 *  ("current"). Production builds get "current". */
export function useSidebarVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readSidebar : readCurrent, readCurrent);
}

/** Which course page `/unit/<course>` draws, or "current" while there is
 *  none. Production builds get "current". */
export function useCourseVariant(): CourseVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readCourse : readCourseCurrent, readCourseCurrent);
}

/** Which top the Proposed sidebar draws, or "current" for its list as it
 *  is. Production builds get "current". */
export function useInboxVariant(): InboxVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readInbox : readInboxCurrent, readInboxCurrent);
}

/** Which node the topic map draws, or "current" for the node as it was.
 *  Production builds get "current". */
export function useNodeVariant(): NodeVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readNode : readNodeCurrent, readNodeCurrent);
}

/** How Home's map picks its course: behind tabs ("current") or following
 *  the Today row he points at ("follow"). Production builds get "current". */
export function useOverviewVariant(): OverviewVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readOverview : readOverviewCurrent, readOverviewCurrent);
}

/** Which topic page `/unit/...` draws, or "current" for the page as it is.
 *  Production builds get "current". */
export function useTopicVariant(): TopicVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readTopic : readTopicCurrent, readTopicCurrent);
}

/** Where the hybrid topic page puts the lesson to pick up, or "current"
 *  for its dated history. Production builds get "current". */
export function usePickupVariant(): PickupVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readPickup : readPickupCurrent, readPickupCurrent);
}

/** How the hybrid topic page ties its list to the lesson map, or "current"
 *  for nothing between them. Production builds get "current". */
export function useLinkVariant(): LinkVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readLink : readLinkCurrent, readLinkCurrent);
}
