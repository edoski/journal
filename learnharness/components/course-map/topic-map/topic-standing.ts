import type { CourseMapTopic, TopicHandle, TopicLevel } from "@/src/core";

/** How much of the topic's pie is filled, in quarters. */
export type Fill = 0 | 0.25 | 0.5 | 0.75 | 1;

/** Where the learner stands on a topic, as the map draws and says it. */
export interface Standing {
	/** The pie: empty for a topic not started, a quarter more for each step
	 *  towards doing it unaided, full once he can do it on his own. */
	fill: Fill;
	/** The engine calls the topic weak: the pie wears the warning ink. */
	slipping: boolean;
	/** The same in words, for the topic's page and a screen reader. */
	words: string;
}

/** The levels at which he can do a topic on his own. */
const ON_HIS_OWN = new Set<TopicLevel>(["independent", "retained", "transferred"]);

const FILL: Record<TopicLevel, Fill> = { new: 0, introduced: 0.25, attempted: 0.5, assisted: 0.75, independent: 1, retained: 1, transferred: 1 };

const WORDS: Record<TopicLevel, string> = {
	new: "Not started",
	introduced: "Just started",
	attempted: "Learning",
	assisted: "Nearly on your own",
	independent: "On your own",
	retained: "On your own",
	transferred: "On your own",
};

/**
 * The standing from the engine's level and weak verdict. A full pie is
 * exactly a topic the course's progress pie counts (Today's rows): one he
 * can do on his own that the engine does not call weak. A weak topic he
 * could do on his own draws a quarter short of full. Pure.
 */
export function standingOf(topic: CourseMapTopic): Standing {
	const full = ON_HIS_OWN.has(topic.level);
	return { fill: full && topic.weak ? 0.75 : FILL[topic.level], slipping: topic.weak, words: WORDS[topic.level] };
}

/** Why a topic needs the learner now. */
export interface Need {
	/** `slip`: the engine calls it weak. `review`: a topic he can do on his
	 *  own whose review has come due. */
	kind: "slip" | "review";
	/** A few plain words for the node. */
	words: string;
}

/** "Review due today", "Review overdue by 3 days", "Review overdue by 2 weeks". */
function reviewWords(overdue: number): string {
	if (overdue === 0) return "Review due today";
	if (overdue < 7) return overdue === 1 ? "Review overdue by a day" : `Review overdue by ${overdue} days`;
	const weeks = Math.floor(overdue / 7);
	return weeks === 1 ? "Review overdue by a week" : `Review overdue by ${weeks} weeks`;
}

/** Why the engine calls a topic weak, as the first of its signals in a few
 *  words: a mistake he has answered right since, a miss after he had it, a
 *  diagnosed mistake, a method chosen in its place, a wrong answer he was
 *  sure of. */
function slipWords(topic: CourseMapTopic, titleOf: (handle: TopicHandle) => string): string {
	const { gap, lapsed, choiceErrors, confidentErrors, repaired } = topic.signals;
	if (repaired) return "Fixed, check again later";
	if (lapsed) return "Missed last time";
	if (gap) return "A mistake to fix";
	const [method] = Object.keys(choiceErrors);
	if (method) return `Mixed up with ${titleOf(method as TopicHandle)}`;
	if (confidentErrors > 0) return "Sure, but wrong";
	return "Worth another look";
}

/**
 * The one thing a node says under its title, or null when the topic does
 * not need him: why it is weak, else that its review is due and how
 * overdue. A topic still being learned says nothing about its review,
 * since nearly every one is due (the sidebar's rule, units.ts). Engine
 * fields only. Pure.
 */
export function needOf(topic: CourseMapTopic, titleOf: (handle: TopicHandle) => string): Need | null {
	if (topic.weak) return { kind: "slip", words: slipWords(topic, titleOf) };
	if (ON_HIS_OWN.has(topic.level) && topic.review?.kind === "due") return { kind: "review", words: reviewWords(topic.review.overdue) };
	return null;
}

/** The current topic's tag on the map. */
export const CURRENT_TAG = "You are here";

/** A node's name for a screen reader: its title, that it is the current
 *  topic, where he stands, and why it needs him. Pure. */
export function topicLabel(topic: CourseMapTopic, current: boolean, titleOf: (handle: TopicHandle) => string): string {
	return [topic.title, current ? CURRENT_TAG : null, standingOf(topic).words, needOf(topic, titleOf)?.words ?? null].filter(Boolean).join(", ");
}
