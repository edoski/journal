"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PanelLeftCloseIcon, SearchIcon, SettingsIcon, SquarePenIcon, XIcon } from "lucide-react";
import { fuzzyScore, type ChatListItem } from "@/src/core";
import { useSidebar } from "@/components/sidebar";
import { filterSessions, useSessionsSidebar } from "@/components/sidebar-state";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { ActivitySection, useActivity } from "@/components/activity-dock";
import { LhMark } from "@/components/lh-mark";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { sessionState } from "@/components/nav/session-state";
import { CourseScope } from "@/components/unit-inbox/course-scope";
import { SessionItem } from "@/components/unit-inbox/session-item";
import { onSidebarTreeKeyDown } from "@/components/unit-inbox/sidebar-tree";
import { isUnitOpen, TopicCard, TopicSlimRow } from "@/components/unit-inbox/unit-row";
import { UnitShelf } from "@/components/unit-inbox/unit-shelf";
import { useUnitInbox } from "@/components/unit-inbox/use-unit-inbox";
import { SHELF_WORDS, type Unit, type UnitInbox } from "@/components/unit-inbox/units";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Every topic and session whose title matches the query, best first. Pure. */
function searchInbox(inbox: UnitInbox, chats: readonly ChatListItem[], query: string): { units: Unit[]; sessions: ChatListItem[] } {
	const units = [...inbox.active, ...inbox.working, ...inbox.known]
		.map((u) => ({ u, score: fuzzyScore(query.trim(), u.topic.title) }))
		.filter((r): r is { u: Unit; score: number } => r.score !== null)
		.sort((a, b) => b.score - a.score)
		.map((r) => r.u);
	return { units, sessions: filterSessions([...chats], query) };
}

/** A results heading, T3 Code's quiet 12px label. */
function ResultsLabel({ children }: { children: React.ReactNode }) {
	return <li className="flex h-8 list-none items-center px-2 text-label font-medium text-muted-foreground">{children}</li>;
}

const ICON_BUTTON =
	"lh-no-drag flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&>svg]:size-4";

/**
 * The Proposed sidebar (spec: unit-inbox.md), T3 Code's sidebar for topics:
 * the mark and collapse, then the search with the course filter and New
 * lesson beside it, then one list. The topics to act on come first with no
 * header, each a card that opens its page; the folded shelves sit at the
 * foot (Working, Known, Other sessions). Background agents show only while
 * one runs; Settings is the footer's icon.
 */
export function UnitSidebar() {
	const { open, toggle } = useSidebar();
	const { open: openSettings } = useSettingsDialog();
	const { feed } = useActivity();
	const running = feed.jobs.length > 0 || feed.extractions.length > 0;
	const s = useSessionsSidebar({ open, toggle });
	const { state, scope, setScope, folded, fold } = useUnitInbox(s.chats);
	const query = s.query.trim();
	const found = useMemo(() => (state.status === "ready" && query ? searchInbox(state.inbox, s.chats ?? [], query) : null), [state, s.chats, query]);
	const walked = s.kbdIndex !== null ? found?.sessions[s.kbdIndex]?.id : undefined;
	const isOpen = (u: Unit) => isUnitOpen(u, s.pathname);
	const today = state.status === "ready" ? state.inbox.today : "";
	const focusFirstRow = () => s.listRef.current?.querySelector<HTMLElement>("[data-sidebar-row]")?.focus();

	return (
		<aside
			className={cn("sidebar-motion shrink-0 overflow-hidden duration-200 motion-reduce:transition-none", open ? "w-64" : "w-0")}
			aria-hidden={!open}
			data-testid="sidebar"
		>
			<div className="flex h-full w-64 flex-col border-r bg-background">
				<div className="lh-drag lh-lights-gutter flex h-13 shrink-0 items-center justify-between px-2">
					<Link
						href="/"
						aria-label="Home"
						data-brand
						className="lh-no-drag flex h-8 items-center rounded-md px-2 outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						<LhMark className="size-5" />
					</Link>
					<Hint label="Close sidebar" action="toggle-sidebar">
						<Button variant="quiet" size="icon-row" aria-label="Close sidebar" onClick={toggle} className="lh-no-drag">
							<PanelLeftCloseIcon />
						</Button>
					</Hint>
				</div>

				<div data-slot="sidebar-header" className="flex shrink-0 items-center gap-1 px-2">
					<Hint label="Search topics and sessions" action="sessions-search" side="bottom">
						<label className="flex h-8 min-w-0 flex-1 cursor-text items-center gap-2 rounded-md px-2 text-control font-medium text-muted-foreground transition-colors focus-within:bg-fill-hover focus-within:text-foreground focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring/70 hover:bg-fill-hover hover:text-foreground motion-reduce:transition-none">
							<SearchIcon aria-hidden className="size-4 shrink-0" />
							<input
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
								aria-label="Search topics and sessions"
								spellCheck={false}
								className="min-w-0 flex-1 bg-transparent text-control font-medium text-foreground outline-none placeholder:text-muted-foreground"
							/>
							{s.query && (
								<button
									type="button"
									aria-label="Clear search"
									onClick={() => s.changeQuery("")}
									className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
								>
									<XIcon aria-hidden className="size-3.5" />
								</button>
							)}
						</label>
					</Hint>
					{state.status === "ready" && <CourseScope courses={state.courses} scope={scope} onScopeChange={setScope} />}
					<Hint label="New lesson" action="new-session" side="bottom">
						<button
							type="button"
							data-testid="new-session"
							aria-label="New lesson"
							className={ICON_BUTTON}
							onClick={(e) => {
								s.router.push("/chat/new");
								blurAfterPointerClick(e);
							}}
						>
							<SquarePenIcon />
						</button>
					</Hint>
				</div>

				<ScrollArea viewportRef={s.listRef} className="min-h-0 flex-1" viewportClassName="[&>div]:block! [&>div]:h-full focus-visible:ring-inset">
					<ul data-testid="unit-inbox" onKeyDown={onSidebarTreeKeyDown} className="flex min-h-full flex-col gap-px p-2">
						{state.status === "loading" ? (
							<li className="list-none px-2 py-6 text-center text-label text-muted-foreground">Loading…</li>
						) : found ? (
							found.units.length + found.sessions.length === 0 ? (
								<li className="list-none px-2 py-6 text-center text-label text-muted-foreground">Nothing matches</li>
							) : (
								<>
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
										<SessionItem key={c.id} chat={c} s={s} highlighted={c.id === walked} />
									))}
								</>
							)
						) : (
							<>
								{state.inbox.active.map((u) => (
									<TopicCard key={u.key} unit={u} today={today} active={isOpen(u)} />
								))}
								{state.inbox.active.length + state.inbox.working.length + state.inbox.known.length + state.inbox.other.length === 0 && (
									<li className="list-none px-2 py-6 text-center text-label text-muted-foreground">Nothing studied yet</li>
								)}
								<li aria-hidden className="mt-auto list-none" />
								<UnitShelf
									id="working"
									label={SHELF_WORDS.working}
									items={state.inbox.working}
									folded={folded.working}
									onFoldedChange={(next) => fold("working", next)}
									isActive={isOpen}
									waits={() => false}
									renderItem={(u) => <TopicCard key={u.key} unit={u} today={today} active={isOpen(u)} parent="shelf:working" />}
								/>
								<UnitShelf
									id="known"
									label={SHELF_WORDS.known}
									items={state.inbox.known}
									folded={folded.known}
									onFoldedChange={(next) => fold("known", next)}
									isActive={isOpen}
									waits={() => false}
									renderItem={(u) => <TopicSlimRow key={u.key} unit={u} today={today} active={isOpen(u)} parent="shelf:known" />}
								/>
								<UnitShelf
									id="other"
									label={SHELF_WORDS.other}
									items={state.inbox.other}
									folded={folded.other}
									onFoldedChange={(next) => fold("other", next)}
									isActive={(c) => s.pathname === `/chat/${c.id}`}
									waits={(c) => sessionState(c) === "your-turn"}
									renderItem={(c) => <SessionItem key={c.id} chat={c} s={s} parent="shelf:other" />}
								/>
							</>
						)}
					</ul>
				</ScrollArea>

				{running && <ActivitySection variant="proposed" />}

				<div data-slot="sidebar-footer" className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-1">
					<Hint label="Settings" action="open-settings" side="right">
						<button
							type="button"
							data-testid="settings-entry"
							aria-label="Settings"
							className={ICON_BUTTON}
							onClick={(e) => {
								openSettings();
								blurAfterPointerClick(e);
							}}
						>
							<SettingsIcon />
						</button>
					</Hint>
				</div>
			</div>

			<DeleteSessionDialog chat={s.deleting} onClose={() => s.setDeleting(null)} onDeleted={s.onDeleted} />
		</aside>
	);
}
