"use client";

import Link from "next/link";
import { CircleDashedIcon, PlayIcon, SquarePenIcon } from "lucide-react";
import type { ChatListItem } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { continueHref, pausedWords, sessionState } from "@/components/nav/session-state";
import { localDay } from "@/components/day-change";
import { STUDY_WORDS, useStartUnit } from "@/components/unit-inbox/start-unit";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { UnitStatusText } from "@/components/unit-inbox/unit-status";
import { leftWords, monogram, rowResume, studiedWords, unitStatus, type Unit, type UnitStatus } from "@/components/unit-inbox/units";
import { CARD_ACTION_PLACE, ROW_ACTION, ROW_BODY, ROW_FRAME, ROW_ITEM, RowCard, rowSurface, rowTitle, STATUS_LINE, STATUS_SLOT, TRAILING_SLOT } from "@/components/unit-inbox/row-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MathText, mathPlain } from "@/components/ui/math-text";

export { rowSurface };

/** Where a shelf row's action sits: over its status slot, on the row's
 *  last line, where the status always is (`ROW_FRAME`). */
export const SLIM_ACTION_PLACE = "right-2.5 bottom-2.5 h-5";

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
				"flex size-4 shrink-0 items-center justify-center rounded-[25%] bg-current/14 font-sans text-caption-2 leading-none text-muted-foreground transition-[opacity,filter] motion-reduce:transition-none",
				className,
			)}
		>
			<span className="w-full text-center tracking-[-0.02em] text-foreground/85 [text-box:trim-both_cap_alphabetic]">{monogram(title)}</span>
		</span>
	);
}

/** The row's one action, over its status slot: Resume opens the session
 *  of its own waiting on the learner (or running), else Study starts a new
 *  one on the topic. Shown on hover and on keyboard focus. */
function RowAction({ unit, className }: { unit: Unit; className?: string }) {
	const { start, starting } = useStartUnit();
	const resume = rowResume(unit);
	const label = resume ? "Resume" : STUDY_WORDS;
	const Icon = resume ? PlayIcon : SquarePenIcon;
	const props = {
		"data-slot": "row-action",
		"aria-label": `${label}: ${mathPlain(unit.topic.title)}`,
		className: cn(ROW_ACTION, className),
	} as const;
	if (resume) {
		return (
			<Button asChild variant="quiet" size="xs" {...props}>
				<Link href={continueHref(resume)} onClick={blurAfterPointerClick}>
					<Icon aria-hidden />
					{label}
				</Link>
			</Button>
		);
	}
	return (
		<Button
			variant="quiet"
			size="xs"
			disabled={starting !== null}
			onClick={(e) => {
				start(unit);
				blurAfterPointerClick(e);
			}}
			{...props}
		>
			<Icon aria-hidden />
			{label}
		</Button>
	);
}

/** Whether the open page is this unit's page or one of its sessions. */
export function isUnitOpen(unit: Unit, pathname: string): boolean {
	return pathname === unitHref(unit.course.workspace, unit.topic.handle) || unit.sessions.some((c) => pathname === `/chat/${c.id}`);
}

/**
 * A topic on the list, a card (`RowCard`): the course's mark and name with
 * the status slot, then the topic's title (`rowTitle`). A click opens the
 * topic's page; a topic the tutor writes in recedes until hovered.
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
		/>
	);
}

/**
 * A known topic on its shelf, under the sidebar's one row rule
 * (`ROW_FRAME`): the course's mark, greyed until hovered, beside the
 * title, two lines at most, then when it comes back on a line of its own,
 * right-aligned, so every shelf row keeps one pitch whatever its title.
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
		<li data-slot="unit-slim" className={ROW_ITEM}>
			<Link
				href={unitHref(unit.course.workspace, unit.topic.handle)}
				onClick={blurAfterPointerClick}
				aria-current={active ? "page" : undefined}
				data-sidebar-row={unit.key}
				data-sidebar-parent={parent}
				data-testid="unit-row"
				className={cn(rowSurface(active), ROW_FRAME)}
			>
				<span className={ROW_BODY}>
					<CourseMark
						title={unit.course.title}
						className={cn("mt-0.5", !active && "opacity-40 grayscale group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0")}
					/>
					<span data-slot="unit-row-title" className={rowTitle(active)}>
						<MathText>{unit.topic.title}</MathText>
					</span>
				</span>
				<span data-slot="unit-status-slot" className={cn(STATUS_SLOT, STATUS_LINE, "mt-1")}>
					{status ?? <UnitStatusText status={unitStatus(unit, today)} />}
				</span>
			</Link>
			{action ?? <RowAction unit={unit} className={SLIM_ACTION_PLACE} />}
		</li>
	);
}

/**
 * A session as a shelf row, in the shelf row's anatomy: its
 * course's mark (a dashed circle for a session older than courses), its
 * title, and the topic rows' status: Your turn, the spinner, or how long
 * ago in Home's words. A title another listed session shares carries its
 * day (`twin`, `sessionTwins`), so the two tell apart at a glance.
 * `highlighted` is the search's keyboard walk.
 */
/** A session row's status, its state's one phrase on every surface
 *  (session-state.md): Your turn, Tutor writing, "Left off today" for a
 *  session he left with Done for today, the cut reply's words, else when
 *  he last studied in it. Pure. */
export function sessionRowStatus(chat: ChatListItem, state: ReturnType<typeof sessionState>, today: string): UnitStatus {
	if (state === "working" || state === "your-turn") return { kind: state };
	if (state === "left") return { kind: "task", words: leftWords(chat, today || localDay(new Date())) };
	if (state === "paused") return { kind: "stopped", words: pausedWords(chat) };
	return { kind: "studied", words: studiedWords(chat.updatedAt, today) };
}

export function SessionSlimRow({
	chat,
	today,
	twin = null,
	active,
	highlighted = false,
	onOpen,
	parent,
	...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "variant"> & {
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
		<Button
			variant="list"
			size="row"
			{...props}
			aria-current={active ? "page" : undefined}
			data-sidebar-row={`chat:${chat.id}`}
			data-sidebar-parent={parent}
			data-testid={highlighted ? "session-row-kbd" : "session-row"}
			onClick={(e) => {
				onOpen();
				blurAfterPointerClick(e);
			}}
			className={cn(rowSurface(active), ROW_FRAME, "h-auto items-stretch gap-0 whitespace-normal", active && "hover:bg-fill-selected", highlighted && "bg-fill-hover")}
		>
			<span className={ROW_BODY}>
				{chat.course ? (
					<CourseMark
						title={chat.course.title}
						className={cn("mt-0.5", !active && "opacity-40 grayscale group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0")}
					/>
				) : (
					<CircleDashedIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				)}
				<span
					data-slot="unit-row-title"
					className={rowTitle(active || highlighted || state === "your-turn")}
				>
					<MathText>{chat.title}</MathText>
					{twin && (
						<span data-slot="session-twin" className="ml-1.5 text-callout font-normal whitespace-nowrap text-muted-foreground">
							<span className="sr-only">, </span>
							{twin}
						</span>
					)}
				</span>
			</span>
			<span
				data-slot="unit-status-slot"
				data-testid={state === "your-turn" ? "session-waiting" : undefined}
				className={cn(TRAILING_SLOT, STATUS_LINE, "mt-1 self-end")}
			>
				<UnitStatusText status={sessionRowStatus(chat, state, today)} />
			</span>
		</Button>
	);
}
