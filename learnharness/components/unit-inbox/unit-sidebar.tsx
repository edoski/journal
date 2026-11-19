"use client";

import { useId, useMemo, useRef } from "react";
import Link from "next/link";
import { CalendarDaysIcon, HouseIcon, PanelLeftCloseIcon, SearchIcon, SettingsIcon, SquarePenIcon, XIcon } from "lucide-react";
import { KEYBOARD_ACTIONS, type ChatListItem, type CourseMapArc, type StudyCourse } from "@/src/core";
import { useSidebar } from "@/components/sidebar";
import { filterSessions, opensSearchResult, rankByTitle, titleScore, useSessionsSidebar } from "@/components/sidebar-state";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { ActivitySection, toBlobs, useActivity } from "@/components/activity-dock";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { CourseResultRow } from "@/components/unit-inbox/course-result-row";
import { CourseScope } from "@/components/unit-inbox/course-scope";
import { nowFor, studyDay, unitFor } from "@/components/unit-inbox/now-inbox";
import type { NowListProps } from "@/components/unit-inbox/now-list-props";
import { NowSkeleton } from "@/components/unit-inbox/now-skeleton";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { SessionItem } from "@/components/unit-inbox/session-item";
import { SidebarRail } from "@/components/unit-inbox/sidebar-rail";
import { SidebarResizeHandle } from "@/components/unit-inbox/sidebar-resize-handle";
import { onSidebarTreeKeyDown } from "@/components/unit-inbox/sidebar-tree";
import { useSidebarWidth } from "@/components/unit-inbox/sidebar-width";
import { isUnitOpen, TopicCard } from "@/components/unit-inbox/unit-row";
import { TodayList } from "@/components/unit-inbox/today/today-list";
import { useUnitInbox } from "@/components/unit-inbox/use-unit-inbox";
import { sessionsNow, sessionTwins, unitKey, type Unit, type UnitInbox } from "@/components/unit-inbox/units";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { StartFailure, StartScope } from "@/components/start/start-scope";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { cn } from "@/lib/utils";

/** An arc search found, with its course. */
export interface FoundArc {
	course: StudyCourse;
	arc: CourseMapArc;
}

/** Every course, arc, topic and session whose title matches the query
 *  (`titleScore`), best first, sessions newest first, and `top`, the row
 *  Enter opens: the best match of all, the first shown on a tie (its
 *  `data-sidebar-row`); courses and arcs only when the app has a course page to
 *  open, an arc read from the course's map (`map.arcs`). Topics are
 *  every topic on the courses' maps in the inbox's scope, those not
 *  started included (a unit built for each, `unitFor`): the inbox lists
 *  only topics he has started, so search missed Poisson until he began it
 *  (round 4). Pure. */
export function searchInbox(
	inbox: UnitInbox,
	chats: readonly ChatListItem[],
	query: string,
	courses: readonly StudyCourse[] = [],
): { courses: StudyCourse[]; arcs: FoundArc[]; units: Unit[]; sessions: ChatListItem[]; top: string | null } {
	const best = <T,>(items: readonly T[], title: (item: T) => string): T[] => rankByTitle(items, query, title);
	const found = {
		courses: best(courses, (c) => c.map.title),
		arcs: best(
			courses.flatMap((course) => (course.map.arcs ?? []).map((arc) => ({ course, arc }))),
			(found) => found.arc.title,
		),
		units: best(everyTopic(inbox, chats, courses), (u) => u.topic.title),
		// Sessions are history: newest first, as everywhere they are listed.
		sessions: filterSessions([...chats], query, (chat, handle) => courses.find((c) => c.map.workspace === chat.course?.workspace)?.map.topics.find((t) => t.handle === handle)?.title).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
	};
	// In the order the rows are drawn, each with its row's name and title.
	const shown: Array<[string, string]> = [
		...found.courses.map((c): [string, string] => [`course:${c.map.workspace}`, c.map.title]),
		...found.arcs.map(({ course, arc }): [string, string] => [`arc:${course.map.workspace}#${arc.handle}`, arc.title]),
		...found.units.map((u): [string, string] => [u.key, u.topic.title]),
		...found.sessions.map((c): [string, string] => [`chat:${c.id}`, c.title]),
	];
	const top = shown.reduce<[string, number] | null>((at, [key, title]) => {
		const score = titleScore(title, query);
		return at && at[1] >= score ? at : [key, score];
	}, null);
	return { ...found, top: top?.[0] ?? null };
}

/** The inbox's units, then a unit for every other topic on the maps of
 *  the courses it keeps, each saying what every session tied to it does
 *  now (`sessionsNow`), as its page and Today's top say: a topic a waiting
 *  lesson worked on reads Your turn here too (round 6: Eigenvalues read
 *  "Back in 1d" in search and "Your turn" on Home). Pure. */
function everyTopic(inbox: UnitInbox, chats: readonly ChatListItem[], courses: readonly StudyCourse[]): Unit[] {
	const listed = [...inbox.active, ...inbox.working, ...inbox.known];
	const keys = new Set(listed.map((u) => u.key));
	const kept = courses.filter((c) => inbox.scope == null || c.map.workspace === inbox.scope);
	const rest = kept.flatMap((c) => c.map.topics.filter((t) => !keys.has(unitKey(c.map.workspace, t.handle))).map((t) => unitFor(c, t, chats)));
	return [...listed, ...rest].map((u) => ({ ...u, now: sessionsNow(u.sessions) }));
}

/** Search's label and tooltip, in its shortcut's own words. */
const SEARCH_LABEL = KEYBOARD_ACTIONS.find((action) => action.id === "sessions-search")!.label;

/** A results heading, T3 Code's quiet 12px label. */
function ResultsLabel({ children }: { children: React.ReactNode }) {
	return <li className="flex h-8 list-none items-center px-2 text-callout text-muted-foreground">{children}</li>;
}

/** A top row that opens a page, Home or Calendar: the selected fill on
 *  its own page. */
const navLinkClass = (here: boolean) =>
	cn(
		"flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-body outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
		here ? "bg-fill-selected text-foreground" : "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
	);

/**
 * The Proposed sidebar (spec: unit-inbox.md), T3 Code's sidebar for topics:
 * the mark and collapse, then the search with the course filter and New
 * lesson beside it, then one list: Home's Today, each line that needs him
 * now as a card that opens its page, with everything else on the folded
 * shelves at the foot (inbox-today.md). Background work shows only while
 * one runs; Settings is the footer's icon. Every press in it that starts a
 * lesson (a topic's, a Today card's) goes through its one start
 * (`StartScope`): signed out, sign-in opens; a start that fails says so in
 * the footer beside Settings, out of the list, so no row moves and it shows
 * at any scroll. Its right edge drags to resize,
 * as T3 Code's does; the width lasts across reloads. Folded, it is a rail
 * of icons (`SidebarRail`).
 */
export function UnitSidebar() {
	const { open, toggle } = useSidebar();
	const { open: openSettings } = useSettingsDialog();
	const { feed } = useActivity();
	const running = toBlobs(feed).length > 0;
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
			unreadable: state.unreadable,
			chats: state.chats,
			today,
			unavailable: state.unavailable,
			folded,
			fold,
			pathname: s.pathname,
			s,
		};
	}, [state, scope, folded, fold, s]);
	// A found topic's press reads its course's map, as its page does (`topicPress`).
	const maps = useMemo(() => new Map(state.status === "ready" ? state.courses.map((c) => [c.map.workspace, c.map]) : []), [state]);
	const walked = s.kbdIndex !== null ? found?.sessions[s.kbdIndex]?.id : undefined;
	const isOpen = (u: Unit) => isUnitOpen(u, s.pathname);
	const today = state.status === "ready" ? state.inbox.today : "";
	const foundTwins = useMemo(() => sessionTwins(found?.sessions ?? []), [found]);
	const focusFirstRow = () => s.listRef.current?.querySelector<HTMLElement>("[data-sidebar-row]")?.focus();
	const width = useSidebarWidth();
	const sidebarRef = useRef<HTMLElement>(null);
	const sidebarId = useId();
	const lesson = useLessonStart();

	return (
		<StartScope lesson={lesson}>
			<aside
				ref={sidebarRef}
				id={sidebarId}
				style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
				className={cn("sidebar-width-motion relative z-20 shrink-0", open ? "w-(--sidebar-width)" : "w-12")}
				data-testid="sidebar"
				data-state={open ? "open" : "folded"}
			>
				{/* One sidebar, folded by its edge (unit-inbox.md, "Folded"): the
				    rail lies under the panel, always drawn, and the panel's right
				    edge sweeps between its width and the window's left while
				    everything in it holds still, cut off by the moving edge, so
				    the rail is uncovered (or covered) in the same motion. No layer
				    fades. Only transforms move: the page takes its new width once
				    and never re-lays out frame by frame, so a heavy page (Home's
				    map) cannot stall the sweep. The hidden one is inert. */}
				<div inert={open} className="absolute inset-y-0 left-0 w-12">
					<SidebarRail pathname={s.pathname} onNewLesson={() => s.router.push("/chat/new")} onSettings={openSettings} />
				</div>
				<div
					inert={!open}
					data-slot="sidebar-panel"
					className={cn(
						"sidebar-motion absolute inset-y-0 left-0 w-(--sidebar-width) overflow-hidden border-r bg-background",
						!open && "invisible -translate-x-(--sidebar-width)",
					)}
				>
				<div data-slot="sidebar-panel-content" className={cn("sidebar-motion flex size-full flex-col", !open && "translate-x-(--sidebar-width)")}>
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
							className="flex-1 pr-0.5 text-body text-muted-foreground hover:text-foreground focus-within:text-foreground"
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
											s.onSearchKeyDown(e, found?.sessions ?? null, found?.top ?? null);
										}}
										placeholder="Search"
										aria-label={SEARCH_LABEL}
										spellCheck={false}
										className="h-auto px-0 py-0 text-body text-foreground"
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

					<div ref={s.listRef} className="min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
						<ul data-testid="unit-inbox" onKeyDown={onSidebarTreeKeyDown} onClick={(e) => { if (found && opensSearchResult(e.target)) s.changeQuery(""); }} className="flex min-h-full flex-col gap-px p-2">
							{!now ? (
								<NowSkeleton />
							) : found ? (
								found.courses.length + found.arcs.length + found.units.length + found.sessions.length === 0 ? (
									<li className="list-none px-2 py-6 text-center text-callout text-muted-foreground">Nothing matches</li>
								) : (
									<>
										{found.courses.length + found.arcs.length > 0 && <ResultsLabel>Courses</ResultsLabel>}
										{found.courses.map((c) => (
											<CourseResultRow key={c.map.workspace} course={c} active={s.pathname === courseHref(c.map.workspace)} />
										))}
										{found.arcs.map(({ course, arc }) => (
											<CourseResultRow key={`${course.map.workspace}#${arc.handle}`} course={course} arc={arc} active={false} />
										))}
										{found.units.length > 0 && <ResultsLabel>Topics</ResultsLabel>}
										{/* One row design for every topic found: its course, then its title (round 6: known topics drew slim rows among the cards). */}
										{found.units.map((u) => (
											<TopicCard key={u.key} unit={u} map={maps.get(u.course.workspace)!} chats={s.chats ?? []} today={today} active={isOpen(u)} />
										))}
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
					</div>

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
						<StartFailure className="min-w-0 flex-1 text-callout" />
					</div>
				</div>
				</div>

				<DeleteSessionDialog chat={s.deleting} onClose={() => s.setDeleting(null)} onDeleted={s.onDeleted} />
			</aside>
			{open && <SidebarResizeHandle width={width} sidebarId={sidebarId} sidebar={sidebarRef} />}
		</StartScope>
	);
}
