"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DumbbellIcon, NetworkIcon, PanelLeftCloseIcon, PlusIcon, SearchIcon, SettingsIcon, SunIcon } from "lucide-react";
import { courseLabel, type ChatListItem } from "@/src/core";
import { useSidebar } from "@/components/sidebar";
import { filterSessions, useSessionsSidebar } from "@/components/sidebar-state";
import { MenuShell } from "@/components/menu-shell";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { ActivitySection, useActivity } from "@/components/activity-dock";
import { CoverageMenuBlock } from "@/components/extraction-coverage";
import { LhMark } from "@/components/lh-mark";
import { BrailleSpinner } from "@/components/braille-spinner";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { NavRow, NavRowLabel, NavRowTrailing } from "@/components/nav/nav-row";
import { NavSection } from "@/components/nav/nav-section";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Sessions of one course, in the list's own order (most recent first). */
export interface CourseGroup {
	key: string;
	label: string;
	sessions: ChatListItem[];
}

const NO_COURSE = "No course";

/** Groups the list by course, each course placed by its most recent session;
 *  sessions older than the course rule go last, under "No course". Pure. */
export function groupByCourse(list: readonly ChatListItem[]): CourseGroup[] {
	const groups = new Map<string, CourseGroup>();
	const unlinked: ChatListItem[] = [];
	for (const chat of list) {
		if (!chat.course) {
			unlinked.push(chat);
			continue;
		}
		const key = chat.course.workspace;
		const group = groups.get(key) ?? { key, label: courseLabel(chat.course), sessions: [] };
		group.sessions.push(chat);
		groups.set(key, group);
	}
	const ordered = [...groups.values()];
	if (unlinked.length > 0) ordered.push({ key: "", label: NO_COURSE, sessions: unlinked });
	return ordered;
}

/** How long ago, in the fewest characters a trailing column can hold:
 *  "now", "40m", "3h", "2d", "3w", "4mo", "1y". Pure. */
export function shortTimeAgo(iso: string, now = new Date()): string {
	const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
	if (min < 1) return "now";
	if (min < 60) return `${min}m`;
	const h = Math.floor(min / 60);
	if (h < 24) return `${h}h`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d`;
	if (d < 30) return `${Math.floor(d / 7)}w`;
	if (d < 365) return `${Math.floor(d / 30)}mo`;
	return `${Math.floor(d / 365)}y`;
}

/** What the session waits on, if anything: the tutor's question or a posed
 *  practice problem. */
function waitingFor(chat: ChatListItem): string | null {
	if (chat.pendingQuestion) return "Waiting for input";
	if (chat.kind === "practice" && chat.pendingProblem) return "Problem waiting";
	return null;
}

/** One session: its title, then a practice glyph, a dot when it waits on the
 *  learner, and how long ago, or the spinner while a turn runs. */
export function SessionRowNext({
	chat,
	active,
	highlighted = false,
	onOpen,
	onContextMenu,
}: {
	chat: ChatListItem;
	active: boolean;
	highlighted?: boolean;
	onOpen: () => void;
	onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
	const waiting = waitingFor(chat);
	const working = chat.busy || chat.compacting;
	return (
		<NavRow
			active={active}
			highlighted={highlighted}
			onClick={(e) => {
				onOpen();
				blurAfterPointerClick(e);
			}}
			onContextMenu={onContextMenu}
			data-testid={highlighted ? "session-row-kbd" : "session-row"}
		>
			<NavRowLabel>{chat.title}</NavRowLabel>
			<NavRowTrailing>
				{chat.kind === "practice" && <DumbbellIcon className="size-4" aria-label="Practice session" />}
				{waiting && !working && (
					<span data-testid="session-waiting" className="size-1.5 rounded-full bg-link">
						<span className="sr-only">{waiting}</span>
					</span>
				)}
				{working ? (
					<span className="flex items-center">
						<BrailleSpinner />
						<span className="sr-only">{chat.compacting ? "Compacting context" : "Working"}</span>
					</span>
				) : (
					<time dateTime={chat.updatedAt} className="min-w-6 text-right">
						{shortTimeAgo(chat.updatedAt)}
					</time>
				)}
			</NavRowTrailing>
		</NavRow>
	);
}

/** The inline rename: the row's geometry with the title as a field. Enter or
 *  blur commits, Esc discards (the header rename's rules). */
function RenameRowNext({ chat, onCommit, onCancel }: { chat: ChatListItem; onCommit: (next: string) => void; onCancel: () => void }) {
	const [draft, setDraft] = useState(chat.title);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);
	return (
		<div data-testid="session-rename-row" className="flex h-8 items-center">
			<Input
				ref={inputRef}
				variant="quiet"
				value={draft}
				spellCheck={false}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => onCommit(draft)}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
					if (e.key === "Escape") {
						e.stopPropagation(); // discard, not also the sidebar/chat chains
						onCancel();
					}
				}}
				aria-label="Rename session"
				data-testid="session-rename-input"
				className="bg-fill-selected hover:bg-fill-selected focus-visible:bg-fill-selected"
			/>
		</div>
	);
}

const MENU_ITEM =
	"flex h-8 items-center rounded-md px-2 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:bg-fill-hover motion-reduce:transition-none";

/** The Proposed sidebar: the app mark and collapse, one New lesson action
 *  (practice beside it), Today and Knowledge, a quiet search, sessions by
 *  course, background agents only while one runs, Settings at the foot. */
export function SidebarNext() {
	const { open, toggle } = useSidebar();
	const { open: openSettings } = useSettingsDialog();
	const { feed } = useActivity();
	const running = feed.jobs.length > 0 || feed.extractions.length > 0;
	const s = useSessionsSidebar({ open, toggle });

	const groups = useMemo(() => (s.chats ? groupByCourse(filterSessions(s.chats, s.query)) : null), [s.chats, s.query]);
	// The search walks the rows in the order they are drawn.
	const shown = useMemo(() => groups?.flatMap((g) => g.sessions) ?? null, [groups]);
	const walked = s.kbdIndex !== null ? shown?.[s.kbdIndex]?.id : undefined;

	return (
		<aside
			className={cn("sidebar-motion shrink-0 overflow-hidden duration-200 motion-reduce:transition-none", open ? "w-64" : "w-0")}
			aria-hidden={!open}
			data-testid="sidebar"
		>
			<div className="flex h-full w-64 flex-col border-r bg-background">
				{/* In Electron this band is the window's drag surface and starts
				    after the traffic lights (.lh-lights-gutter). */}
				<div className="lh-drag lh-lights-gutter flex h-13 shrink-0 items-center justify-between px-2">
					<Link
						href="/"
						aria-label="Today"
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
					<div className="relative">
						<Hint label="New lesson" action="new-session" side="right">
							<NavRow
								data-testid="new-session"
								onClick={(e) => {
									s.router.push("/chat/new");
									blurAfterPointerClick(e);
								}}
								className="pr-9"
							>
								<PlusIcon />
								<NavRowLabel>New lesson</NavRowLabel>
							</NavRow>
						</Hint>
						<Hint label="New practice session" side="right">
							<Button
								variant="quiet"
								size="icon-inline"
								data-testid="new-session-practice"
								aria-label="New practice session"
								onClick={(e) => {
									s.router.push("/chat/new?mode=practice");
									blurAfterPointerClick(e);
								}}
								className="absolute right-1 top-1"
							>
								<DumbbellIcon className="size-4" />
							</Button>
						</Hint>
					</div>
					<NavRow asChild active={s.pathname === "/"}>
						<Link href="/" onClick={blurAfterPointerClick}>
							<SunIcon />
							<NavRowLabel>Today</NavRowLabel>
						</Link>
					</NavRow>
					<Hint label="Knowledge" action="jump-graph" side="right">
						<NavRow asChild active={s.pathname === "/knowledge"}>
							<Link href="/knowledge" onClick={blurAfterPointerClick}>
								<NetworkIcon />
								<NavRowLabel>Knowledge</NavRowLabel>
							</Link>
						</NavRow>
					</Hint>
					<Hint label="Search sessions" action="sessions-search" side="right">
						<div className="relative text-muted-foreground focus-within:text-foreground hover:text-foreground">
							<SearchIcon className="pointer-events-none absolute left-2 top-2 size-4" />
							<Input
								ref={s.searchRef}
								variant="quiet"
								data-testid="session-search"
								value={s.query}
								onChange={(e) => s.changeQuery(e.target.value)}
								onKeyDown={(e) => s.onSearchKeyDown(e, shown)}
								placeholder="Search"
								aria-label="Search sessions"
								className="pl-8"
							/>
						</div>
					</Hint>
				</nav>

				<div ref={s.listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-2 pt-4">
					{groups === null ? (
						<p className="px-2 text-row text-muted-foreground">Loading…</p>
					) : groups.length === 0 ? (
						<p className="px-2 text-row text-muted-foreground">
							{s.query.trim() ? "No sessions match." : "No sessions yet."}
						</p>
					) : (
						groups.map((group) => (
							<NavSection key={group.key} title={group.label}>
								{group.sessions.map((c) =>
									s.renamingId === c.id ? (
										<RenameRowNext
											key={c.id}
											chat={c}
											onCommit={(next) => void s.commitRename(c.id, next)}
											onCancel={() => s.setRenamingId(null)}
										/>
									) : (
										<SessionRowNext
											key={c.id}
											chat={c}
											active={s.pathname === `/chat/${c.id}`}
											highlighted={c.id === walked}
											onOpen={() => s.openChat(c.id)}
											onContextMenu={(e) => s.openContext(e, c)}
										/>
									),
								)}
							</NavSection>
						))
					)}
				</div>

				{running && <ActivitySection />}

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

			{s.ctxChatId !== null && (
				<MenuShell
					anchorRef={s.ctxAnchorRef}
					testid="session-context-menu"
					preferredSide="down"
					menuClass="flex w-56 flex-col rounded-xl border bg-popover p-1 text-row shadow-lg"
				>
					<button type="button" data-testid="ctx-rename" onClick={s.renameFromMenu} className={MENU_ITEM}>
						Rename
					</button>
					<button type="button" data-testid="ctx-export-md" onClick={s.exportFromMenu} className={MENU_ITEM}>
						Export as Markdown…
					</button>
					<button type="button" data-testid="ctx-delete" onClick={s.deleteFromMenu} className={cn(MENU_ITEM, "text-danger")}>
						Delete…
					</button>
					<div className="my-1 border-t" aria-hidden="true" />
					<CoverageMenuBlock chatId={s.ctxChatId} />
				</MenuShell>
			)}

			<DeleteSessionDialog chat={s.deleting} onClose={() => s.setDeleting(null)} onDeleted={s.onDeleted} />
		</aside>
	);
}
