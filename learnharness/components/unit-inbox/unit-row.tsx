"use client";

import Link from "next/link";
import { CircleDashedIcon, PlayIcon, SquarePenIcon } from "lucide-react";
import type { ChatListItem } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { resumableSession, sessionState } from "@/components/nav/session-state";
import { STUDY_WORDS, useStartUnit } from "@/components/unit-inbox/start-unit";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { UnitStatusText } from "@/components/unit-inbox/unit-status";
import { monogram, studiedWords, unitStatus, type Unit } from "@/components/unit-inbox/units";
import { CARD_ACTION_PLACE, ROW_ACTION, RowCard, rowSurface, STATUS_SLOT, TRAILING_SLOT } from "@/components/unit-inbox/row-card";
import { cn } from "@/lib/utils";
import { MathText, mathPlain } from "@/components/ui/math-text";

export { rowSurface };

/** Where a one-line row's action sits: over its status slot. */
export const SLIM_ACTION_PLACE = "inset-y-0 right-2.5 my-auto h-6";

/** A course's 16px mark, T3 Code's project monogram: its initials in a
 *  rounded tile tinted 14% by its own ink, in SF Pro at 500. The letters
 *  span the tile and centre in it, trimmed to their cap height, so every
 *  badge's letters sit on the same centre whatever their width. */
export function CourseMark({ title, className }: { title: string; className?: string }) {
	return (
		<span
			aria-hidden
			data-slot="course-mark"
			className={cn(
				"flex size-4 shrink-0 items-center justify-center rounded-[25%] bg-current/14 font-sans text-[9px] font-medium leading-none text-muted-foreground transition-[opacity,filter] motion-reduce:transition-none",
				className,
			)}
		>
			<span className="w-full text-center tracking-[-0.02em] text-foreground/85 [text-box:trim-both_cap_alphabetic]">{monogram(title)}</span>
		</span>
	);
}

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
		"aria-label": `${label}: ${mathPlain(unit.topic.title)}`,
		className: cn(ROW_ACTION, className),
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
	return (
		<RowCard
			href={unitHref(unit.course.workspace, unit.topic.handle)}
			active={active}
			rowKey={unit.key}
			parent={parent}
			mark={<CourseMark title={unit.course.title} />}
			course={unit.course.title}
			status={<UnitStatusText status={unitStatus(unit, today)} />}
			title={unit.topic.title}
			action={<RowAction unit={unit} className={CARD_ACTION_PLACE} />}
			recede={unit.now === "working"}
			capStatus
		/>
	);
}

/**
 * A known topic on its shelf, T3 Code's one-line shelf row (36px): the
 * course's mark, greyed until hovered, the title, and when it comes back.
 * A click opens the topic's page; the action starts a review now.
 * `status` and `action` replace the slot's fact and the action (the
 * shelves under Today).
 */
export function TopicSlimRow({
	unit,
	today,
	active,
	parent,
	status,
	action,
}: {
	unit: Unit;
	today: string;
	active: boolean;
	parent?: string;
	status?: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<li data-slot="unit-slim" className="group/sidebar-row relative list-none">
			<Link
				href={unitHref(unit.course.workspace, unit.topic.handle)}
				onClick={blurAfterPointerClick}
				aria-current={active ? "page" : undefined}
				data-sidebar-row={unit.key}
				data-sidebar-parent={parent}
				data-testid="unit-row"
				className={cn(rowSurface(active), "flex h-9 items-center gap-2 px-2.5")}
			>
				<CourseMark
					title={unit.course.title}
					className={cn(!active && "opacity-40 grayscale group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0")}
				/>
				<span
					className={cn("min-w-0 flex-1 truncate text-control", active ? "text-foreground" : "text-muted-foreground group-hover/sidebar-row:text-foreground")}
				>
					<MathText>{unit.topic.title}</MathText>
				</span>
				<span data-slot="unit-status-slot" className={cn(STATUS_SLOT, "h-6 max-w-[50%]")}>
					{status ?? <UnitStatusText status={unitStatus(unit, today)} />}
				</span>
			</Link>
			{action ?? <RowAction unit={unit} className={SLIM_ACTION_PLACE} />}
		</li>
	);
}

/**
 * A session as a one-line shelf row, in the shelf row's anatomy: its
 * course's mark (a dashed circle for a session older than courses), its
 * title, and the topic rows' status: Your turn, the spinner, or how long
 * ago in Home's words. A title another listed session shares carries its
 * day (`twin`, `sessionTwins`), so the two tell apart at a glance.
 * `highlighted` is the search's keyboard walk.
 */
export function SessionSlimRow({
	chat,
	today,
	twin = null,
	active,
	highlighted = false,
	onOpen,
	parent,
	...props
}: Omit<React.ComponentProps<"button">, "onClick"> & {
	chat: ChatListItem;
	/** The engine's study day, for how long ago. */
	today: string;
	/** The session's day when its title repeats in the list: "6 Nov". */
	twin?: string | null;
	active: boolean;
	highlighted?: boolean;
	onOpen: () => void;
	parent?: string;
}) {
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
			className={cn(rowSurface(active), "flex h-9 items-center gap-2 px-2.5", highlighted && "bg-fill-hover")}
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
					"flex min-w-0 flex-1 items-baseline gap-1.5 text-control",
					active || state === "your-turn" ? "text-foreground" : "text-muted-foreground group-hover/sidebar-row:text-foreground",
					state === "your-turn" && "font-medium",
				)}
			>
				<span className="min-w-0 truncate">
					<MathText>{chat.title}</MathText>
				</span>
				{twin && (
					<span data-slot="session-twin" className="shrink-0 text-label font-normal text-muted-foreground">
						<span className="sr-only">, </span>
						{twin}
					</span>
				)}
			</span>
			<span data-testid={state === "your-turn" ? "session-waiting" : undefined} className={cn(TRAILING_SLOT, "h-6")}>
				<UnitStatusText
					status={state === "working" || state === "your-turn" ? { kind: state } : { kind: "studied", words: studiedWords(chat.updatedAt, today) }}
				/>
			</span>
		</button>
	);
}
