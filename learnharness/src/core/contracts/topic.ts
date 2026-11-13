/**
 * The topic page's read: what the engine's `show` knows about one topic
 * beyond the course map, and each of its sessions' plans. Engine fields
 * and the tutor's own plan only: the app judges no standing from them.
 */

import type { PlanTree } from "./plan.ts";

/** One scored attempt on a topic, as the engine's `show` reports it. */
export interface TopicAttempt {
	/** The engine's observation id, "o15". */
	id: string;
	/** The engine's study day. */
	date: string;
	/** When it was recorded (ISO), for order within a day; null when absent. */
	recorded: string | null;
	result: "correct" | "partial" | "incorrect";
	/** The help he had: none (an exam, or help "none"), a hint during it,
	 *  or the method or answer shown before it (the engine's `shown`). */
	help: "none" | "hint" | "shown";
	/** He gave up without an answer (the engine's `gave_up`). */
	gaveUp: boolean;
	sure: "guess" | "neutral" | "confident" | null;
	/** The method he reached for in its place (a topic handle), when the tutor recorded one. */
	chose: string | null;
	/** The tutor's sentence: what happened, or the question asked. */
	text: string;
}

/** What `show <topic> <task>…` adds to the map. */
export interface TopicRecord {
	/** Newest first; at most the engine's 30. */
	attempts: TopicAttempt[];
	/** The open tasks asked for, with the day each was last touched. */
	tasks: { key: string; updated: string | null }[];
}

/** One session's plan: the tree its tutor authored and where the transcript puts him on it. */
export interface SessionPlan {
	/** The session's id. */
	id: string;
	tree: Pick<PlanTree, "nodes" | "edges">;
	/** The node of the newest step-tagged question; null before any. */
	current: string | null;
	/** Nodes of earlier step-tagged questions. */
	visited: string[];
}

/** What GET /api/topic answers. `record` is null when the engine could not
 *  be read; `plans` holds only sessions that have a plan. */
export type TopicReadResponse =
	| { ok: true; record: TopicRecord | null; plans: SessionPlan[] }
	| { ok: false; code: "bad_request" | "unknown_course"; error: string };
