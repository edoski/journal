"use client";

import { sessionState } from "@/components/nav/session-state";
import type { ChatListItem } from "@/src/core";
import { SESSIONS_WORDS } from "@/components/unit-inbox/now-inbox";
import type { NowListProps } from "@/components/unit-inbox/now-list-props";
import { SessionItem } from "@/components/unit-inbox/session-item";
import { UnitShelf } from "@/components/unit-inbox/unit-shelf";
import { sessionTwins } from "@/components/unit-inbox/units";

/**
 * The one list under Today (spec: now-shelves.md), T3 Code's thread list:
 * every session newest first, one line each, folded until opened, resting
 * at the bottom of a short list. Folded, it keeps in view the open page's
 * row and a session the tutor writes in that Today does not show, and
 * lights its dot while a hidden session waits on him. `said` holds the
 * sessions Today's top already speaks for (`saidOnTop`).
 */
export function SessionsShelf({
	sessions,
	said,
	today,
	folded,
	fold,
	pathname,
	s,
}: { sessions: readonly ChatListItem[]; said: ReadonlySet<string> } & Pick<NowListProps, "today" | "folded" | "fold" | "pathname" | "s">) {
	const twins = sessionTwins(sessions);
	const open = (c: ChatListItem) => pathname === `/chat/${c.id}`;
	const off = (c: ChatListItem) => !said.has(c.id);
	return (
		<>
			<li aria-hidden className="mt-auto list-none" />
			<UnitShelf
				id="sessions"
				label={SESSIONS_WORDS}
				items={sessions}
				folded={folded.sessions}
				onFoldedChange={(next) => fold("sessions", next)}
				keep={(c) => open(c) || (off(c) && sessionState(c) === "working")}
				waits={(c) => off(c) && sessionState(c) === "your-turn"}
				renderItem={(c) => <SessionItem key={c.id} chat={c} s={s} today={today} twin={twins.get(c.id)} parent="shelf:sessions" />}
			/>
		</>
	);
}
