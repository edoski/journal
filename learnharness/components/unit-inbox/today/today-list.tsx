"use client";

import { useMemo, useState } from "react";
import { NowCard } from "@/components/unit-inbox/now-card";
import { restShelves } from "@/components/unit-inbox/now-inbox";
import type { NowListProps } from "@/components/unit-inbox/now-list-props";
import { NowShelves } from "@/components/unit-inbox/now-shelves";
import { SidebarNote } from "@/components/unit-inbox/sidebar-note";
import { claimedKeys, steadyTop, todayTop, type NowItem } from "@/components/unit-inbox/today/today-top";
import { isUnitOpen } from "@/components/unit-inbox/unit-row";

/** The list's one quiet note under the cards, or none: the courses could
 *  not be read, there are none, or none of Today's lines has a card. */
function noteOf({ unavailable, courses }: Pick<NowListProps, "unavailable" | "courses">, cards: number): string | null {
	if (unavailable) return "Couldn’t read your courses";
	if (courses.length === 0) return "No courses yet";
	return cards === 0 ? "Nothing needs you today" : null;
}

/**
 * The sidebar's list (spec: ../inbox-today.md): its top
 * is exactly Home's Today, one card per line in Today's order with Today's
 * reason, each drawn as the topic its line leads with (a waiting session on
 * no topic as itself); everything else folds onto the shelves at the foot.
 * No header and no totals on top: cards leave as the day's plan empties,
 * and a card stays in its place, at 70% with Working, while the tutor
 * writes in its session.
 */
export function TodayList(props: NowListProps) {
	const { needs, inbox, chats, pathname } = props;
	const fresh = useMemo(() => todayTop(needs, inbox, chats), [needs, inbox, chats]);
	// The top as last drawn, so a card whose session the tutor now writes in
	// keeps its place through the turn (`steadyTop`).
	const [drawn, setDrawn] = useState({ fresh, top: fresh });
	let top = drawn.top;
	if (drawn.fresh !== fresh) {
		top = steadyTop(drawn.top, fresh, inbox, chats);
		setDrawn({ fresh, top });
	}
	const shelves = useMemo(() => restShelves(inbox, new Set(top.flatMap(claimedKeys))), [inbox, top]);
	const isOpen = (item: NowItem) => (item.kind === "topic" ? isUnitOpen(item.unit, pathname) : pathname === `/chat/${item.chat.id}`);
	const note = noteOf(props, top.length);
	return (
		<>
			{top.map((item) => (
				<NowCard key={item.line.key} line={item.line} unit={item.kind === "topic" ? item.unit : null} active={isOpen(item)} />
			))}
			{note && <SidebarNote>{note}</SidebarNote>}
			<NowShelves shelves={shelves} {...props} />
		</>
	);
}
