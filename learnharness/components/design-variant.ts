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

/** The switch registry, which the Logbook's in-app guide switches (dev
 *  only): Design is Current or Proposed; Home is the composer or the study
 *  home, Sidebar Current or Proposed, and anything but Current wears
 *  Design's Proposed; Rows is Today's rows as course and lesson only or
 *  the hybrid row, on the study home; Map is the course map as it was or the
 *  topic map, on whichever study home shows it; Course is no course page
 *  or one of its candidates, each wearing the Proposed design, sidebar and
 *  topic map; Inbox is the Proposed sidebar's list as it is or one of its
 *  top candidates, each wearing the Proposed design and sidebar; Node is the
 *  topic map's node as it was or one of its candidates, wherever the topic
 *  map draws. Read only through the hooks below. */
export const POLISH_GROUPS: readonly PolishGroup[] = [
	{ id: "design", label: "Design" },
	{ id: "home", label: "Home", requires: { design: "proposed" } },
	{ id: "sidebar", label: "Sidebar", requires: { design: "proposed" } },
	{ id: "rows", label: "Rows", requires: { design: "proposed", home: "proposed" } },
	{ id: "map", label: "Map", requires: { design: "proposed" } },
	{ id: "course", label: "Course", options: COURSE_OPTIONS, requires: { design: "proposed", sidebar: "proposed", map: "proposed" } },
	{ id: "inbox", label: "Inbox", options: INBOX_OPTIONS, requires: { design: "proposed", sidebar: "proposed" } },
	{ id: "node", label: "Node", options: NODE_OPTIONS, requires: { design: "proposed", map: "proposed" } },
	{ id: "overview", label: "Overview", options: OVERVIEW_OPTIONS, requires: { design: "proposed", home: "proposed" } },
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
const readRows = (): DesignVariant => (polishVariant("rows") === "proposed" ? "proposed" : "current");
const readSidebar = (): DesignVariant => (polishVariant("sidebar") === "proposed" ? "proposed" : "current");
const readMap = (): DesignVariant => (polishVariant("map") === "proposed" ? "proposed" : "current");
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

/** Whether Today's rows are the hybrid row ("proposed", spec:
 *  components/study-home/agenda-rows/hybrid/hybrid.md) or course and
 *  lesson only ("current"). Production builds get "current". */
export function useRowsVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readRows : readCurrent, readCurrent);
}

/** Whether the Proposed design's sidebar lists course topics ("proposed",
 *  spec: components/unit-inbox/unit-inbox.md) or stays as it is
 *  ("current"). Production builds get "current". */
export function useSidebarVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readSidebar : readCurrent, readCurrent);
}

/** Whether a study home draws the course as the topic map ("proposed",
 *  spec: components/course-map/topic-map/topic-map.md), with the topic
 *  page that goes with it, or as the map was ("current"). Production
 *  builds get "current". */
export function useMapVariant(): DesignVariant {
	return useSyncExternalStore(DEV ? subscribeSwitch : subscribeNever, DEV ? readMap : readCurrent, readCurrent);
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
