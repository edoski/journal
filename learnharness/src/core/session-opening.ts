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

import type { TopicReview } from "./contracts/course-map.ts";
import { firstStartedTopicOf, sessionPlanTopicOf, sessionTaskTopicsOf, plannedTopicsOf, type LhMessage } from "./native-messages.ts";

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

/** Where the app's opening sits in the transcript: his first message with
 *  words, when the session was started by a press on its topics
 *  (`appOpening`); -1 otherwise. Those words are the app's instruction to
 *  the tutor, so the transcript draws no bubble for them (round 9: the
 *  topic's name posted as his first message). */
export function appOpeningAt(messages: readonly { role: string; parts: readonly { type: string }[] }[], appOpening: boolean): number {
	if (!appOpening) return -1;
	return messages.findIndex((m) => m.role === "user" && m.parts.some((p) => p.type === "text"));
}

/** Whether a session's first message is the app's opening (`appOpening`).
 *  A session made before that was recorded reads it from its words: on
 *  topics, a press's words ("Review …", "Start …", "Continue …", or the
 *  topic's name, which a new lesson opens with and is named after). */
export function openedByApp(record: { appOpening?: true; title: string; topics?: readonly string[]; messages: readonly { role: string; content?: unknown }[] }): boolean {
	if (record.appOpening) return true;
	if ((record.topics ?? []).length === 0) return false;
	const opening = openingText(record.messages)?.trim() ?? "";
	return REVIEW_OPENING.test(opening) || LESSON_VERB.test(opening) || (opening !== "" && opening.toLowerCase() === record.title.trim().toLowerCase());
}

/** Whether a session record is a review of course topics: opened on topics
 *  with a review's words ("Review Binomial distribution", or "Review" alone,
 *  the topics it was opened on saying which), whatever it is named now.
 *  Before its opening lands, the name it was created with says so: Home's
 *  review creates the session named "Review …" and then sends the opening,
 *  so for that moment it is already the review it takes up (round 15, m7:
 *  the starting review showed twice on the sidebar, as Home's review line
 *  and as its session, "Tutor writing" on both). */
export function openedAsReview(record: { title?: string; topics?: readonly string[]; messages: readonly { role: string; content?: unknown }[] }): boolean {
	return reviewOpening(record) && lessonTakenUp(record) === null;
}

/** Opened on topics with a review's words, whatever it did after. */
function reviewOpening(record: { title?: string; topics?: readonly string[]; messages: readonly { role: string; content?: unknown }[] }): boolean {
	if ((record.topics ?? []).length === 0) return false;
	const opening = openingText(record.messages);
	return opening === null ? REVIEW_OPENING.test(record.title ?? "") : /^Review\b/.test(opening.trim());
}

/** The topic whose lesson a session opened on topics took up: its first
 *  plan teaches a topic it was not opened on, or before any plan, a probe's
 *  answer started a topic it was not opened on (`firstStartedTopicOf`), so
 *  from then on it is that topic's lesson, no longer the review or lesson
 *  it opened as (round 16, M4: "Review Binomial distribution", asked for
 *  Poisson, taught a Poisson lesson that stayed filed under the review,
 *  with no task and no Resume on Poisson's page; round 17, M5: the same
 *  while still in its probe, since the probe is the first lesson's start).
 *  A review may re-teach one of its own topics first: the first topic not
 *  among them that a later plan teaches is then its lesson, never one a
 *  side answer started
 *  (round 17, M5 live: the Probability review's plan re-taught
 *  Inclusion-exclusion, he asked to start Expectation and answered its
 *  question, and the session stayed the review), else the first topic not
 *  among them that a task it saved holds (round 18, M3: that plan gave no
 *  topic, and its close's Expectation task is what said so). A lesson keeps the topic
 *  it opened on when a later plan repairs a prerequisite. Null otherwise.
 *  Pure. */
export function lessonTakenUp(record: { title?: string; topics?: readonly string[]; messages: readonly { role: string; content?: unknown }[] }): string | null {
	const messages = record.messages as readonly LhMessage[];
	const first = planTakesUp(record, sessionPlanTopicOf(messages) ?? firstStartedTopicOf(messages));
	if (first || !reviewOpening(record)) return first;
	const opened = record.topics ?? [];
	const outside = (topic: string) => !opened.includes(topic);
	return plannedTopicsOf(messages).find(outside) ?? sessionTaskTopicsOf(messages).find(outside) ?? null;
}

/** The topic a session opened on topics takes up as its lesson when its
 *  first plan teaches `taught` (`lessonTakenUp`), for the plan being
 *  written. Pure. */
export function planTakesUp(record: { topics?: readonly string[] }, taught: string | null | undefined): string | null {
	const opened = record.topics ?? [];
	return taught && opened.length > 0 && !opened.includes(taught) ? taught : null;
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

/** Whether a session's own record is a review: opened with a review's
 *  words, or a summary made elsewhere named as one. The brief, the course
 *  tools and the digest read a review the same way. */
export function reviewRecord(record: { title: string; topics?: readonly string[]; messages: readonly { role: string; content?: unknown }[] }): boolean {
	return lessonTakenUp(record) === null && (openedAsReview(record) || isReviewSession(record));
}

/** The one of a review's topics its plan re-teaches: the topic its newest
 *  plan names, when that is one of the review's own, so its map and its
 *  open question are that topic's alone (round 18, M2: the Probability
 *  review re-taught Inclusion-exclusion, and Random variables' and
 *  Binomial's pages drew its map and read "Left off 8 Nov"). Null for a
 *  session not a review, a review of one topic, or one whose plan names
 *  none. Pure. */
export function retaughtTopicOf(record: { title: string; topics?: readonly string[]; messages: readonly { role: string; content?: unknown }[] }): string | null {
	const opened = record.topics ?? [];
	if (opened.length < 2 || !reviewRecord(record)) return null;
	const topic = plannedTopicsOf(record.messages as readonly LhMessage[]).at(-1);
	return topic && opened.includes(topic) ? topic : null;
}

/** The topics a session teaches as its lesson: the topics a session not a
 *  review was opened on, the topic its plan teaches and the topics of the
 *  task it took up. None for a review, which asks across its topics and may
 *  start one he asks for (round 17, M5), nor for a session opened on no
 *  topic before its plan. An answer on none of them was given inside
 *  another topic's lesson (round 17, m3). Pure. */
export function lessonTopicsOf(record: { title: string; topics?: readonly string[]; messages: readonly { role: string; content?: unknown }[] }): string[] {
	if (reviewRecord(record)) return [];
	const messages = record.messages as readonly LhMessage[];
	const planned = sessionPlanTopicOf(messages);
	return [...new Set([...(record.topics ?? []), ...(planned ? [planned] : []), ...sessionTaskTopicsOf(messages)])];
}

/** The name a session opened on topics takes from its opening: a review
 *  keeps "Review A, B"; work continued drops its verb ("Continue Problem
 *  sheet 4" is named "Problem sheet 4"); a lesson started is named as its
 *  task will be, from its first turn ("Start Poisson distribution" and
 *  "Poisson distribution" are "Poisson distribution lesson"; round 16, m4:
 *  "Invertible matrices" while live, "Invertible matrices lesson" after
 *  its close). Anything else (a practice round, an arc's check), or a
 *  session opened on no topic, keeps its words. */
export function openingTitle(opening: string, topics: readonly string[], lesson = true): string {
	if (topics.length === 0 || REVIEW_OPENING.test(opening)) return opening;
	if (/^Continue\s/.test(opening)) return opening.replace(LESSON_VERB, "");
	if (!lesson) return opening;
	const named = opening.replace(LESSON_VERB, "").trim();
	return /\blesson$/i.test(named) ? named : `${named} lesson`;
}

/** Whether memory asks for the topic's review by `today`, the engine's
 *  study day: the plan has it today (`due`), or holds it past the day
 *  memory asked for it ("Due 6 Nov, back 11 Nov"). */
export function reviewAsked(review: TopicReview | null | undefined, today: string): boolean {
	return review?.kind === "due" || (review?.kind === "scheduled" && review.held !== undefined && review.held.since <= today);
}

/** What a press on one topic opens with: its review when memory asks for
 *  it (`reviewAsked`), so the session is that review whichever button
 *  started it (round 10, 2 M1: Study on a held review opened a lesson),
 *  else the topic's name, a lesson on it. */
export function topicOpening(topic: { title: string; review: TopicReview | null | undefined }, today: string): string {
	return reviewAsked(topic.review, today) ? `Review ${topic.title}` : topic.title;
}
