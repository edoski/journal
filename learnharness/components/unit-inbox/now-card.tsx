"use client";

import Link from "next/link";
import { CircleDashedIcon, PlayIcon } from "lucide-react";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { sessionState, continueHref } from "@/components/nav/session-state";
import { courseTitle } from "@/components/study-home/agenda-rows/row-facts";
import { lessonOf } from "@/components/study-home/lesson-facts";
import type { NowLine } from "@/components/study-home/needs-you";
import { courseMove, type CourseMove } from "@/components/study-home/study-facts";
import { linePress } from "@/components/study-home/agenda-rows/line-target";
import type { ChatListItem } from "@/src/core";
import { useStartScope } from "@/components/start/start-scope";
import { CARD_ACTION_PLACE, ROW_ACTION, RowCard } from "@/components/unit-inbox/row-card";
import { CourseMark, UnitStatusMark } from "@/components/unit-inbox/unit-row";
import { courseKey, sessionKey } from "@/components/unit-inbox/now-inbox";
import { reasonMark } from "@/components/unit-inbox/fact-icon";
import { StatusMark } from "@/components/unit-inbox/status-mark";
import type { Unit } from "@/components/unit-inbox/units";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Where a Today card goes, pressed, the card or its action: where Home's
 * line goes (`linePress`, the one function Home's row reads), its course's
 * step taken up as Home takes it (`courseMove`): the session that waits or
 * holds the step (`href`), else a lesson started on it (`move`). Never the
 * topic page (Edo, 17 Nov 2026: the card does what Home's row does) and
 * never the course page (round 8: "Continue Problem sheet 4" opened it).
 * Pure.
 */
export function cardPress(line: NowLine, chats: readonly ChatListItem[]): { href: string } | { workspace: string; move: CourseMove } {
	const press = linePress(line.row);
	if ("href" in press) return press;
	const move = courseMove(press.course, chats, press.step);
	return move.kind === "open" ? { href: continueHref(move.chat) } : { workspace: press.course.map.workspace, move };
}

/** What a card's press does, from the sidebar's one start: a link, or a
 *  lesson taken up (`take`). */
function useCardPress(line: NowLine, chats: readonly ChatListItem[]): { href: string } | { onSelect: () => void } {
	const { take } = useStartScope();
	const press = cardPress(line, chats);
	return "href" in press ? press : { onSelect: () => take(press.workspace, press.move) };
}

/** The line's action over the card's status slot, shown on hover and on
 *  keyboard focus: the card's press (`cardPress`) in Home's word for it
 *  (`lessonOf`), Resume, Review, Continue or Start. */
export function NowAction({ line, title, className, chats = [] }: { line: NowLine; title: string; className?: string; chats?: readonly ChatListItem[] }) {
	const { starting } = useStartScope();
	const press = useCardPress(line, chats);
	const label = lessonOf(line.row).action;
	const props = {
		"data-slot": "row-action",
		"aria-label": `${label}: ${title}`,
		className: cn(ROW_ACTION, className),
	} as const;
	if ("href" in press) {
		return (
			<Button asChild variant="quiet" size="xs" {...props}>
				<Link href={press.href} onClick={blurAfterPointerClick}>
					<PlayIcon aria-hidden />
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
				press.onSelect();
				blurAfterPointerClick(e);
			}}
			{...props}
		>
			<PlayIcon aria-hidden />
			{label}
		</Button>
	);
}

/**
 * One of Today's lines as a sidebar card (spec: now-card.md), under the
 * line's one name (Home's lesson, `NowLine.title`), with the line's reason
 * in its status slot. A click does what Home's line does (`cardPress`): it
 * opens the session that waits or holds the line's step, else starts the
 * lesson on it. With a `unit` it is the topic the line leads with, with the
 * line's action over the slot. Without one it is a waiting session on no
 * topic of its course's map (or on no course): its course or "No course",
 * Your turn (or Working at 70% while the tutor writes in it); or a course's
 * line with no topic to lead with (a task that holds none), with the line's
 * action.
 */
export function NowCard({ line, unit, active, parent, chats = [] }: { line: NowLine; unit: Unit | null; active: boolean; parent?: string; chats?: readonly ChatListItem[] }) {
	// The line's one status, Home's row's (`NowLine.status`): its reason, else the slip or where he stands, with the pie.
	const { status } = line;
	const reason =
		status?.kind === "standing" ? (
			<StatusMark data-slot="why-mark" size="slot" fact={{ kind: "standing", standing: status.facts.standing }} words={line.slot ?? ""} />
		) : status ? (
			<StatusMark data-slot="why-mark" size="slot" {...reasonMark(status.why, line.slot ?? status.why.short)} />
		) : (
			<span />
		);
	const { row } = line;
	const press = useCardPress(line, chats);
	if (unit) {
		const working = unit.now === "working";
		return (
			<RowCard
				{...press}
				active={active}
				rowKey={unit.key}
				parent={parent}
				mark={<CourseMark title={unit.course.title} />}
				course={unit.course.title}
				status={working ? <UnitStatusMark status={{ kind: "working" }} /> : reason}
				title={line.title}
				action={<NowAction line={line} title={line.title} className={CARD_ACTION_PLACE} chats={chats} />}
				recede={working}
			/>
		);
	}
	if (row.kind === "course") {
		const { workspace, title } = row.course.map;
		return (
			<RowCard
				{...press}
				active={active}
				rowKey={courseKey(workspace)}
				parent={parent}
				mark={<CourseMark title={title} />}
				course={title}
				status={reason}
				title={line.title}
				action={<NowAction line={line} title={line.title} className={CARD_ACTION_PLACE} chats={chats} />}
			/>
		);
	}
	const { chat } = row;
	const running = sessionState(chat) === "working";
	return (
		<RowCard
			{...press}
			active={active}
			rowKey={sessionKey(chat.id)}
			parent={parent}
			mark={chat.course ? <CourseMark title={chat.course.title} /> : <CircleDashedIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
			course={courseTitle(row)}
			status={running ? <UnitStatusMark status={{ kind: "working" }} /> : reason}
			title={line.title}
			recede={running}
		/>
	);
}
