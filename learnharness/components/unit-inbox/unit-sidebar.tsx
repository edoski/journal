"use client";

import { useId, useMemo, useRef } from "react";
import Link from "next/link";
import { CalendarDaysIcon, HouseIcon, PanelLeftCloseIcon, SearchIcon, SettingsIcon, SquarePenIcon, XIcon } from "lucide-react";
import { fuzzyScore, KEYBOARD_ACTIONS, type ChatListItem, type StudyCourse } from "@/src/core";
import { useSidebar } from "@/components/sidebar";
import { filterSessions, useSessionsSidebar } from "@/components/sidebar-state";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { ActivitySection, useActivity } from "@/components/activity-dock";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { CourseResultRow } from "@/components/unit-inbox/course-result-row";
import { CourseScope } from "@/components/unit-inbox/course-scope";
import { nowFor, studyDay } from "@/components/unit-inbox/now-inbox";
import type { NowListProps } from "@/components/unit-inbox/now-list-props";
import { NowSkeleton } from "@/components/unit-inbox/now-skeleton";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { SessionItem } from "@/components/unit-inbox/session-item";
import { SidebarResizeHandle } from "@/components/unit-inbox/sidebar-resize-handle";
import { onSidebarTreeKeyDown } from "@/components/unit-inbox/sidebar-tree";
import { useSidebarWidth } from "@/components/unit-inbox/sidebar-width";
import { isUnitOpen, TopicCard, TopicSlimRow } from "@/components/unit-inbox/unit-row";
import { TodayList } from "@/components/unit-inbox/today/today-list";
import { useUnitInbox } from "@/components/unit-inbox/use-unit-inbox";
import { sessionTwins, type Unit, type UnitInbox } from "@/components/unit-inbox/units";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/** Every course, topic and session whose title matches the query, best
 *  first; courses only when the app has a course page to open. Pure. */
export function searchInbox(
	inbox: UnitInbox,
	chats: readonly ChatListItem[],
	query: string,
	courses: readonly StudyCourse[] = [],
): { courses: StudyCourse[]; units: Unit[]; sessions: ChatListItem[] } {
	const best = <T,>(items: readonly T[], title: (item: T) => string): T[] =>
		items
			.map((item) => ({ item, score: fuzzyScore(query.trim(), title(item)) }))
			.filter((r): r is { item: T; score: number } => r.score !== null)
			.sort((a, b) => b.score - a.score)
			.map((r) => r.item);
	return {
		courses: best(courses, (c) => c.map.title),
		units: best([...inbox.active, ...inbox.working, ...inbox.known], (u) => u.topic.title),
		sessions: filterSessions([...chats], query),
	};
}

/** Search's label and tooltip, in its shortcut's own words. */
const SEARCH_LABEL = KEYBOARD_ACTIONS.find((action) => action.id === "sessions-search")!.label;

/** A results heading, T3 Code's quiet 12px label. */
function ResultsLabel({ children }: { children: React.ReactNode }) {
	return <li className="flex h-8 list-none items-center px-2 text-label font-medium text-muted-foreground">{children}</li>;
}

/** A top row that opens a page, Home or Calendar: the selected fill on
 *  its own page. */
const navLinkClass = (here: boolean) =>
	cn(
		"flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-control font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
		here ? "bg-fill-selected text-foreground" : "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
	);

/**
 * The Proposed sidebar (spec: unit-inbox.md), T3 Code's sidebar for topics:
 * the mark and collapse, then the search with the course filter and New
 * lesson beside it, then one list: Home's Today, each line that needs him
 * now as a card that opens its page, with everything else on the folded
 * shelves at the foot (inbox-today.md). Background work shows only while
 * one runs; Settings is the footer's icon. Its right edge drags to resize,
 * as T3 Code's does; the width lasts across reloads.
 */
export function UnitSidebar() {
	const { open, toggle } = useSidebar();
	const { open: openSettings } = useSettingsDialog();
	const { feed } = useActivity();
	const running = feed.jobs.length > 0 || feed.extractions.length > 0;
	const s = useSessionsSidebar({ open, toggle });
	const { state, scope, setScope, folded, fold } = useUnitInbox(s.chats);
	const query = s.query.trim();
	const found = useMemo(
		() => (state.status === "ready" && query ? searchInbox(state.inbox, s.chats ?? [], query, state.courses) : null),
		[state, s.chats, query],
	);
	// The list's top is Home's Today (inbox-today.md).
	const now = useMemo<NowListProps | null>(() => {
		if (state.status !== "ready") return null;
		const today = studyDay(state.inbox.today, new Date());
		return {
			needs: nowFor(state.courses, state.chats, scope, today),
			inbox: state.inbox,
			courses: state.courses,
			chats: state.chats,
			today,
			unavailable: state.unavailable,
			folded,
			fold,
			pathname: s.pathname,
			s,
		};
	}, [state, scope, folded, fold, s]);
	const walked = s.kbdIndex !== null ? found?.sessions[s.kbdIndex]?.id : undefined;
	const isOpen = (u: Unit) => isUnitOpen(u, s.pathname);
	const today = state.status === "ready" ? state.inbox.today : "";
	const foundTwins = useMemo(() => sessionTwins(found?.sessions ?? []), [found]);
	const focusFirstRow = () => s.listRef.current?.querySelector<HTMLElement>("[data-sidebar-row]")?.focus();
	const width = useSidebarWidth();
	const sidebarRef = useRef<HTMLElement>(null);
	const sidebarId = useId();

	return (
		<>
			<aside
				ref={sidebarRef}
				id={sidebarId}
				style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
				className={cn("sidebar-motion shrink-0 overflow-hidden duration-200 motion-reduce:transition-none", open ? "w-(--sidebar-width)" : "w-0")}
				aria-hidden={!open}
				data-testid="sidebar"
			>
				<div className="flex h-full w-(--sidebar-width) flex-col border-r bg-background">
					<div className="lh-drag lh-lights-band shrink-0" />

					<div className="lh-drag mb-px flex shrink-0 items-center gap-1 px-2 pt-2">
						<Link
							href="/"
							data-slot="sidebar-home"
							aria-current={s.pathname === "/" ? "page" : undefined}
							onClick={blurAfterPointerClick}
							className={navLinkClass(s.pathname === "/")}
						>
							<HouseIcon aria-hidden className="size-4 shrink-0" />
							Home
						</Link>
						<Hint label="Close sidebar" action="toggle-sidebar">
							<Button variant="quiet" size="icon-bar" aria-label="Close sidebar" onClick={toggle} className="lh-no-drag">
								<PanelLeftCloseIcon />
							</Button>
						</Hint>
					</div>

					<div className="mb-px flex shrink-0 gap-1 px-2">
						<Link
							href="/calendar"
							data-slot="sidebar-calendar"
							aria-current={s.pathname === "/calendar" ? "page" : undefined}
							onClick={blurAfterPointerClick}
							className={navLinkClass(s.pathname === "/calendar")}
						>
							<CalendarDaysIcon aria-hidden className="size-4 shrink-0" />
							Calendar
						</Link>
						{/* Ends where Home's and Search's fills end, before their buttons. */}
						<span aria-hidden className="size-7 shrink-0" />
					</div>

					<div data-slot="sidebar-header" className="flex shrink-0 items-center gap-1 px-2">
						<InputGroup
							variant="quiet"
							className="flex-1 pr-0.5 text-control font-medium text-muted-foreground hover:text-foreground focus-within:text-foreground"
						>
							<Hint label={SEARCH_LABEL} action="sessions-search" side="bottom">
								<label className="flex h-full min-w-0 flex-1 cursor-text items-center gap-2 pl-2">
									<SearchIcon aria-hidden className="size-4 shrink-0" />
									<InputGroupInput
										ref={s.searchRef}
										data-testid="session-search"
										value={s.query}
										onChange={(e) => s.changeQuery(e.target.value)}
										onKeyDown={(e) => {
											if (!query && e.key === "ArrowDown") {
												e.preventDefault();
												focusFirstRow();
												return;
											}
											s.onSearchKeyDown(e, found?.sessions ?? null);
										}}
										placeholder="Search"
										aria-label={SEARCH_LABEL}
										spellCheck={false}
										className="h-auto px-0 py-0 text-control font-medium text-foreground md:text-control"
									/>
									{s.query && (
										<InputGroupButton variant="quiet" size="icon-xs" aria-label="Clear search" onClick={() => s.changeQuery("")} className="size-5 hover:bg-transparent">
											<XIcon aria-hidden className="size-3.5" />
										</InputGroupButton>
									)}
								</label>
							</Hint>
							{state.status === "ready" && <CourseScope courses={state.courses} scope={scope} onScopeChange={setScope} />}
						</InputGroup>
						<Hint label="New lesson" action="new-session" side="bottom">
							<Button
								variant="quiet"
								size="icon-bar"
								data-testid="new-session"
								aria-label="New lesson"
								className="lh-no-drag"
								onClick={(e) => {
									s.router.push("/chat/new");
									blurAfterPointerClick(e);
								}}
							>
								<SquarePenIcon />
							</Button>
						</Hint>
					</div>

					<ScrollArea viewportRef={s.listRef} bar={false} className="min-h-0 flex-1" viewportClassName="[&>div]:block! [&>div]:h-full focus-visible:ring-inset">
						<ul data-testid="unit-inbox" onKeyDown={onSidebarTreeKeyDown} className="flex min-h-full flex-col gap-px p-2">
							{!now ? (
								<NowSkeleton />
							) : found ? (
								found.courses.length + found.units.length + found.sessions.length === 0 ? (
									<li className="list-none px-2 py-6 text-center text-label text-muted-foreground">Nothing matches</li>
								) : (
									<>
										{found.courses.length > 0 && <ResultsLabel>Courses</ResultsLabel>}
										{found.courses.map((c) => (
											<CourseResultRow key={c.map.workspace} course={c} active={s.pathname === courseHref(c.map.workspace)} />
										))}
										{found.units.length > 0 && <ResultsLabel>Topics</ResultsLabel>}
										{found.units.map((u) =>
											u.shelf === "known" ? (
												<TopicSlimRow key={u.key} unit={u} today={today} active={isOpen(u)} />
											) : (
												<TopicCard key={u.key} unit={u} today={today} active={isOpen(u)} />
											),
										)}
										{found.sessions.length > 0 && <ResultsLabel>Sessions</ResultsLabel>}
										{found.sessions.map((c) => (
											<SessionItem key={c.id} chat={c} s={s} today={today} twin={foundTwins.get(c.id)} highlighted={c.id === walked} />
										))}
									</>
								)
							) : (
								<TodayList {...now} />
							)}
						</ul>
					</ScrollArea>

					{running && <ActivitySection />}

					<div data-slot="sidebar-footer" className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-1">
						<Hint label="Settings" action="open-settings" side="right">
							<Button
								variant="quiet"
								size="icon-bar"
								data-testid="settings-entry"
								aria-label="Settings"
								onClick={(e) => {
									openSettings();
									blurAfterPointerClick(e);
								}}
							>
								<SettingsIcon />
							</Button>
						</Hint>
					</div>
				</div>

				<DeleteSessionDialog chat={s.deleting} onClose={() => s.setDeleting(null)} onDeleted={s.onDeleted} />
			</aside>
			{open && <SidebarResizeHandle width={width} sidebarId={sidebarId} sidebar={sidebarRef} />}
		</>
	);
}
