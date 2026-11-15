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

/** The words a session opened with: its first learner message's text, or
 *  null before he said anything. */
export function openingText(messages: readonly { role: string; content?: unknown }[]): string | null {
	const first = messages.find((m) => m.role === "user");
	if (!first) return null;
	const { content } = first;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return null;
	const text = content.find((b): b is { type: "text"; text: string } => typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text");
	return text?.text ?? null;
}

/** Whether a session record is a review of course topics: opened on topics
 *  with a review's words ("Review Binomial distribution", or "Review" alone,
 *  the topics it was opened on saying which), whatever it is named now. */
export function openedAsReview(record: { topics?: readonly string[]; messages: readonly { role: string; content?: unknown }[] }): boolean {
	return (record.topics ?? []).length > 0 && /^Review\b/.test(openingText(record.messages)?.trim() ?? "");
}

/** Whether a session is a review of course topics: the session list says so
 *  (`review`, from its opening, `openedAsReview`), else, on a summary made
 *  elsewhere, it was opened on topics and keeps a review's words as its
 *  name. A lesson that merely touched a due topic is not one. */
export function isReviewSession(chat: { title: string; review?: boolean; ownTopics?: readonly string[]; topics?: readonly string[] }): boolean {
	if (chat.review !== undefined) return chat.review;
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
