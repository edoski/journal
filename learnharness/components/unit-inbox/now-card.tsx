"use client";

import Link from "next/link";
import { CircleDashedIcon, PlayIcon } from "lucide-react";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { sessionState } from "@/components/nav/session-state";
import { courseTitle } from "@/components/study-home/agenda-rows/row-facts";
import { WhyMark } from "@/components/study-home/agenda-rows/why-mark";
import { lessonOf } from "@/components/study-home/lesson-facts";
import type { NowLine } from "@/components/study-home/needs-you";
import { useContinueCourse } from "@/components/unit-inbox/continue-course";
import { CARD_ACTION_PLACE, ROW_ACTION, RowCard } from "@/components/unit-inbox/row-card";
import { CourseMark } from "@/components/unit-inbox/unit-row";
import { courseKey, sessionKey } from "@/components/unit-inbox/now-inbox";
import { courseHref, unitHref } from "@/components/unit-inbox/unit-href";
import { UnitStatusText } from "@/components/unit-inbox/unit-status";
import type { Unit } from "@/components/unit-inbox/units";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What a line's action does, as Home's line does: Resume the session that
 *  waits, or the course's next step in Home's word (Review, Continue or
 *  Start), which starts the same lesson as Home's line. Pure. */
export function nowActionOf(line: NowLine): { label: string; href: string } | { label: string; workspace: string } {
	const { row } = line;
	if (row.kind === "session") return { label: "Resume", href: `/chat/${row.chat.id}` };
	return { label: lessonOf(row).action, workspace: row.course.map.workspace };
}

/** The line's action over the card's status slot, shown on hover and on
 *  keyboard focus. */
export function NowAction({ line, title, className }: { line: NowLine; title: string; className?: string }) {
	const { start, starting } = useContinueCourse();
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
				start(action.workspace);
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
 * line's action, and a click opens the course's page.
 */
export function NowCard({ line, unit, active, parent }: { line: NowLine; unit: Unit | null; active: boolean; parent?: string }) {
	const reason = <WhyMark why={line.why} size="slot" words={line.slot} />;
	const { row } = line;
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
				status={working ? <UnitStatusText status={{ kind: "working" }} /> : reason}
				title={line.title}
				action={<NowAction line={line} title={line.title} className={CARD_ACTION_PLACE} />}
				recede={working}
			/>
		);
	}
	if (row.kind === "course") {
		const { workspace, title } = row.course.map;
		return (
			<RowCard
				href={courseHref(workspace)}
				active={active}
				rowKey={courseKey(workspace)}
				parent={parent}
				mark={<CourseMark title={title} />}
				course={title}
				status={reason}
				title={line.title}
				action={<NowAction line={line} title={line.title} className={CARD_ACTION_PLACE} />}
			/>
		);
	}
	const { chat } = row;
	const running = sessionState(chat) === "working";
	return (
		<RowCard
			href={`/chat/${chat.id}`}
			active={active}
			rowKey={sessionKey(chat.id)}
			parent={parent}
			mark={chat.course ? <CourseMark title={chat.course.title} /> : <CircleDashedIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
			course={courseTitle(row)}
			status={running ? <UnitStatusText status={{ kind: "working" }} /> : reason}
			title={line.title}
			recede={running}
		/>
	);
}
