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
	/** The engine's rule: an exam, or help "none". */
	unaided: boolean;
	/** The engine's grade of it (`solid`, `helped`, `missed`), null when it
	 *  gave none: how it counted, as the answer card says it. */
	grade: "solid" | "helped" | "missed" | null;
	/** He gave up on it without an answer. */
	gaveUp: boolean;
	/** A prediction made before its step was taught: kept as what happened,
	 *  never counted. */
	predicted: boolean;
	/** The engine doubts the evidence (`uncertain`: given straight after an
	 *  explanation, or with its solution in view). */
	uncertain: boolean;
	/** The confidence he chose (`chosenSure`: never the meter left alone). */
	sure: "guess" | "confident" | null;
	/** The method he reached for in its place (a topic handle), when the tutor recorded one. */
	chose: string | null;
	/** The tutor's sentence: what happened, or the question asked. */
	text: string;
	/** The session that saved it (its save receipt or practice conclude,
	 *  `markLinks`), among the sessions the read named; null when none of
	 *  them did. */
	session: string | null;
}

/** Where the topic is in his material, as the engine's record points to
 *  it (a topic's `refs`): the source's title and, when the record has one,
 *  the place in it ("Section 4.7"). */
export interface TopicRef {
	/** The source by its own title; null when it names itself nowhere, and
	 *  the row shows only the place in it (round 18, m23). */
	source: string | null;
	locator: string | null;
}

/** What `show <topic> <task>…` adds to the map. */
export interface TopicRecord {
	/** Newest first; at most the engine's 30. */
	attempts: TopicAttempt[];
	/** Where it is in his material, in the record's order; absent or empty
	 *  when the record points nowhere. */
	refs?: TopicRef[];
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
	/** The node the newest step-tagged question asks about, a check back on
	 *  a step done before included, which `current` does not follow; absent
	 *  or null before any. Where his turn is while the lesson waits on him
	 *  (round 14, m40). */
	asked?: string | null;
	/** Nodes the tutor's `lesson_progress` marked done; absent when none
	 *  (round 16, m23: his map drew a taught step as one still ahead). */
	done?: string[];
}

/** What GET /api/topic answers. `record` is null when the engine could not
 *  be read; `plans` holds only sessions that have a plan. `firstReview`,
 *  asked for a lesson he began (`?begun=1`), is the first day the engine's
 *  daily plan reviews the topic, null when it plans none or the plan could
 *  not be read. */
export type TopicReadResponse =
	| { ok: true; record: TopicRecord | null; plans: SessionPlan[]; firstReview?: string | null }
	| { ok: false; code: "bad_request" | "unknown_course"; error: string };
