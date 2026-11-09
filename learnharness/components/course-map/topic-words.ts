import type { CourseMapTopic, TopicHandle, TopicReview } from "@/src/core";

/** The node's caption: the engine's level word first, then the topic's
 *  states as words, so nothing on the map relies on colour. A topic not yet
 *  introduced (level `new`) reads "not started". How overdue a review is
 *  reads in the detail; the current topic carries its own tag. Pure. */
export function topicCaption(topic: CourseMapTopic): string {
	const words = [topic.level === "new" ? "not started" : topic.level];
	if (topic.review?.kind === "due") words.push("due");
	if (topic.weak) words.push("weak");
	return words.join(" · ");
}

/** The current topic's tag on the map and in the list. */
export const CURRENT_TAG = "You are here";

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "Thu 13 Nov" for an engine date (YYYY-MM-DD). */
export function dayText(date: string): string {
	return DAY.format(new Date(`${date}T00:00:00Z`)).replace(",", "");
}

/** The review in words, from the engine's own dates and overdue count. */
export function reviewText(review: TopicReview | null): string | null {
	if (!review) return null;
	if (review.kind === "scheduled") return `Next review ${dayText(review.date)}`;
	if (review.overdue === 0) return "Review due today";
	return `Review due since ${dayText(review.date)} (${review.overdue} ${review.overdue === 1 ? "day" : "days"})`;
}

/** Why the engine calls the topic weak, one plain line per engine field. */
export function signalLines(topic: CourseMapTopic, titleOf: (handle: TopicHandle) => string): string[] {
	const { gap, lapsed, stale, choiceErrors, confidentErrors } = topic.signals;
	const lines: string[] = [];
	if (gap) lines.push(gap);
	if (lapsed) lines.push("Slipped after an earlier solid answer");
	if (stale) lines.push("The diagnosis may be out of date");
	for (const [method, times] of Object.entries(choiceErrors)) {
		lines.push(`Chose ${titleOf(method as TopicHandle)} instead${times > 1 ? ` (${times} times)` : ""}`);
	}
	if (confidentErrors > 0) {
		lines.push(confidentErrors === 1 ? "One confident wrong answer" : `${confidentErrors} confident wrong answers`);
	}
	return lines;
}

/** "Basis and dimension, Matrix multiplication" for a list of handles. */
export function titlesText(handles: readonly TopicHandle[], titleOf: (handle: TopicHandle) => string): string {
	return handles.map(titleOf).join(", ");
}
