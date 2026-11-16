"use client";

import { sessionState } from "@/components/nav/session-state";
import { useState } from "react";
import { heldStatuses, liveChat, NOW_SHELF_WORDS, plannedKeys, shelfStatus, steadyLearning, waitsOnYou, type RestShelves } from "@/components/unit-inbox/now-inbox";
import type { NowListProps } from "@/components/unit-inbox/now-list-props";
import { SessionItem } from "@/components/unit-inbox/session-item";
import { isUnitOpen, TopicCard, TopicSlimRow } from "@/components/unit-inbox/unit-row";
import { UnitShelf } from "@/components/unit-inbox/unit-shelf";
import { UnitStatusText } from "@/components/unit-inbox/unit-status";
import { sessionTwins, type Unit, type UnitStatus } from "@/components/unit-inbox/units";

/**
 * The shelves at the sidebar's foot (spec: unit-inbox.md, "Today on
 * top"), after a spacer that rests them at the
 * bottom of a short list: Working (cards, only while the tutor writes),
 * Learning, On your own and Other sessions, each folded until opened.
 * Every shelf row says when it comes back (Review in today's plan, "in
 * 5d"), else when he last studied it.
 */
export function NowShelves({
	shelves,
	courses,
	chats,
	today,
	folded,
	fold,
	pathname,
	s,
}: { shelves: RestShelves } & Pick<NowListProps, "courses" | "chats" | "today" | "folded" | "fold" | "pathname" | "s">) {
	const isOpen = (u: Unit) => isUnitOpen(u, pathname);
	const planned = plannedKeys(courses);
	const twins = sessionTwins(shelves.other);
	// While a lesson is live, Learning holds still (round 11, 3 n4): its own card says it waits on him, the cards of topics it touched keep the words they had when it went live.
	const live = liveChat(chats, pathname);
	const statusOf = (u: Unit) => shelfStatus(u, today, planned, live?.id ?? null);
	const [held, setHeld] = useState<{ live: string; statuses: ReadonlyMap<string, UnitStatus> } | null>(null);
	if ((live?.id ?? null) !== (held?.live ?? null)) setHeld(live ? { live: live.id, statuses: heldStatuses(shelves.learning, statusOf, live) } : null);
	const learning = steadyLearning(shelves.learning, statusOf, held?.statuses ?? null, live);
	const slim = (shelf: string) => (u: Unit) => (
		<TopicSlimRow
			key={u.key}
			unit={u}
			today={today}
			active={isOpen(u)}
			parent={`shelf:${shelf}`}
			status={<UnitStatusText status={shelf === "learning" ? learning.status(u) : statusOf(u)} />}
		/>
	);
	return (
		<>
			<li aria-hidden className="mt-auto list-none" />
			<UnitShelf
				id="working"
				label={NOW_SHELF_WORDS.working}
				items={shelves.working}
				folded={folded.working}
				onFoldedChange={(next) => fold("working", next)}
				isActive={isOpen}
				waits={() => false}
				renderItem={(u) => <TopicCard key={u.key} unit={u} today={today} active={isOpen(u)} parent="shelf:working" />}
			/>
			<UnitShelf
				id="learning"
				label={NOW_SHELF_WORDS.learning}
				items={learning.units}
				folded={folded.learning}
				onFoldedChange={(next) => fold("learning", next)}
				isActive={isOpen}
				waits={waitsOnYou}
				renderItem={slim("learning")}
			/>
			<UnitShelf
				id="known"
				label={NOW_SHELF_WORDS.known}
				items={shelves.known}
				folded={folded.known}
				onFoldedChange={(next) => fold("known", next)}
				isActive={isOpen}
				waits={() => false}
				renderItem={slim("known")}
			/>
			<UnitShelf
				id="other"
				label={NOW_SHELF_WORDS.other}
				items={shelves.other}
				folded={folded.other}
				onFoldedChange={(next) => fold("other", next)}
				isActive={(c) => pathname === `/chat/${c.id}`}
				waits={(c) => sessionState(c) === "your-turn"}
				renderItem={(c) => <SessionItem key={c.id} chat={c} s={s} today={today} twin={twins.get(c.id)} parent="shelf:other" />}
			/>
		</>
	);
}
