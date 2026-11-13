"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { NowCard } from "@/components/unit-inbox/now-card";
import { restShelves } from "@/components/unit-inbox/now-inbox";
import type { NowListProps } from "@/components/unit-inbox/now-list-props";
import { NowShelves } from "@/components/unit-inbox/now-shelves";
import { SidebarNote } from "@/components/unit-inbox/sidebar-note";
import { isUnitOpen } from "@/components/unit-inbox/unit-row";
import { CompanionRow } from "@/components/unit-inbox/topics/companion-row";
import { CompanionTail } from "@/components/unit-inbox/topics/companion-tail";
import { topicsTop, topKeys, type Companion } from "@/components/unit-inbox/topics/topics-top";

/**
 * The Inbox candidate "topics" (spec: ../inbox-topics.md): Today's lines at
 * topic grain. Each line's lead topic is a card with the line's reason and
 * action; under a course line, the other topics its lesson takes up are
 * quiet one-line rows, each with its reason as an icon, at most two and
 * then "Show N more", which opens that line's rest in place and turns
 * into "Show less" (not remembered). Everything else folds onto the
 * shelves.
 */
export function TopicsList(props: NowListProps) {
	const { needs, inbox, courses, chats, unavailable, pathname } = props;
	const items = useMemo(() => topicsTop(needs, inbox, chats), [needs, inbox, chats]);
	const shelves = useMemo(() => restShelves(inbox, topKeys(items)), [inbox, items]);
	const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
	const [focusTo, setFocusTo] = useState<string | null>(null);
	useEffect(() => {
		if (focusTo === null) return;
		document.querySelector<HTMLElement>(`[data-sidebar-row="${CSS.escape(focusTo)}"]`)?.focus();
		setFocusTo(null);
	}, [focusTo]);
	const companion = (c: Companion) => <CompanionRow key={c.unit.key} companion={c} active={isUnitOpen(c.unit, pathname)} />;
	return (
		<>
			{items.map((item) => {
				switch (item.kind) {
					case "topic":
						return <NowCard key={`card:${item.line.key}`} line={item.line} unit={item.unit} active={isUnitOpen(item.unit, pathname)} />;
					case "session":
						return <NowCard key={`card:${item.line.key}`} line={item.line} unit={null} active={pathname === `/chat/${item.chat.id}`} />;
					case "companion":
						return companion(item);
					case "more": {
						const open = opened.has(item.line.key);
						const rowKey = `more:${item.line.key}`;
						return (
							<Fragment key={rowKey}>
								{open && item.rest.map(companion)}
								<CompanionTail
									count={item.rest.length}
									open={open}
									rowKey={rowKey}
									parent={item.parent}
									onToggle={() => {
										setOpened((prev) => {
											const next = new Set(prev);
											if (open) next.delete(item.line.key);
											else next.add(item.line.key);
											return next;
										});
										if (!open) setFocusTo(item.rest[0]!.unit.key);
									}}
								/>
							</Fragment>
						);
					}
				}
			})}
			{unavailable ? (
				<SidebarNote>Couldn’t read your courses</SidebarNote>
			) : courses.length === 0 ? (
				<SidebarNote>No courses yet</SidebarNote>
			) : (
				items.length === 0 && <SidebarNote>Nothing needs you today</SidebarNote>
			)}
			<NowShelves shelves={shelves} {...props} />
		</>
	);
}
