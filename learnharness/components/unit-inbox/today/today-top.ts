import type { ChatListItem } from "@/src/core";
import { sessionState } from "@/components/nav/session-state";
import type { NeedsYou, NowLine } from "@/components/study-home/needs-you";
import { sessionKey, topicUnit } from "@/components/unit-inbox/now-inbox";
import type { Unit, UnitInbox } from "@/components/unit-inbox/units";

/**
 * One card on the sidebar's top (spec:
 * ../inbox-today.md): a Today line drawn as the topic it leads with, or a
 * waiting session whose transcript holds no topic of its course's map (or
 * that has no course) drawn as itself.
 */
export type NowItem = { kind: "topic"; line: NowLine; unit: Unit } | { kind: "session"; line: NowLine; chat: ChatListItem };

/** The key an item holds in `restShelves`' `onTop`, and the keyboard walk's
 *  row name: the unit's key, or `chat:<id>`. Pure. */
export const itemKey = (item: NowItem): string => (item.kind === "topic" ? item.unit.key : sessionKey(item.chat.id));

/**
 * The sidebar's top: Today's lines (`needs.lines`, at most five, in Home's
 * order), one card each. A line with a lead topic is that topic's unit, the
 * inbox's own else one built for it (a lead not started yet); a waiting
 * session with no lead is its session card; a course line with no lead
 * (nothing to start) is skipped. A topic two lines lead with is listed
 * once, at the first. Home's "also" lines are not drawn: their topics stay
 * on the shelves. Pure.
 */
export function todayTop(needs: NeedsYou, inbox: UnitInbox, chats: readonly ChatListItem[]): NowItem[] {
	const seen = new Set<string>();
	const items: NowItem[] = [];
	for (const line of needs.lines) {
		const { row, lead } = line;
		const item: NowItem | null =
			lead && row.course
				? { kind: "topic", line, unit: topicUnit(inbox, row.course, lead, chats) }
				: row.kind === "session"
					? { kind: "session", line, chat: row.chat }
					: null;
		if (!item || seen.has(itemKey(item))) continue;
		seen.add(itemKey(item));
		items.push(item);
	}
	return items;
}

/** A session line's card as it is now while the tutor writes in its
 *  session, or null: its topic, which the inbox now lists as Working, or
 *  the session card's session, running and still in the list's scope (a
 *  session on no listed topic is on the inbox's Other). Pure. */
function running(item: NowItem, inbox: UnitInbox, chats: readonly ChatListItem[]): NowItem | null {
	const { row } = item.line;
	if (row.kind !== "session") return null;
	const chat = chats.find((c) => c.id === row.chat.id);
	if (!chat || sessionState(chat) !== "working") return null;
	const line = { ...item.line, row: { ...row, chat } };
	if (item.kind === "topic") {
		const unit = inbox.working.find((u) => u.key === item.unit.key);
		return unit ? { kind: "topic", line, unit } : null;
	}
	return inbox.other.some((c) => c.id === chat.id) ? { kind: "session", line, chat } : null;
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
