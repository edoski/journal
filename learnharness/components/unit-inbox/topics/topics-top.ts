import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { overdueSentence, type Why } from "@/components/study-home/agenda-rows/row-facts";
import type { NeedsYou, NowLine } from "@/components/study-home/needs-you";
import { overdueWords, statusOf } from "@/components/course-map/topic-map/topic-standing";
import { sessionKey, topicUnit } from "@/components/unit-inbox/now-inbox";
import { unitKey, type Unit, type UnitInbox, type UnitNow } from "@/components/unit-inbox/units";

/**
 * The Inbox candidate "topics" (spec: ../inbox-topics.md): Home's Today at
 * topic grain. Each line's lead topic is a card, as under "today"; a course
 * line's other topics follow it as one-line companion rows, each with its
 * own reason. The pure part.
 */

/** A companion's own reason: Home's `Why` (its kind picks the row's icon,
 *  its `words` the tooltip), or the tutor writing in one of its sessions. */
export type TopicWords = Why | { kind: "working" };

/** What a companion's reason says, in its tooltip and to a screen reader:
 *  the reason's full words ("Missed last time", "Overdue by 3 days"), or
 *  "Working". Pure. */
export function companionSays(words: TopicWords): string {
	return words.kind === "working" ? "Working" : words.words;
}

/** One companion row: a topic a course line takes up beside its lead. */
export interface Companion {
	kind: "companion";
	line: NowLine;
	unit: Unit;
	words: TopicWords;
	/** The lead's unit key, the row the keyboard's Left goes back to. */
	parent: string;
}

/** What the sidebar's top draws, in order: today's two kinds of card (a
 *  line's lead topic, or a waiting session on no topic as itself), then a
 *  course line's companions and the tail that holds the rest of them. */
export type NowItem =
	| { kind: "topic"; line: NowLine; unit: Unit }
	| { kind: "session"; line: NowLine; chat: ChatListItem }
	| Companion
	| { kind: "more"; line: NowLine; parent: string; rest: readonly Companion[] };

/** At most this many companions under a card before the tail. */
export const COMPANIONS_SHOWN = 2;

/** Home's review reason for one topic, as `whyOf` gives it. Pure. */
const overdueWhy = (overdue: number): Why => ({ kind: "review", words: overdueSentence(overdue), short: overdueWords(overdue) });

/**
 * A topic's own reason, by priority: a session on it waits on the learner
 * (Your turn) or the tutor writes in one (Working); the engine calls it
 * weak (the map's words, "Missed last time", "A mistake to fix", "Mixed
 * up with …"); its review is due (Home's words, "Overdue by 3 days"). Null when
 * none holds: on a task line the caller gives the task's step. Engine
 * fields only. Pure.
 */
export function topicWords(topic: CourseMapTopic, now: UnitNow, titleOf: (handle: TopicHandle) => string): TopicWords | null {
	if (now === "your-turn") return { kind: "reply", words: "Waiting for your reply", short: "Your turn" };
	if (now === "working") return { kind: "working" };
	const slip = topic.weak ? statusOf(topic, [], titleOf) : null;
	if (slip) return { kind: "missed", words: slip.words, short: slip.short };
	if (topic.review?.kind === "due") return overdueWhy(topic.review.overdue);
	return null;
}

/** A course's titles by handle, for the "Mixed up with …" words. */
function titlesOf(course: StudyCourse): (handle: TopicHandle) => string {
	const byHandle = new Map(course.map.topics.map((t) => [t.handle, t.title]));
	return (handle) => byHandle.get(handle) ?? handle;
}

/**
 * The sidebar's top under the topics candidate: for each of Today's
 * lines in order, its card, then (course lines only) the line's other
 * topics in the plan's order as companions, at most two and a tail for
 * the rest; one left over shows instead of a tail. Each topic is listed
 * once, the first occurrence winning by unit key; a line whose lead is
 * already listed is left out with its companions. A companion with no
 * reason of its own is not drawn (it stays on its shelf). Pure.
 */
export function topicsTop(needs: NeedsYou, inbox: UnitInbox, chats: readonly ChatListItem[]): NowItem[] {
	const seen = new Set<string>();
	const items: NowItem[] = [];
	for (const line of needs.lines) {
		const { row } = line;
		if (!line.lead || !row.course) {
			if (row.kind !== "session") continue;
			const key = sessionKey(row.chat.id);
			if (seen.has(key)) continue;
			seen.add(key);
			items.push({ kind: "session", line, chat: row.chat });
			continue;
		}
		const course = row.course;
		const lead = topicUnit(inbox, course, line.lead, chats);
		if (seen.has(lead.key)) continue;
		seen.add(lead.key);
		items.push({ kind: "topic", line, unit: lead });
		if (row.kind !== "course") continue;
		const titleOf = titlesOf(course);
		// The task's step in the card's own few words ("At part (c)"), not
		// the whole step's sentence.
		const step = line.why?.kind === "task" ? (line.slot ?? line.why.short) : null;
		const task = line.why?.kind === "task" && step ? { ...line.why, words: step, short: step } : null;
		const companions = line.topics.slice(1).flatMap((topic): Companion[] => {
			if (seen.has(unitKey(course.map.workspace, topic.handle))) return [];
			const unit = topicUnit(inbox, course, topic, chats);
			const words = topicWords(topic, unit.now, titleOf) ?? task;
			if (!words) return [];
			seen.add(unit.key);
			return [{ kind: "companion", line, unit, words, parent: lead.key }];
		});
		const fits = companions.length <= COMPANIONS_SHOWN + 1;
		const shown = fits ? companions : companions.slice(0, COMPANIONS_SHOWN);
		items.push(...shown);
		if (!fits) items.push({ kind: "more", line, parent: lead.key, rest: companions.slice(COMPANIONS_SHOWN) });
	}
	return items;
}

/** Every key the top holds, the tails' hidden companions included, for
 *  `restShelves`: a unit's key, or `sessionKey` for a session card. Pure. */
export function topKeys(items: readonly NowItem[]): Set<string> {
	const keys = new Set<string>();
	for (const item of items) {
		if (item.kind === "more") for (const c of item.rest) keys.add(c.unit.key);
		else if (item.kind === "session") keys.add(sessionKey(item.chat.id));
		else keys.add(item.unit.key);
	}
	return keys;
}
