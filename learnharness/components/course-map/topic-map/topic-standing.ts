import type { CourseMapTopic, TopicHandle, TopicLevel } from "@/src/core";
import { mathPlain } from "@/components/ui/math-text";
import { SLIPPING_WORDS, slipMark, standingWords, type Fill, type SlipKey } from "@/components/study-words";
import type { Said, TopicFact } from "@/components/unit-inbox/sidebar-says";

/** Where the learner stands on a topic, as the map draws and says it. */
export interface Standing {
	/** The pie: empty for a topic not started, a quarter more for each step
	 *  towards doing it unaided, full once he can do it on his own. */
	fill: Fill;
	/** He is losing what he had (`slipsNow`): the pie wears the warning ink. */
	slipping: boolean;
	/** Where he stands in words true to the record (`standingWords`), or
	 *  `SLIPPING_WORDS` on a topic that slips. */
	words: string;
}

/** The levels at which he can do a topic on his own. */
const ON_HIS_OWN = new Set<TopicLevel>(["independent", "retained", "transferred"]);

const FILL: Record<TopicLevel, Fill> = { new: 0, introduced: 0.25, attempted: 0.5, assisted: 0.75, independent: 1, retained: 1, transferred: 1 };

/** Whether he is losing a topic he had: the engine calls it weak, he could
 *  do it on his own, and his newest counted answer on it is not right (the
 *  engine's `mistake`). A topic still being learned never slips, whatever
 *  its mistakes, and neither does one whose miss he has answered right
 *  since (round 11, 3 N1: Invertible and Poisson read "Slipping" twenty
 *  minutes after their first lesson; 2 n6: Random variables read it after
 *  a review whose last answer was right on his own). Pure. */
export function slipsNow(topic: CourseMapTopic): boolean {
	return topic.weak && ON_HIS_OWN.has(topic.level) && topic.signals.mistake === true;
}

/**
 * The standing from the engine's level and weak verdict. A full pie is
 * exactly a topic the course's progress ring counts (Today's rows): one he
 * can do on his own that the engine does not call weak. A weak topic he
 * could do on his own draws a quarter short of full, and says Slipping
 * while it slips (`slipsNow`), else how he answered it since. Pure.
 */
export function standingOf(topic: CourseMapTopic): Standing {
	const full = ON_HIS_OWN.has(topic.level);
	const fill = full && topic.weak ? 0.75 : FILL[topic.level];
	const slipping = slipsNow(topic);
	return { fill, slipping, words: slipping ? SLIPPING_WORDS : standingWords(fill, topic) };
}

/** Why a topic slips, beside its Slipping, or the open mistake on a topic
 *  that does not slip (a partly right answer, a miss while it is still
 *  being learned): the slip's key, which picks its icon (`SLIP_ICON`), and
 *  its words; null when neither. The sidebar (`slipOf`), the topic page's
 *  head and Home's rows say it so (round 10, 1 m4: the sidebar said
 *  "Mistake to fix" while the head said only "Partly right"). A weak topic
 *  with no mistake open says what is left in its standing ("Right on your
 *  own, check another day"), so nothing sits beside it. Pure. */
export function slipBeside(topic: CourseMapTopic, titleOf: (handle: TopicHandle) => string): { key: SlipKey; words: string } | null {
	return slipsNow(topic) || topic.signals.mistake ? slipMark(topic.signals, titleOf) : null;
}

/** What a card can say under its title in place of where he stands: a
 *  fact that needs him. When a review comes back, when he last studied it
 *  and where he is never take the line. */
export type CardFact = Exclude<TopicFact, { kind: "back" | "studied" | "here" }>;

/**
 * The one line a card says under its title (spec: topic-map.md, Node):
 * the sidebar's fact for the topic (`sidebarSays`) when it needs him,
 * else null, and the card says where he stands. One source, so a card
 * says what the sidebar's row and the course page's row say, a session
 * that waits on him included. Pure.
 */
export function cardLine(said: Said | undefined): CardFact | null {
	const fact = said?.fact ?? null;
	return fact && fact.kind !== "back" && fact.kind !== "studied" && fact.kind !== "here" ? fact : null;
}

/** The current topic's tag on the map. */
export const CURRENT_TAG = "You are here";

/** A node's name for a screen reader: its title, that it is the current
 *  topic, where he stands, and its card's line (`cardLine`). Pure. */
export function topicLabel(topic: CourseMapTopic, current: boolean, line: CardFact | null): string {
	return mathPlain([topic.title, current ? CURRENT_TAG : null, standingOf(topic).words, line?.words ?? null].filter(Boolean).join(", "));
}
