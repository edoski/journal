"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BookIcon, CircleDashedIcon, HouseIcon, MapIcon, PanelLeftCloseIcon, PlusIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { courseLabel, type ChatListItem } from "@/src/core";
import { fetchCourses } from "@/components/course-picker";
import { examText } from "@/components/start/course-facts";
import { useSidebar } from "@/components/sidebar";
import { useHomeVariant } from "@/components/design-variant";
import { filterSessions, useSessionsSidebar } from "@/components/sidebar-state";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { ActivitySection, useActivity } from "@/components/activity-dock";
import { coverageItem, useSessionCoverage } from "@/components/extraction-coverage";
import { LhMark } from "@/components/lh-mark";
import { BrailleSpinner } from "@/components/braille-spinner";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { NavRow, NavRowLabel, NavRowTrailing } from "@/components/nav/nav-row";
import { NavGroup } from "@/components/nav/nav-group";
import { sessionState } from "@/components/nav/session-state";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export { sessionState, type SessionState } from "@/components/nav/session-state";

/** One session under its course: the title on the course name's edge, and
 *  one trailing item, "Your turn" in the accent, the spinner while the
 *  tutor writes, or how long ago. Only "Your turn" lifts the title to full
 *  ink at 500; working and finished sessions stay muted. */
export function SessionRowNext({
	chat,
	active,
	highlighted = false,
	onOpen,
	...props
}: Omit<React.ComponentProps<"button">, "onClick"> & {
	chat: ChatListItem;
	active: boolean;
	highlighted?: boolean;
	onOpen: () => void;
}) {
	const state = sessionState(chat);
	return (
		<NavRow
			{...props}
			inset
			active={active}
			highlighted={highlighted}
			attention={state === "your-turn"}
			onClick={(e) => {
				onOpen();
				blurAfterPointerClick(e);
			}}
			data-testid={highlighted ? "session-row-kbd" : "session-row"}
		>
			<NavRowLabel>{chat.title}</NavRowLabel>
			<NavRowTrailing>
				{state === "working" ? (
					<>
						<BrailleSpinner />
						<span className="sr-only">{chat.compacting ? "Compacting context" : "Working"}</span>
					</>
				) : state === "your-turn" ? (
					<span data-testid="session-waiting" className="font-medium text-link">
						<span className="sr-only">, </span>Your turn
					</span>
				) : (
					<time dateTime={chat.updatedAt}>{shortTimeAgo(chat.updatedAt)}</time>
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
				className="bg-fill-selected pl-8 hover:bg-fill-selected focus-visible:bg-fill-selected"
			/>
		</div>
	);
}


/** Each course's exam countdown ("Exam in 21 days"), by workspace, from
 *  the engine's `plan`; empty until it answers or when it cannot. Asked
 *  once per mount: the sidebar lives for the whole window. */
function useExamCountdowns(): ReadonlyMap<string, string> {
	const [exams, setExams] = useState<ReadonlyMap<string, string>>(new Map());
	useEffect(() => {
		let live = true;
		void fetchCourses()
			.then((listing) => {
				if (!live || !listing.available) return;
				const next = new Map<string, string>();
				for (const c of listing.courses) {
					const text = examText(c.exam);
					if (text) next.set(c.workspace, text);
				}
				setExams(next);
			})
			.catch(() => {
				/* no countdown is the quiet failure: the sessions still list */
			});
		return () => {
			live = false;
		};
	}, []);
	return exams;
}

/** Which courses the learner folded, by workspace ("" is No course), kept
 *  across windows and launches. Every course starts open. */
const COLLAPSED_KEY = "lh:sidebar-collapsed-courses";
const COLLAPSED_EVENT = "lh:sidebar-collapsed-courses";

function parseCollapsed(raw: string | null): ReadonlySet<string> {
	try {
		const list: unknown = JSON.parse(raw ?? "[]");
		return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
	} catch {
		return new Set();
	}
}

function subscribeCollapsed(onChange: () => void): () => void {
	window.addEventListener("storage", onChange);
	window.addEventListener(COLLAPSED_EVENT, onChange);
	return () => {
		window.removeEventListener("storage", onChange);
		window.removeEventListener(COLLAPSED_EVENT, onChange);
	};
}

function useCollapsedCourses(): [ReadonlySet<string>, (key: string, collapsed: boolean) => void] {
	const raw = useSyncExternalStore(
		subscribeCollapsed,
		() => localStorage.getItem(COLLAPSED_KEY),
		() => null,
	);
	const collapsed = useMemo(() => parseCollapsed(raw), [raw]);
	const setCollapsed = useCallback((key: string, fold: boolean) => {
		const next = new Set(parseCollapsed(localStorage.getItem(COLLAPSED_KEY)));
		if (fold) next.add(key);
		else next.delete(key);
		localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
		window.dispatchEvent(new Event(COLLAPSED_EVENT));
	}, []);
	return [collapsed, setCollapsed];
}

/** The session menu's last item: what the extractor hasn't read yet, and
 *  Extract. Choosing it keeps the menu open, so the label turns to
 *  "Extracting notes…" in place. Nothing shows until the first read. */
function CoverageItemNext({ chatId }: { chatId: string }) {
	const { coverage, extracting, extract } = useSessionCoverage(chatId);
	if (coverage === null) return null;
	const item = coverageItem(coverage, extracting);
	return (
		<>
			<ContextMenuSeparator />
			<ContextMenuItem
				data-testid="ctx-extract"
				className="whitespace-nowrap"
				disabled={item.disabled}
				onSelect={(e) => {
					e.preventDefault();
					extract();
				}}
			>
				<span data-testid={item.running ? "ctx-coverage-running" : "ctx-coverage"}>{item.label}</span>
				{item.detail && <ContextMenuShortcut>{item.detail}</ContextMenuShortcut>}
			</ContextMenuItem>
		</>
	);
}

/** The Proposed sidebar: the app mark and collapse, New lesson, Home and
 *  Map (Home alone on a study home, which holds the map), a quiet search, sessions under collapsible courses, background
 *  agents only while one runs, Settings at the foot. */
export function SidebarNext() {
	const { open, toggle } = useSidebar();
	const { open: openSettings } = useSettingsDialog();
	const { feed } = useActivity();
	const running = feed.jobs.length > 0 || feed.extractions.length > 0;
	const s = useSessionsSidebar({ open, toggle });
	const exams = useExamCountdowns();
	const [collapsed, setCollapsed] = useCollapsedCourses();
	const mapOnHome = useHomeVariant() !== "current";

	// A search shows every match, folded courses included.
	const searching = s.query.trim() !== "";
	const groups = useMemo(() => (s.chats ? groupByCourse(filterSessions(s.chats, s.query)) : null), [s.chats, s.query]);
	const isOpen = (key: string) => searching || !collapsed.has(key);
	// The search walks the rows in the order they are drawn.
	const shown = useMemo(
		() => groups?.flatMap((g) => (searching || !collapsed.has(g.key) ? g.sessions : [])) ?? null,
		[groups, searching, collapsed],
	);
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
					{!mapOnHome && (
						<Hint label="Map" action="jump-graph" side="right">
							<NavRow asChild active={s.pathname === "/knowledge"}>
								<Link href="/knowledge" onClick={blurAfterPointerClick}>
									<MapIcon />
									<NavRowLabel>Map</NavRowLabel>
								</Link>
							</NavRow>
						</Hint>
					)}
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

				<ScrollArea
					viewportRef={s.listRef}
					className="min-h-0 flex-1"
					viewportClassName="[&>div]:block! focus-visible:ring-inset"
				>
					<div className="flex flex-col gap-2 px-2 pb-2 pt-4">
						{groups === null ? (
							<p className="px-2 text-row text-muted-foreground">Loading…</p>
						) : groups.length === 0 ? (
							<p className="px-2 text-row text-muted-foreground">
								{s.query.trim() ? "No sessions match." : "No sessions yet."}
							</p>
						) : (
							groups.map((group) => (
								<NavGroup
									key={group.key}
									icon={group.key ? <BookIcon /> : <CircleDashedIcon />}
									title={group.label}
									trailing={exams.get(group.key)}
									attention={group.sessions.some((c) => sessionState(c) === "your-turn")}
									open={isOpen(group.key)}
									onOpenChange={(next) => {
										if (!searching) setCollapsed(group.key, !next);
									}}
								>
									{group.sessions.map((c) =>
										s.renamingId === c.id ? (
											<RenameRowNext
												key={c.id}
												chat={c}
												onCommit={(next) => void s.commitRename(c.id, next)}
												onCancel={() => s.setRenamingId(null)}
											/>
										) : (
											<ContextMenu key={c.id}>
												<ContextMenuTrigger asChild>
													<SessionRowNext
														chat={c}
														active={s.pathname === `/chat/${c.id}`}
														highlighted={c.id === walked}
														onOpen={() => s.openChat(c.id)}
													/>
												</ContextMenuTrigger>
												<ContextMenuContent data-testid="session-context-menu" className="w-64">
													<ContextMenuItem data-testid="ctx-rename" onSelect={() => s.renameChat(c.id)}>
														Rename
													</ContextMenuItem>
													<ContextMenuItem data-testid="ctx-export-md" onSelect={() => s.exportChat(c.id)}>
														Export as Markdown…
													</ContextMenuItem>
													<ContextMenuItem data-testid="ctx-delete" variant="destructive" onSelect={() => s.deleteChat(c.id)}>
														Delete…
													</ContextMenuItem>
													<CoverageItemNext chatId={c.id} />
												</ContextMenuContent>
											</ContextMenu>
										),
									)}
								</NavGroup>
							))
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
