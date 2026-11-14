"use client";

import { sessionState } from "@/components/nav/session-state";
import { NOW_SHELF_WORDS, plannedKeys, shelfStatus, waitsOnYou, type RestShelves } from "@/components/unit-inbox/now-inbox";
import type { NowListProps } from "@/components/unit-inbox/now-list-props";
import { SessionItem } from "@/components/unit-inbox/session-item";
import { isUnitOpen, TopicCard, TopicSlimRow } from "@/components/unit-inbox/unit-row";
import { UnitShelf } from "@/components/unit-inbox/unit-shelf";
import { UnitStatusText } from "@/components/unit-inbox/unit-status";
import { sessionTwins, type Unit } from "@/components/unit-inbox/units";

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
	today,
	folded,
	fold,
	pathname,
	s,
}: { shelves: RestShelves } & Pick<NowListProps, "courses" | "today" | "folded" | "fold" | "pathname" | "s">) {
	const isOpen = (u: Unit) => isUnitOpen(u, pathname);
	const planned = plannedKeys(courses);
	const twins = sessionTwins(shelves.other);
	const slim = (shelf: string) => (u: Unit) => (
		<TopicSlimRow
			key={u.key}
			unit={u}
			today={today}
			active={isOpen(u)}
			parent={`shelf:${shelf}`}
			status={<UnitStatusText status={shelfStatus(u, today, planned)} />}
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
				items={shelves.learning}
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
