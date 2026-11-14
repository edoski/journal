import type { CourseMapTask, CourseMapTopic, TopicHandle, TopicLevel } from "@/src/core";
import { mathPlain } from "@/components/ui/math-text";
import { overdueWords, slipWords, standingWords, type Fill } from "@/components/study-words";

/** Where the learner stands on a topic, as the map draws and says it. */
export interface Standing {
	/** The pie: empty for a topic not started, a quarter more for each step
	 *  towards doing it unaided, full once he can do it on his own. */
	fill: Fill;
	/** The engine calls the topic weak: the pie wears the warning ink. */
	slipping: boolean;
	/** Where he stands in words true to the record (`standingWords`). */
	words: string;
}

/** The levels at which he can do a topic on his own. */
const ON_HIS_OWN = new Set<TopicLevel>(["independent", "retained", "transferred"]);

const FILL: Record<TopicLevel, Fill> = { new: 0, introduced: 0.25, attempted: 0.5, assisted: 0.75, independent: 1, retained: 1, transferred: 1 };

/**
 * The standing from the engine's level and weak verdict. A full pie is
 * exactly a topic the course's progress pie counts (Today's rows): one he
 * can do on his own that the engine does not call weak. A weak topic he
 * could do on his own draws a quarter short of full. Pure.
 */
export function standingOf(topic: CourseMapTopic): Standing {
	const full = ON_HIS_OWN.has(topic.level);
	const fill = full && topic.weak ? 0.75 : FILL[topic.level];
	return { fill, slipping: topic.weak, words: standingWords(fill, topic) };
}

/** Why a topic needs the learner now. */
export interface Need {
	/** `slip`: the engine calls it weak. `review`: a topic he can do on his
	 *  own whose review has come due. */
	kind: "slip" | "review";
	/** The reason in the app's words (study-words.ts). */
	words: string;
}

/**
 * The one thing a node says under its title, or null when the topic does
 * not need him: why it is weak, else that its review is due and how
 * overdue. A topic still being learned says nothing about its review,
 * since nearly every one is due (the sidebar's rule, units.ts). Engine
 * fields only. Pure.
 */
export function needOf(topic: CourseMapTopic, titleOf: (handle: TopicHandle) => string): Need | null {
	if (topic.weak) return { kind: "slip", words: slipWords(topic.signals, titleOf) };
	if (ON_HIS_OWN.has(topic.level) && topic.review?.kind === "due") return { kind: "review", words: overdueWords(topic.review.overdue) };
	return null;
}

/** The one thing a candidate node says about a topic beyond its standing,
 *  in the order Home's rows give their reasons (row-facts.ts `whyOf`): a
 *  slip, a review come due, an open task that holds it. */
export interface Status {
	kind: "slip" | "review" | "task";
	words: string;
}

/** Home's task words: where he left off, the step up to its first colon
 *  ("At part (c)"), else "Unfinished". */
function taskWords(topic: CourseMapTopic, tasks: readonly CourseMapTask[]): string | null {
	if (topic.tasks.length === 0) return null;
	const step = tasks.find((task) => topic.tasks.includes(task.key))?.step?.split(":")[0]!.trimEnd();
	return step ? `At ${step.charAt(0).toLowerCase()}${step.slice(1)}` : "Unfinished";
}

/**
 * What a candidate node says about a topic beyond its standing, or null:
 * why it is weak, else that its review is due (only for a topic he can do
 * on his own, the sidebar's rule), else where an open task holding it was
 * left. Engine fields only. Pure.
 */
export function statusOf(topic: CourseMapTopic, tasks: readonly CourseMapTask[], titleOf: (handle: TopicHandle) => string): Status | null {
	if (topic.weak) return { kind: "slip", words: slipWords(topic.signals, titleOf) };
	if (ON_HIS_OWN.has(topic.level) && topic.review?.kind === "due") return { kind: "review", words: overdueWords(topic.review.overdue) };
	const task = taskWords(topic, tasks);
	return task ? { kind: "task", words: task } : null;
}

/** The current topic's tag on the map. */
export const CURRENT_TAG = "You are here";

/** A node's name for a screen reader: its title, that it is the current
 *  topic, where he stands, and why it needs him. Pure. */
export function topicLabel(topic: CourseMapTopic, current: boolean, titleOf: (handle: TopicHandle) => string): string {
	return mathPlain([topic.title, current ? CURRENT_TAG : null, standingOf(topic).words, needOf(topic, titleOf)?.words ?? null].filter(Boolean).join(", "));
}
