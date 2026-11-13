"use client";

import Link from "next/link";
import { CircleDashedIcon, PlayIcon, SquarePenIcon } from "lucide-react";
import type { ChatListItem } from "@/src/core";
import { BrailleSpinner } from "@/components/braille-spinner";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { resumableSession, sessionState } from "@/components/nav/session-state";
import { shortTimeAgo } from "@/components/sidebar-next";
import { STUDY_WORDS, useStartUnit } from "@/components/unit-inbox/start-unit";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { UnitStatusText } from "@/components/unit-inbox/unit-status";
import { monogram, unitStatus, type Unit } from "@/components/unit-inbox/units";
import { cn } from "@/lib/utils";

/** A course's 16px mark, T3 Code's project monogram: its initials in a
 *  rounded tile tinted 14% by its own ink. */
export function CourseMark({ title, className }: { title: string; className?: string }) {
	return (
		<span
			aria-hidden
			data-slot="course-mark"
			className={cn(
				"flex size-4 shrink-0 items-center justify-center rounded-[25%] bg-current/14 font-mono text-[8.25px] font-bold leading-none text-muted-foreground transition-[opacity,filter] motion-reduce:transition-none",
				className,
			)}
		>
			<span className="text-foreground/85">{monogram(title)}</span>
		</span>
	);
}

/** Every row's surface: a rounded block, the selected fill on the open
 *  page, the hover fill from its list item (so hovering its action keeps
 *  it), and an inset ring on keyboard focus. */
const rowSurface = (active: boolean) =>
	cn(
		"relative w-full min-w-0 rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
		active ? "bg-fill-selected" : "group-hover/sidebar-row:bg-fill-hover",
	);

/** The status slot: its label fades out while the row is hovered or its
 *  action has keyboard focus, so the action takes its place without moving
 *  anything. */
const STATUS_SLOT =
	"relative ml-auto flex min-w-8 shrink-0 items-center justify-end text-label tabular-nums text-muted-foreground transition-opacity motion-reduce:transition-none group-hover/sidebar-row:opacity-0 group-has-[[data-slot=row-action]:focus-visible]/sidebar-row:opacity-0";

/** The row's one action, over its status slot: Resume opens the session
 *  waiting on the learner (or running), else Study starts a new one on the
 *  topic. Shown on hover and on keyboard focus. */
function RowAction({ unit, className }: { unit: Unit; className?: string }) {
	const { start, starting } = useStartUnit();
	const resume = resumableSession(unit.sessions);
	const label = resume ? "Resume" : STUDY_WORDS;
	const Icon = resume ? PlayIcon : SquarePenIcon;
	const props = {
		"data-slot": "row-action",
		"aria-label": `${label}: ${unit.topic.title}`,
		className: cn(
			"pointer-events-none absolute inline-flex items-center gap-1 rounded-md px-1.5 text-label font-medium text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/sidebar-row:pointer-events-auto group-hover/sidebar-row:opacity-100 motion-reduce:transition-none [&>svg]:size-3",
			className,
		),
	} as const;
	if (resume) {
		return (
			<Link href={`/chat/${resume.id}`} onClick={blurAfterPointerClick} {...props}>
				<Icon aria-hidden />
				{label}
			</Link>
		);
	}
	return (
		<button
			type="button"
			disabled={starting !== null}
			onClick={(e) => {
				start(unit);
				blurAfterPointerClick(e);
			}}
			{...props}
		>
			<Icon aria-hidden />
			{label}
		</button>
	);
}

/** Whether the open page is this unit's page or one of its sessions. */
export function isUnitOpen(unit: Unit, pathname: string): boolean {
	return pathname === unitHref(unit.course.workspace, unit.topic.handle) || unit.sessions.some((c) => pathname === `/chat/${c.id}`);
}

/**
 * A topic on the list, a two-line card (60px): the course's mark and name
 * with the status slot, then the topic's title at 14/500. A click opens
 * the topic's page; a topic the tutor writes in recedes until hovered.
 */
export function TopicCard({ unit, today, active, parent }: { unit: Unit; today: string; active: boolean; parent?: string }) {
	const working = unit.now === "working";
	return (
		<li data-slot="unit-card" className="group/sidebar-row relative list-none py-0.5">
			<Link
				href={unitHref(unit.course.workspace, unit.topic.handle)}
				onClick={blurAfterPointerClick}
				aria-current={active ? "page" : undefined}
				data-sidebar-row={unit.key}
				data-sidebar-parent={parent}
				data-testid="unit-row"
				className={cn(
					rowSurface(active),
					"flex h-[3.75rem] flex-col px-2.5 py-2",
					working && !active && "opacity-70 hover:opacity-100 focus-visible:opacity-100",
				)}
			>
				<span className="flex h-5 items-center gap-1.5">
					<CourseMark title={unit.course.title} />
					<span className="min-w-0 flex-1 truncate text-label text-muted-foreground">{unit.course.title}</span>
					<span data-slot="unit-status-slot" className={cn(STATUS_SLOT, "h-5")}>
						<UnitStatusText status={unitStatus(unit, today)} />
					</span>
				</span>
				<span className="mt-1 truncate text-control font-medium text-foreground">{unit.topic.title}</span>
			</Link>
			<RowAction unit={unit} className="right-2.5 top-2.5 h-5" />
		</li>
	);
}

/**
 * A known topic on its shelf, T3 Code's one-line shelf row (36px): the
 * course's mark, greyed until hovered, the title, and when it comes back.
 * A click opens the topic's page; the action starts a review now.
 */
export function TopicSlimRow({ unit, today, active, parent }: { unit: Unit; today: string; active: boolean; parent?: string }) {
	return (
		<li data-slot="unit-slim" className="group/sidebar-row relative list-none">
			<Link
				href={unitHref(unit.course.workspace, unit.topic.handle)}
				onClick={blurAfterPointerClick}
				aria-current={active ? "page" : undefined}
				data-sidebar-row={unit.key}
				data-sidebar-parent={parent}
				data-testid="unit-row"
				className={cn(rowSurface(active), "flex h-9 items-center gap-2.5 px-2.5")}
			>
				<CourseMark
					title={unit.course.title}
					className={cn(!active && "opacity-40 grayscale group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0")}
				/>
				<span
					className={cn("min-w-0 flex-1 truncate text-control", active ? "text-foreground" : "text-muted-foreground group-hover/sidebar-row:text-foreground")}
				>
					{unit.topic.title}
				</span>
				<span data-slot="unit-status-slot" className={cn(STATUS_SLOT, "h-6")}>
					<UnitStatusText status={unitStatus(unit, today)} />
				</span>
			</Link>
			<RowAction unit={unit} className="inset-y-0 right-2.5 my-auto h-6" />
		</li>
	);
}

/**
 * A session on no listed topic, as a one-line shelf row: its course's mark
 * (a dashed circle for a session older than courses), its title, and Your
 * turn, the spinner or how long ago. `highlighted` is the search's
 * keyboard walk.
 */
export function SessionSlimRow({
	chat,
	active,
	highlighted = false,
	onOpen,
	parent,
	...props
}: Omit<React.ComponentProps<"button">, "onClick"> & { chat: ChatListItem; active: boolean; highlighted?: boolean; onOpen: () => void; parent?: string }) {
	const state = sessionState(chat);
	return (
		<button
			type="button"
			{...props}
			aria-current={active ? "page" : undefined}
			data-sidebar-row={`chat:${chat.id}`}
			data-sidebar-parent={parent}
			data-testid={highlighted ? "session-row-kbd" : "session-row"}
			onClick={(e) => {
				onOpen();
				blurAfterPointerClick(e);
			}}
			className={cn(rowSurface(active), "flex h-9 items-center gap-2.5 px-2.5", highlighted && "bg-fill-hover")}
		>
			{chat.course ? (
				<CourseMark
					title={chat.course.title}
					className={cn(!active && "opacity-40 grayscale group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0")}
				/>
			) : (
				<CircleDashedIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
			)}
			<span
				className={cn(
					"min-w-0 flex-1 truncate text-control",
					active || state === "your-turn" ? "text-foreground" : "text-muted-foreground group-hover/sidebar-row:text-foreground",
					state === "your-turn" && "font-medium",
				)}
			>
				{chat.title}
			</span>
			<span className="ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end text-label tabular-nums text-muted-foreground">
				{state === "working" ? (
					<>
						<BrailleSpinner />
						<span className="sr-only">Working</span>
					</>
				) : state === "your-turn" ? (
					<span data-testid="session-waiting" className="font-medium text-link">
						<span className="sr-only">, </span>Your turn
					</span>
				) : (
					<time dateTime={chat.updatedAt}>{shortTimeAgo(chat.updatedAt)}</time>
				)}
			</span>
		</button>
	);
}
