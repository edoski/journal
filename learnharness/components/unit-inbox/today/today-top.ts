import type { ChatListItem } from "@/src/core";
import { sessionState } from "@/components/nav/session-state";
import { lessonTitle } from "@/components/study-home/agenda-rows/row-facts";
import type { NeedsYou, NowLine } from "@/components/study-home/needs-you";
import { courseKey, sessionKey, topicUnit } from "@/components/unit-inbox/now-inbox";
import { unitKey, type Unit, type UnitInbox } from "@/components/unit-inbox/units";

/**
 * One card on the sidebar's top (spec:
 * ../inbox-today.md), under the one title Home gives its line: a course's
 * line drawn as the topic it leads with, or as the course when it has no
 * topic to lead with (a task that holds none), or a session's line drawn
 * as the session itself.
 */
export type NowItem =
	| { kind: "topic"; line: NowLine; unit: Unit }
	| { kind: "course"; line: NowLine; workspace: string }
	| { kind: "session"; line: NowLine; chat: ChatListItem };

/** The key an item holds in `restShelves`' `onTop`, and the keyboard walk's
 *  row name: the unit's key, `course:<workspace>`, or `chat:<id>`. Pure. */
export function itemKey(item: NowItem): string {
	if (item.kind === "topic") return item.unit.key;
	return item.kind === "course" ? courseKey(item.workspace) : sessionKey(item.chat.id);
}

/** The keys an item takes off the shelves: its own, and every topic a
 *  session's card stands for (`NowLine.topics`: its own topics and those
 *  it worked on, on its course's map), so one session is one card, never
 *  a second row under Working or Learning for a review's other topic or
 *  the lesson's own. Pure. */
export function claimedKeys(item: NowItem): string[] {
	const { row, topics } = item.line;
	if (item.kind !== "session" || !row.course) return [itemKey(item)];
	const { workspace } = row.course.map;
	return [itemKey(item), ...topics.map((t) => unitKey(workspace, t.handle))];
}

/** The topics an item's line asks of him: a session's own topics (the
 *  lesson's, a review's), never one its lesson only touched on the way
 *  (round 14, m28: the course page's Needs you listed Random variables
 *  beside the Poisson lesson that reviewed it, which no Today line asks);
 *  any other line's own key. Pure. */
export function askedKeys(item: NowItem): string[] {
	const { row, topics } = item.line;
	if (item.kind !== "session" || !row.course) return [itemKey(item)];
	const { workspace } = row.course.map;
	const own = new Set<string>(item.chat.ownTopics ?? []);
	return [itemKey(item), ...topics.filter((t) => own.has(t.handle) || t === item.line.lead).map((t) => unitKey(workspace, t.handle))];
}

/**
 * The sidebar's top: Today's lines (`needs.lines`, at most five, in Home's
 * order), one card each. A session's line is its session card, one per
 * session however many topics its lesson touched; a course's line with a
 * lead topic is that topic's unit, the inbox's own else one built for it
 * (a lead not started yet), and one with no lead is its course's card, so
 * every line Home draws has its card. A topic two lines lead with is
 * listed once, at the first.
 * Home's "also" lines are not drawn: their topics stay on the shelves.
 * Pure.
 */
export function todayTop(needs: NeedsYou, inbox: UnitInbox, chats: readonly ChatListItem[]): NowItem[] {
	const seen = new Set<string>();
	const items: NowItem[] = [];
	for (const line of needs.lines) {
		const { row, lead } = line;
		const item: NowItem =
			row.kind === "session"
				? { kind: "session", line, chat: row.chat }
				: lead
					? { kind: "topic", line, unit: topicUnit(inbox, row.course, lead, chats) }
					: { kind: "course", line, workspace: row.course.map.workspace };
		if (seen.has(itemKey(item))) continue;
		seen.add(itemKey(item));
		items.push(item);
	}
	return items;
}

/** A session line's card as it is now while the tutor writes in its
 *  session, or null: the session card's session, running and still in the
 *  list's scope (the inbox lists it on a topic or on Other). Pure. */
function running(item: NowItem, inbox: UnitInbox, chats: readonly ChatListItem[]): NowItem | null {
	const { row } = item.line;
	if (row.kind !== "session" || item.kind !== "session") return null;
	const chat = chats.find((c) => c.id === row.chat.id);
	if (!chat || sessionState(chat) !== "working") return null;
	const listed = [...inbox.active, ...inbox.working, ...inbox.known].some((u) => u.sessions.some((c) => c.id === chat.id)) || inbox.other.some((c) => c.id === chat.id);
	return listed ? { kind: "session", line: { ...item.line, row: { ...row, chat }, title: lessonTitle({ ...row, chat }) }, chat } : null;
}

/**
 * The top across a turn, so the card of the lesson he is in never moves
 * under his eyes: `next` (this render's `todayTop`) drawn over `prev` (the
 * top as last drawn).
 *   - A card whose session line left only because the tutor now writes in
 *     that session stays in its place, showing Working at 70%. Home's
 *     Today lists a session only while it waits on him, so without this
 *     the lesson would leave the top on every answer and come back on his
 *     turn. A kept session takes its course's line, as a waiting one does
 *     on Today, and the top keeps its count.
 *   - Session cards drawn before keep their order among themselves. Today
 *     puts the newest first, so answering the second would otherwise swap
 *     it to the top. A new card comes in where Today puts it, and a fresh
 *     draw (a reload) is Today's order again.
 * Pure.
 */
export function steadyTop(prev: readonly NowItem[], next: readonly NowItem[], inbox: UnitInbox, chats: readonly ChatListItem[]): NowItem[] {
	const lines = new Set(next.map((item) => item.line.key));
	const kept: { at: number; item: NowItem }[] = [];
	prev.forEach((item, at) => {
		if (lines.has(item.line.key)) return;
		const now = running(item, inbox, chats);
		if (now) kept.push({ at, item: now });
	});
	const keys = new Set(kept.map(({ item }) => itemKey(item)));
	const taken = new Set(kept.flatMap(({ item }) => (item.line.row.course ? [item.line.row.course.map.workspace] : [])));
	const top = next.filter((item) => !keys.has(itemKey(item)) && !(item.line.row.kind === "course" && taken.has(item.line.row.course.map.workspace)));
	for (const { at, item } of kept) top.splice(Math.min(at, top.length), 0, item);
	const held = kept.length > 0 ? top.slice(0, prev.length) : top;
	// Session cards drawn before go back into their own slots in the order they were drawn.
	const drawnAt = new Map(prev.map((item, at) => [item.line.key, at]));
	const isDrawnSession = (item: NowItem) => item.line.row.kind === "session" && drawnAt.has(item.line.key);
	const sessions = held.filter(isDrawnSession).sort((a, b) => drawnAt.get(a.line.key)! - drawnAt.get(b.line.key)!);
	return held.map((item) => (isDrawnSession(item) ? sessions.shift()! : item));
}
