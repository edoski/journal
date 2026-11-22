"use client";

import { createContext, type KeyboardEvent } from "react";
import type { ArcHandle, CourseMapTopic, PlanNodeStatus, TopicHandle } from "@/src/core";
import type { CardFact, Standing } from "./topic-standing";

/** What every card on a map says, a course's topic or a lesson's step (topic-map.md, Node): one card draws both. */
type CardBase = {
	handle: TopicHandle;
	title: string;
	/** Ringed: the course's current topic, or the step a lesson stopped on. */
	current: boolean;
	/** The words just above the card ("You are here", "Left off here", "Your turn", "Next"); null for none. */
	tag: string | null;
	/** Its name for a screen reader, and what it rests on by name ("Needs A, B", "Rests on A, B"). */
	label: string;
	needs: string | null;
	/** Where a press goes: the topic's page, or the lesson a step belongs to. */
	href: string;
};

/** A course's topic: its pie, and a header strip saying what it needs from him or where he stands. */
export type TopicData = CardBase & {
	kind: "topic";
	topic: CourseMapTopic;
	standing: Standing;
	/** What the card says in its header in place of the standing (`cardLine`). */
	line: CardFact | null;
	/** An arc's entry topic: the earlier arc it comes from, its card faded and captioned with that arc ("From Vector
	 *  spaces"). */
	from: string | null;
};

/** A lesson's step: the plan's mark in place of the pie, no header strip (a step has no standing and no sidebar
 *  fact), its title whole on as many lines as it takes (round 14, m34), and the tutor's summary on hover. */
export type StepData = CardBase & {
	kind: "step";
	status: PlanNodeStatus;
	/** The tutor marked it done: a check in the mark's place. */
	done?: boolean;
	summary: string | null;
};

export type CardData = TopicData | StepData;

/** What the nodes share: the lit chain, the one tab stop, and the map's handlers. */
export interface TopicMapState {
	/** The hovered or focused topic with its prerequisites, or null at rest. */
	lit: ReadonlySet<TopicHandle> | null;
	/** The topic a page points at from elsewhere (a row beside the map, `useMapTie`), whose card glows. */
	marked?: TopicHandle | null;
	/** The topics a page points at that the camera brings into view (`useMapTie`); null while it points at none. */
	framed?: ReadonlySet<TopicHandle> | null;
	tabStop: TopicHandle | null;
	onActive: (handle: TopicHandle | null) => void;
	onFocus: (handle: TopicHandle) => void;
	onKeyDown: (handle: TopicHandle, event: KeyboardEvent<HTMLAnchorElement>) => void;
	register: (handle: TopicHandle, el: HTMLAnchorElement | null) => void;
	/** Shows another arc of the course on this map, for a card's "From <arc>" line; unset where a page has no arc to
	 *  show. */
	openArc?: (arc: ArcHandle) => void;
	/** How far the frame's fade reaches in, in screen pixels (`MAP_FADE`): a card wholly under it is out of view, and
	 *  its lines go with it (canvas.md, Lines); unset, the frame has none. */
	fade?: { x: number; y: number };
}

export const TopicMapContext = createContext<TopicMapState | null>(null);

/** How far a card recedes when another chain is lit, or as an arc's entry
 *  topic: the lowest strength at which its muted line keeps 4.5:1 on its
 *  card (WCAG AA; tests/topic-map.test.tsx works it out from the tokens),
 *  so a receded card still reads (round 5: 50% drew it at 2.8:1). */
export const RECEDED = 0.8;
