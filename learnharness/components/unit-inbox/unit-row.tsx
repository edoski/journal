"use client";

import Link from "next/link";
import { CircleDashedIcon, PlayIcon, SquarePenIcon } from "lucide-react";
import type { ChatListItem, CourseMap } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { continueHref, pausedWords, sessionState } from "@/components/nav/session-state";
import { localDay } from "@/components/day-change";
import { topicPress } from "@/components/unit-inbox/start-unit";
import { useStartScope } from "@/components/start/start-scope";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { StatusMark } from "@/components/unit-inbox/status-mark";
import { TUTOR_WRITING } from "@/components/study-words";
import { leftWords, monogram, studiedWords, unitStatus, type Unit, type UnitStatus } from "@/components/unit-inbox/units";
import { CARD_ACTION_PLACE, ROW_ACTION, ROW_BODY, ROW_FRAME, ROW_ITEM, RowCard, rowSurface, rowTitle, STATUS_LINE, STATUS_SLOT, TRAILING_SLOT } from "@/components/unit-inbox/row-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MathText, mathPlain } from "@/components/ui/math-text";

export { rowSurface };

/** The mark's sizes: 16px beside a line (the sidebar, the calendar, search,
 *  the course filter), 40px where a course leads a two-line row (Home's
 *  Today rows and the course page's Now, as `CourseBadge`). */
const MARK_SIZE = { line: "size-4 text-caption-2", badge: "size-10 text-title-3" } as const;

/** A course's mark, T3 Code's project monogram: its initials in a rounded
 *  tile tinted 14% by its own ink, in SF Pro at 500, at every size. The
 *  letters span the tile and centre in it, trimmed to their cap height, so
 *  every badge's letters sit on the same centre whatever their width. */
export function CourseMark({ title, size = "line", className }: { title: string; size?: keyof typeof MARK_SIZE; className?: string }) {
	return (
		<span
			aria-hidden
			data-slot="course-mark"
			className={cn(
				"flex shrink-0 items-center justify-center rounded-[25%] bg-current/14 font-sans font-medium leading-none text-muted-foreground transition-[opacity,filter] motion-reduce:transition-none",
				MARK_SIZE[size],
				className,
			)}
		>
			<span className="w-full text-center tracking-[-0.02em] text-foreground/85 [text-box:trim-both_cap_alphabetic]">{monogram(title)}</span>
		</span>
	);
}

/** The row's one action, over its status slot: its topic's press, as the
 *  topic page takes it (`topicPress`): the session it opens, or the task or
 *  lesson he began picked up, else a new session on the topic, through the
 *  sidebar's one start (`StartScope`). Shown on hover and on keyboard focus. */
function RowAction({ unit, map, chats, className }: { unit: Unit; map: CourseMap; chats: readonly ChatListItem[]; className?: string }) {
	const { start, starting } = useStartScope();
	const press = topicPress(unit.topic, map, chats);
	const Icon = press.continues ? PlayIcon : SquarePenIcon;
	const props = {
		"data-slot": "row-action",
		"aria-label": `${press.word}: ${mathPlain(unit.topic.title)}`,
		className: cn(ROW_ACTION, className),
	} as const;
	if (press.resume) {
		return (
			<Button asChild variant="quiet" size="xs" {...props}>
				<Link href={continueHref(press.resume)} onClick={blurAfterPointerClick}>
					<Icon aria-hidden />
					{press.word}
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
				start(press.creation, { key: unit.key });
				blurAfterPointerClick(e);
			}}
			{...props}
		>
			<Icon aria-hidden />
			{press.word}
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
export function TopicCard({ unit, map, chats, today, active, parent }: { unit: Unit; map: CourseMap; chats: readonly ChatListItem[]; today: string; active: boolean; parent?: string }) {
	return (
		<RowCard
			href={unitHref(unit.course.workspace, unit.topic.handle)}
			active={active}
			rowKey={unit.key}
			parent={parent}
			mark={<CourseMark title={unit.course.title} />}
			course={unit.course.title}
			status={<UnitStatusMark status={unitStatus(unit, today)} />}
			title={unit.topic.title}
			action={<RowAction unit={unit} map={map} chats={chats} className={CARD_ACTION_PLACE} />}
			recede={unit.now === "working"}
		/>
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
/** A row's status (`unitStatus`) in its status slot, T3 Code's status
 *  label: the one mark (`StatusMark`) at size `slot`; a topic not started
 *  says so in words alone, and nothing to say draws nothing. */
export function UnitStatusMark({ status }: { status: UnitStatus }) {
	if (status.kind === "none") return status.words ? <StatusMark data-slot="unit-status" size="slot" fact={{ kind: "unstarted" }} words={status.words} /> : null;
	const words = status.kind === "your-turn" ? "Your turn" : status.kind === "working" ? TUTOR_WRITING : status.words;
	return <StatusMark data-slot="unit-status" size="slot" fact={status} words={words} />;
}

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
	/** The session's day when its title repeats in the list: "6 Nov",
	 *  shown after the title when its status says no day. */
	twin?: string | null;
	active: boolean;
	highlighted?: boolean;
	onOpen: () => void;
	parent?: string;
}) {
	const state = sessionState(chat);
	const status = sessionRowStatus(chat, state, today);
	// A twin's day goes after its title only when its status names no day of
	// its own (round 15, 1 m8 and 4 minor 10: "Total probability practice
	// 6 Nov … 6 Nov").
	const day = twin && status.kind !== "studied" && status.kind !== "task" ? twin : null;
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
					{day && (
						<span data-slot="session-twin" className="ml-1.5 text-callout font-normal whitespace-nowrap text-muted-foreground">
							<span className="sr-only">, </span>
							{day}
						</span>
					)}
				</span>
			</span>
			<span
				data-slot="unit-status-slot"
				data-testid={state === "your-turn" ? "session-waiting" : undefined}
				className={cn(TRAILING_SLOT, STATUS_LINE, "mt-1 self-end")}
			>
				<UnitStatusMark status={status} />
			</span>
		</Button>
	);
}
