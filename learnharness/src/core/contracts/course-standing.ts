/**
 * Where he stands for the exam and what is left to fix, as the learning
 * engine's `standing` verb reports them, derived on every read. Engine
 * fields only: which topics are solid, which mistakes are still open and
 * what each one was are the engine's, and the app computes none of it.
 */

import type { ArcHandle } from "./course-arcs.ts";
import type { TopicHandle } from "./course-map.ts";

/** One part of the exam: an arc it examines, or the whole course in a
 *  course without arcs (`arc` absent). Its topics, in path order, each in
 *  one list: solid; taught and not solid (or not solid lately inside the
 *  run-up); untaught and started by the plan before the exam; untaught
 *  with no room before the exam. */
export interface ReadinessPart {
	arc?: ArcHandle;
	solid: readonly TopicHandle[];
	notYet: readonly TopicHandle[];
	toStart: readonly TopicHandle[];
	wontFit: readonly TopicHandle[];
}

/** The exam ahead and its parts in study order. */
export interface CourseReadiness {
	date: string;
	daysLeft: number;
	parts: readonly ReadinessPart[];
}

/** One answer that was not right, still open: no right answer with no
 *  help came after it. */
export interface MistakeAnswer {
	/** The engine's observation id, "o15". */
	id: string;
	/** The engine's study day. */
	date: string;
	/** The tutor's sentence: what happened. */
	text: string;
	/** His answer, when the tutor kept it. */
	response: string | null;
	result: "incorrect" | "partial";
	/** It had help. */
	helped: boolean;
	/** He was sure of it. */
	confident: boolean;
	/** The method he reached for in its place, a topic of the course. */
	chose: TopicHandle | null;
	/** What it was on: the task's title, then the places in his material
	 *  ("Exercise 5(b), Sheet 3"); null when the record names none. */
	on: string | null;
}

/** A topic with a mistake still open. */
export interface OpenMistake {
	topic: TopicHandle;
	/** The tutor's diagnosis of what goes wrong, while it stands. */
	gap: string | null;
	/** The day of its newest mistake. */
	latest: string | null;
	/** Newest first; empty when only the diagnosis stands. */
	answers: readonly MistakeAnswer[];
}

export interface CourseStanding {
	/** Null without an exam ahead. */
	readiness: CourseReadiness | null;
	/** Newest first. */
	mistakes: readonly OpenMistake[];
}

/** What GET /api/course-standing answers. `standing` is null when the
 *  engine could not be read. */
export type CourseStandingResponse = { ok: true; standing: CourseStanding | null } | { ok: false; code: "unknown_course"; error: string };
