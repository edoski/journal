/**
 * What a session opened on course topics is, from the words it opened with.
 * Home, a topic's page and the calendar start such a session with one
 * instruction, its first message: "Review A, B" (a review of those topics),
 * "Start A" or "Continue A" (a lesson on them). The session keeps the
 * review's words as its name, so a review reads as a review everywhere; a
 * lesson is named after what it teaches, never after the verb that opened
 * it (round 8: "Start Linear maps and their matrices" on Home eight days
 * after he started it). Pure and browser-safe.
 */

/** The opening a review is started with: "Review " and the titles. */
const REVIEW_OPENING = /^Review\s+\S/;

/** The verbs a lesson on topics is opened with. */
const LESSON_VERB = /^(?:Start|Continue)\s+(?=\S)/;

/** Whether a session is a review of course topics: it was opened on topics
 *  (`ownTopics`) with a review's words, which it keeps as its name. A lesson
 *  that merely touched a due topic is not one. */
export function isReviewSession(chat: { title: string; ownTopics?: readonly string[]; topics?: readonly string[] }): boolean {
	const opened = chat.ownTopics ?? chat.topics ?? [];
	return opened.length > 0 && REVIEW_OPENING.test(chat.title);
}

/** The name a session opened on topics takes from its opening: a review
 *  keeps "Review A, B"; a lesson drops the verb that opened it ("Start
 *  Poisson distribution" is named "Poisson distribution"); anything else,
 *  or a session opened on no topic, keeps its words. */
export function openingTitle(opening: string, topics: readonly string[]): string {
	return topics.length > 0 ? opening.replace(LESSON_VERB, "") : opening;
}
