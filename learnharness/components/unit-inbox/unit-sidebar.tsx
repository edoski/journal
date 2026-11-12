"use client";

import { useMemo } from "react";
import Link from "next/link";
import { HouseIcon, PanelLeftCloseIcon, PlusIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { fuzzyScore, type ChatListItem } from "@/src/core";
import { useSidebar } from "@/components/sidebar";
import { filterSessions, useSessionsSidebar } from "@/components/sidebar-state";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { ActivitySection, useActivity } from "@/components/activity-dock";
import { LhMark } from "@/components/lh-mark";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { NavRow, NavRowLabel } from "@/components/nav/nav-row";
import { NavSection } from "@/components/nav/nav-section";
import { sessionState } from "@/components/nav/session-state";
import { CourseScope } from "@/components/unit-inbox/course-scope";
import { SessionItem, type SessionsSidebar } from "@/components/unit-inbox/session-item";
import { SHELF_TAIL, UnitShelf } from "@/components/unit-inbox/unit-shelf";
import { useUnitInbox } from "@/components/unit-inbox/use-unit-inbox";
import { SHELF_WORDS, SHELVES, type Unit, type UnitInbox } from "@/components/unit-inbox/units";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** What a candidate draws for one unit. `scoped` is true when the inbox
 *  lists one course, so a row need not name it. */
export interface UnitRowProps {
	unit: Unit;
	today: string;
	s: SessionsSidebar;
	scoped: boolean;
}

/** A candidate's answer to how a unit row holds its sessions: its row, and
 *  when that row is the open page (kept in view on a folded shelf). */
export interface UnitCandidate {
	Row: React.ComponentType<UnitRowProps>;
	isActive: (unit: Unit, pathname: string) => boolean;
}

const waits = (u: Unit) => u.now === "your-turn";

/** Every topic and session whose title matches the query, best first. Pure. */
function searchInbox(inbox: UnitInbox, chats: readonly ChatListItem[], query: string): { units: Unit[]; sessions: ChatListItem[] } {
	const units = [...inbox.learning, ...inbox.review, ...inbox.known]
		.map((u) => ({ u, score: fuzzyScore(query.trim(), u.topic.title) }))
		.filter((r): r is { u: Unit; score: number } => r.score !== null)
		.sort((a, b) => b.score - a.score)
		.map((r) => r.u);
	return { units, sessions: filterSessions([...chats], query) };
}

/**
 * The Proposed sidebar as a study inbox: the app mark and collapse, New
 * lesson, Home and a quiet search, the course scope, then the shelves:
 * Learning, Review and Known units, and the sessions tied to no unit.
 * Background agents show only while one runs; Settings sits at the foot.
 * The candidate draws each unit row.
 */
export function UnitSidebar({ candidate }: { candidate: UnitCandidate }) {
	const { open, toggle } = useSidebar();
	const { open: openSettings } = useSettingsDialog();
	const { feed } = useActivity();
	const running = feed.jobs.length > 0 || feed.extractions.length > 0;
	const s = useSessionsSidebar({ open, toggle });
	const { state, scope, setScope, folded, fold } = useUnitInbox(s.chats);
	const query = s.query.trim();
	const found = useMemo(
		() => (state.status === "ready" && query ? searchInbox(state.inbox, s.chats ?? [], query) : null),
		[state, s.chats, query],
	);
	const walked = s.kbdIndex !== null ? found?.sessions[s.kbdIndex]?.id : undefined;
	const { Row, isActive } = candidate;

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

				<nav aria-label="App" className="flex shrink-0 flex-col px-2">
					<Hint label="New lesson" action="new-session" side="right">
						<NavRow
							data-testid="new-session"
							onClick={(e) => {
								s.router.push("/chat/new");
								blurAfterPointerClick(e);
							}}
						>
							<PlusIcon />
							<NavRowLabel>New lesson</NavRowLabel>
						</NavRow>
					</Hint>
					<NavRow asChild active={s.pathname === "/"}>
						<Link href="/" onClick={blurAfterPointerClick}>
							<HouseIcon />
							<NavRowLabel>Home</NavRowLabel>
						</Link>
					</NavRow>
					<Hint label="Search topics and sessions" action="sessions-search" side="right">
						<div className="relative text-muted-foreground focus-within:text-foreground hover:text-foreground">
							<SearchIcon className="pointer-events-none absolute left-2 top-2 size-4" />
							<Input
								ref={s.searchRef}
								variant="quiet"
								data-testid="session-search"
								value={s.query}
								onChange={(e) => s.changeQuery(e.target.value)}
								onKeyDown={(e) => s.onSearchKeyDown(e, found?.sessions ?? null)}
								placeholder="Search"
								aria-label="Search topics and sessions"
								className="pl-8"
							/>
						</div>
					</Hint>
				</nav>

				<ScrollArea viewportRef={s.listRef} className="min-h-0 flex-1" viewportClassName="[&>div]:block! focus-visible:ring-inset">
					<div data-testid="unit-inbox" className="flex flex-col gap-3 px-2 pb-2 pt-3">
						{state.status === "loading" ? (
							<p className="px-2 text-row text-muted-foreground">Loading…</p>
						) : found ? (
							found.units.length + found.sessions.length === 0 ? (
								<p className="px-2 text-row text-muted-foreground">Nothing matches.</p>
							) : (
								<>
									{found.units.length > 0 && (
										<NavSection title="Topics">
											{found.units.map((u) => (
												<Row key={u.key} unit={u} today={state.inbox.today} s={s} scoped={scope !== null} />
											))}
										</NavSection>
									)}
									{found.sessions.length > 0 && (
										<NavSection title="Sessions">
											{found.sessions.map((c) => (
												<SessionItem key={c.id} chat={c} s={s} highlighted={c.id === walked} />
											))}
										</NavSection>
									)}
								</>
							)
						) : (
							<>
								<CourseScope courses={state.courses} scope={scope} onScopeChange={setScope} />
								{SHELVES.map((shelf) => (
									<UnitShelf
										key={shelf}
										label={SHELF_WORDS[shelf]}
										items={state.inbox[shelf]}
										folded={folded[shelf]}
										onFoldedChange={(next) => fold(shelf, next)}
										isActive={(u) => isActive(u, s.pathname)}
										waits={waits}
										tail={shelf === "known" ? SHELF_TAIL : undefined}
										renderItem={(u) => <Row key={u.key} unit={u} today={state.inbox.today} s={s} scoped={scope !== null} />}
									/>
								))}
								<UnitShelf
									label="Other sessions"
									items={state.inbox.other}
									folded={folded.other}
									onFoldedChange={(next) => fold("other", next)}
									isActive={(c) => s.pathname === `/chat/${c.id}`}
									waits={(c) => sessionState(c) === "your-turn"}
									tail={SHELF_TAIL}
									renderItem={(c) => <SessionItem key={c.id} chat={c} s={s} />}
								/>
								{SHELVES.every((shelf) => state.inbox[shelf].length === 0) && state.inbox.other.length === 0 && (
									<p className="px-2 text-row text-muted-foreground">Nothing studied yet. Start a lesson.</p>
								)}
							</>
						)}
					</div>
				</ScrollArea>

				{running && <ActivitySection variant="proposed" />}

				<div className="shrink-0 px-2 pb-2 pt-1">
					<Hint label="Settings" action="open-settings" side="right">
						<NavRow
							data-testid="settings-entry"
							onClick={(e) => {
								openSettings();
								blurAfterPointerClick(e);
							}}
						>
							<SettingsIcon />
							<NavRowLabel>Settings</NavRowLabel>
						</NavRow>
					</Hint>
				</div>
			</div>

			<DeleteSessionDialog chat={s.deleting} onClose={() => s.setDeleting(null)} onDeleted={s.onDeleted} />
		</aside>
	);
}
