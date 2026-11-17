"use client";

import Link from "next/link";
import { CircleDashedIcon, PlayIcon } from "lucide-react";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { sessionState, continueHref } from "@/components/nav/session-state";
import { courseTitle } from "@/components/study-home/agenda-rows/row-facts";
import { lessonOf } from "@/components/study-home/lesson-facts";
import type { NowLine } from "@/components/study-home/needs-you";
import { courseMove, type CourseMove, type NextStep } from "@/components/study-home/study-facts";
import type { ChatListItem } from "@/src/core";
import type { PressWord } from "@/components/study-words";
import { useContinueCourse } from "@/components/unit-inbox/continue-course";
import { CARD_ACTION_PLACE, ROW_ACTION, RowCard } from "@/components/unit-inbox/row-card";
import { CourseMark, UnitStatusMark } from "@/components/unit-inbox/unit-row";
import { courseKey, sessionKey } from "@/components/unit-inbox/now-inbox";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { reasonMark } from "@/components/unit-inbox/fact-icon";
import { StatusMark } from "@/components/unit-inbox/status-mark";
import type { Unit } from "@/components/unit-inbox/units";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What a line's action does, as Home's line does, in Home's word for it
 *  (`lessonOf`): Resume the session that waits, or the course's next step
 *  (Review, Continue or Start), which starts the same lesson as Home's
 *  line. Pure. */
export function nowActionOf(line: NowLine): { label: PressWord; href: string } | { label: PressWord; workspace: string; step: NextStep } {
	const { row } = line;
	const label = lessonOf(row).action;
	if (row.kind === "session") return { label, href: continueHref(row.chat) };
	return { label, workspace: row.course.map.workspace, step: row.step };
}

/** Where a course line's card goes, as Home's line goes (`courseMove`): the
 *  session that holds its step, else a lesson started on it. Never the
 *  course page (round 8: "Continue Problem sheet 4" opened the course page;
 *  only its small Continue continued the work). Pure. */
export function courseCardMove(line: NowLine, chats: readonly ChatListItem[]): CourseMove | null {
	const { row } = line;
	return row.kind === "course" ? courseMove(row.course, chats, row.step) : null;
}

/** The line's action over the card's status slot, shown on hover and on
 *  keyboard focus. */
export function NowAction({ line, title, className, chats = [] }: { line: NowLine; title: string; className?: string; chats?: readonly ChatListItem[] }) {
	const { take, starting } = useContinueCourse();
	const action = nowActionOf(line);
	const props = {
		"data-slot": "row-action",
		"aria-label": `${action.label}: ${title}`,
		className: cn(ROW_ACTION, className),
	} as const;
	if ("href" in action) {
		return (
			<Button asChild variant="quiet" size="xs" {...props}>
				<Link href={action.href} onClick={blurAfterPointerClick}>
					<PlayIcon aria-hidden />
					{action.label}
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
				const move = courseCardMove(line, chats);
				if (move) take(action.workspace, move);
				blurAfterPointerClick(e);
			}}
			{...props}
		>
			<PlayIcon aria-hidden />
			{action.label}
		</Button>
	);
}

/**
 * One of Today's lines as a sidebar card (spec: now-card.md), under the
 * line's one name (Home's lesson, `NowLine.title`), with the line's reason
 * in its status slot. With a `unit` it is the topic the line leads with:
 * the line's action over the slot, and a click opens the topic's page.
 * Without one it is a waiting session on no topic of its course's map (or
 * on no course): its course or "No course", Your turn (or Working at 70%
 * while the tutor writes in it), and a click opens the session; or a
 * course's line with no topic to lead with (a task that holds none): the
 * line's action, and a click takes it up as Home's line does
 * (`courseCardMove`).
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
	const { take } = useContinueCourse();
	if (unit) {
		const working = unit.now === "working";
		return (
			<RowCard
				href={unitHref(unit.course.workspace, unit.topic.handle)}
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
		const move = courseCardMove(line, chats)!;
		return (
			<RowCard
				{...(move.kind === "open" ? { href: continueHref(move.chat) } : { onSelect: () => take(workspace, move) })}
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
			href={continueHref(chat)}
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
