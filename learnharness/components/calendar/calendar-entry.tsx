"use client";

import Link from "next/link";
import {
	AlarmClockIcon,
	CircleDashedIcon,
	ClipboardListIcon,
	DumbbellIcon,
	GraduationCapIcon,
	HistoryIcon,
	ListChecksIcon,
	MessageCircleQuestionIcon,
	MessageSquareIcon,
	RouteIcon,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { CourseMark } from "@/components/unit-inbox/unit-row";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { ACTION_WORDS } from "@/components/unit-inbox/topic-page/topic-facts";
import { distanceWords, longDayWords, lookOf, LOOKS, runupWords, type CalendarEntry, type EntryLook } from "@/components/calendar/calendar-facts";
import { cn } from "@/lib/utils";

const ICONS: Record<EntryLook, LucideIcon> = {
	exam: GraduationCapIcon,
	overdue: AlarmClockIcon,
	review: HistoryIcon,
	task: ClipboardListIcon,
	lesson: MessageSquareIcon,
	practice: DumbbellIcon,
	plan: RouteIcon,
	"check-in": ListChecksIcon,
};

/** What a press on an entry can start: a session whose first message is
 *  `opening`, in `workspace`, linked to the topic `handle`. */
export type StartSession = (opening: string, workspace: string, handle: string | null) => void;

/** The look's ink: an exam in full ink, the rest muted. An overdue
 *  review's icon alone is in danger, so a day of them stays quiet. */
const LOOK_INK: Partial<Record<EntryLook, string>> = { exam: "text-foreground" };
const ICON_INK: Partial<Record<EntryLook, string>> = { exam: "text-foreground", overdue: "text-danger" };

function Mark({ entry }: { entry: CalendarEntry }) {
	return entry.course ? <CourseMark title={entry.course.title} /> : <CircleDashedIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
}

/** The entry's face: its course mark and what it is about, then, in a
 *  week, its look in an icon and a word (an exam also says how far off it
 *  is), and Your turn when a session waits. A month keeps one line: the mark, the look's icon, the title. */
function Face({ entry, today, compact }: { entry: CalendarEntry; today: string; compact: boolean }) {
	const look = lookOf(entry);
	const Icon = ICONS[look];
	const waits = entry.kind === "session" && entry.waits;
	if (compact) {
		return (
			<>
				<Mark entry={entry} />
				<Icon aria-label={LOOKS[look].words} className={cn("size-3.5 shrink-0 text-muted-foreground", ICON_INK[look])} />
				<span className="min-w-0 flex-1 truncate">{entry.title}</span>
			</>
		);
	}
	return (
		<>
			<span className="flex min-w-0 items-center gap-1.5">
				<Mark entry={entry} />
				<span className="min-w-0 flex-1 truncate text-foreground">{entry.title}</span>
			</span>
			<span className="flex min-w-0 items-center gap-1 text-label text-muted-foreground">
				<Icon aria-hidden className={cn("size-3.5 shrink-0", ICON_INK[look])} />
				<span className={cn("truncate", LOOK_INK[look], look === "exam" && "font-medium")}>
					{entry.kind === "exam" ? `Exam, ${distanceWords(entry.day, today).toLowerCase()}` : LOOKS[look].words}
				</span>
				{waits && (
					<span className="ml-auto flex shrink-0 items-center gap-1 font-medium text-link">
						<MessageCircleQuestionIcon aria-hidden className="size-3.5" />
						Your turn
					</span>
				)}
			</span>
		</>
	);
}

const FACE =
	"flex w-full min-w-0 rounded-md px-1.5 text-left text-row outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=open]:bg-fill-selected motion-reduce:transition-none";

/** One thing on one day (spec: calendar.md). A session opens its lesson;
 *  a review, an open task or an exam opens a popover with what it is and
 *  what to do. */
export function CalendarEntryView({
	entry,
	today,
	compact = false,
	busy = false,
	onStart,
}: {
	entry: CalendarEntry;
	today: string;
	compact?: boolean;
	busy?: boolean;
	onStart: StartSession;
}) {
	const face = cn(FACE, compact ? "h-6 items-center gap-1.5" : "flex-col gap-0.5 py-1");
	const look = lookOf(entry);
	if (entry.kind === "session") {
		return (
			<Link href={`/chat/${entry.chat.id}`} data-slot="calendar-entry" data-look={look} className={face} onClick={blurAfterPointerClick}>
				<Face entry={entry} today={today} compact={compact} />
			</Link>
		);
	}
	return (
		<Popover>
			<PopoverTrigger data-slot="calendar-entry" data-look={look} className={face}>
				<Face entry={entry} today={today} compact={compact} />
			</PopoverTrigger>
			<PopoverContent data-slot="calendar-entry-detail" align="start" className="flex w-72 flex-col gap-3">
				<EntryDetail entry={entry} today={today} busy={busy} onStart={onStart} />
			</PopoverContent>
		</Popover>
	);
}

/** The popover's body: the course, the title, when and why in plain
 *  words, then the actions. */
function EntryDetail({ entry, today, busy, onStart }: { entry: Exclude<CalendarEntry, { kind: "session" }>; today: string; busy: boolean; onStart: StartSession }) {
	const look = lookOf(entry);
	const Icon = ICONS[look];
	const lines: string[] = [];
	if (entry.kind === "exam") {
		lines.push(`${longDayWords(entry.day)}, ${distanceWords(entry.day, today).toLowerCase()}`);
		if (entry.runup) lines.push(runupWords(entry.runup));
	} else if (entry.kind === "review") {
		const date = entry.topic.review?.date ?? entry.day;
		lines.push(entry.overdue ? `Was due ${longDayWords(date)}` : entry.day === today ? "Due today" : `${longDayWords(entry.day)}, ${distanceWords(entry.day, today).toLowerCase()}`);
	} else if (entry.task.step) {
		lines.push(`Left at: ${entry.task.step}`);
	}
	return (
		<>
			<div className="flex min-w-0 items-center gap-1.5 text-label text-muted-foreground">
				<CourseMark title={entry.course.title} />
				<span className="truncate">{entry.course.title}</span>
			</div>
			<div className="flex flex-col gap-1">
				<p className="text-row font-semibold text-foreground">{entry.title}</p>
				<p className={cn("flex items-center gap-1 text-label text-muted-foreground", LOOK_INK[look])}>
					<Icon aria-hidden className={cn("size-3.5 shrink-0", ICON_INK[look])} />
					{LOOKS[look].words}
				</p>
				{lines.map((line) => (
					<p key={line} className="text-label text-muted-foreground">
						{line}
					</p>
				))}
			</div>
			<EntryActions entry={entry} busy={busy} onStart={onStart} />
		</>
	);
}

function EntryActions({ entry, busy, onStart }: { entry: Exclude<CalendarEntry, { kind: "session" }>; busy: boolean; onStart: StartSession }) {
	if (entry.kind === "exam") return null;
	const { topic } = entry;
	const workspace = entry.course.workspace;
	const handle = topic?.handle ?? null;
	const action = entry.kind === "task" ? ({ kind: "continue", opening: entry.opening } as const) : entry.action;
	return (
		<div className="flex items-center gap-2">
			{"chat" in action ? (
				<Button asChild size="sm">
					<Link href={`/chat/${action.chat.id}`}>{ACTION_WORDS[action.kind]}</Link>
				</Button>
			) : (
				<Button size="sm" disabled={busy} onClick={() => onStart(action.opening, workspace, handle)} data-slot="calendar-entry-start">
					{ACTION_WORDS[action.kind]}
				</Button>
			)}
			{topic && (
				<Button asChild size="sm" variant="quiet">
					<Link href={unitHref(workspace, topic.handle)}>Open topic</Link>
				</Button>
			)}
		</div>
	);
}
