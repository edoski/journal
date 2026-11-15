"use client";

import Link from "next/link";
import {
	AlarmClockIcon,
	BookOpenIcon,
	CircleDashedIcon,
	ClipboardListIcon,
	DumbbellIcon,
	GraduationCapIcon,
	HistoryIcon,
	MessageCircleQuestionIcon,
	MessageSquareIcon,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { CourseMark } from "@/components/unit-inbox/unit-row";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { ACTION_WORDS } from "@/components/unit-inbox/topic-page/topic-facts";
import { distanceWords, finalReviewWords, longDayWords, lookOf, lookWords, LOOKS, misfitWords, spanWords, unreviewedWords, type CalendarEntry, type EntryLook } from "@/components/calendar/calendar-facts";
import { MathText } from "@/components/ui/math-text";
import { LineText } from "@/components/line-text";
import { cn } from "@/lib/utils";

const ICONS: Record<EntryLook, LucideIcon> = {
	exam: GraduationCapIcon,
	overdue: AlarmClockIcon,
	review: HistoryIcon,
	new: BookOpenIcon,
	task: ClipboardListIcon,
	lesson: MessageSquareIcon,
	practice: DumbbellIcon,
};

/** What a press on an entry can start: a session whose first message is
 *  `opening`, in `workspace`, on `topics`, picking up the finished lesson
 *  `from`. */
export type StartSession = (opening: string, workspace: string, how: { topics: readonly string[]; from?: string }) => void;

/** The look's ink: an exam in full ink, the rest muted. An overdue
 *  review's icon alone is in danger, so a day of them stays quiet. */
const LOOK_INK: Partial<Record<EntryLook, string>> = { exam: "text-foreground" };
const ICON_INK: Partial<Record<EntryLook, string>> = { exam: "text-foreground", overdue: "text-danger" };

function Mark({ entry }: { entry: CalendarEntry }) {
	return entry.course ? <CourseMark title={entry.course.title} /> : <CircleDashedIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
}

/** The entry's face. A week gives the title the column's width, on two
 *  lines at most, over its course mark and its look in an icon and a word
 *  (an exam also says how far off it is); a session that waits says Your
 *  turn in the word's place, its icon naming the look. A month keeps the mark and the look's icon beside the title,
 *  still on two lines at most, so the topic reads. */
function Face({ entry, today, compact }: { entry: CalendarEntry; today: string; compact: boolean }) {
	const look = lookOf(entry);
	const Icon = ICONS[look];
	const waits = entry.kind === "session" && entry.waits;
	if (compact) {
		return (
			<>
				<span className="flex h-4.5 shrink-0 items-center gap-1.5">
					<Mark entry={entry} />
					<Icon aria-label={LOOKS[look].words} className={cn("size-3.5 shrink-0 text-muted-foreground", ICON_INK[look])} />
				</span>
				<span data-slot="calendar-entry-title" className="line-clamp-2 min-w-0 flex-1 text-foreground">
					<LineText>{entry.title}</LineText>
				</span>
			</>
		);
	}
	return (
		<>
			<span data-slot="calendar-entry-title" className="line-clamp-2 min-w-0 text-foreground">
				<LineText>{entry.title}</LineText>
			</span>
			<span className="flex min-w-0 items-center gap-1.5 text-label text-muted-foreground">
				<Mark entry={entry} />
				<Icon aria-hidden={!waits} aria-label={waits ? LOOKS[look].words : undefined} className={cn("size-3.5 shrink-0", ICON_INK[look])} />
				{!waits && (
					<span className={cn("truncate", LOOK_INK[look], look === "exam" && "font-medium")}>
						{entry.kind === "exam" ? `Exam, ${distanceWords(entry.day, today).toLowerCase()}` : lookWords(entry, today)}
					</span>
				)}
				{waits && (
					<span className="flex shrink-0 items-center gap-1 font-medium text-link">
						<MessageCircleQuestionIcon aria-hidden className="size-3.5" />
						Your turn
					</span>
				)}
			</span>
		</>
	);
}

/** An exam in the month grid, the one entry that must stand out among a
 *  day's reviews: a tinted chip with its title in weight. */
const EXAM_CHIP = "bg-foreground/10 font-medium hover:bg-foreground/15";

/** Every panel the calendar opens, an entry's and a day's, is this wide:
 *  the exam's road reads in it, and one width keeps them one family
 *  (round 5: 318 against 286). */
export const PANEL_WIDTH = "w-80";

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
	const look = lookOf(entry);
	const face = cn(FACE, compact ? "items-start gap-1.5 py-0.75" : "flex-col gap-0.5 py-1", compact && look === "exam" && EXAM_CHIP);
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
			<PopoverContent data-slot="calendar-entry-detail" align="start" collisionPadding={12} className="flex flex-col gap-3">
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
		const misfit = misfitWords(entry.doesNotFit);
		if (misfit) lines.push(misfit);
		if (entry.allStarted) lines.push("Every topic started");
	} else if (entry.kind === "review") {
		if (entry.overdue) lines.push(`Was due ${longDayWords(entry.dueOn ?? entry.day)}`);
		else if (entry.day !== today) lines.push(`Planned for ${longDayWords(entry.day)}, ${distanceWords(entry.day, today).toLowerCase()}`);
		if (entry.since) lines.push(entry.since);
		if (entry.waits) lines.push(entry.waits);
	} else if (entry.kind === "new") {
		lines.push(entry.day === today ? "Planned for today" : `Planned for ${longDayWords(entry.day)}, ${distanceWords(entry.day, today).toLowerCase()}`);
		if (entry.waits) lines.push(entry.waits);
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
				<p className="text-row font-medium text-foreground">
					<LineText>{entry.title}</LineText>
				</p>
				<p className={cn("flex items-center gap-1 text-label text-muted-foreground", LOOK_INK[look])}>
					<Icon aria-hidden className={cn("size-3.5 shrink-0", ICON_INK[look])} />
					{lookWords(entry, today)}
				</p>
				{lines.map((line) => (
					<p key={line} className="text-label text-muted-foreground">
						<MathText>{line}</MathText>
					</p>
				))}
			</div>
			{entry.kind === "exam" && <Road entry={entry} today={today} />}
			<EntryActions entry={entry} busy={busy} onStart={onStart} />
		</>
	);
}

/** The road to the exam as the engine planned it: each week's new topics,
 *  then the final review. Nothing when the plan gives neither. */
function Road({ entry, today }: { entry: Extract<CalendarEntry, { kind: "exam" }>; today: string }) {
	const finalReview = finalReviewWords(entry.finalReview, today);
	const unreviewed = unreviewedWords(entry.unreviewed);
	if (entry.road.length === 0 && !finalReview) return null;
	return (
		<div data-slot="exam-road" className="flex flex-col gap-1.5 border-t border-border pt-3">
			<p className="text-label font-medium text-muted-foreground">The road to it</p>
			<ol className="flex flex-col gap-1.5">
				{entry.road.map((week) => (
					<li key={week.from} className="flex gap-2 text-label">
						<BookOpenIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
						<span className="min-w-0">
							<span className="text-muted-foreground">{spanWords(week)}</span>{" "}
							<span className="text-foreground">
								<MathText>{week.titles.join(", ")}</MathText>
							</span>
						</span>
					</li>
				))}
				{finalReview && (
					<li className="flex gap-2 text-label text-muted-foreground">
						<HistoryIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
						<span className="min-w-0">
							{finalReview}
							{unreviewed && (
								<span data-slot="exam-unreviewed" className="block text-foreground">
									<MathText>{unreviewed}</MathText>
								</span>
							)}
						</span>
					</li>
				)}
			</ol>
		</div>
	);
}

/** The exam's next step, the one Home's line for its course takes: what it
 *  works on as a line under its own heading, as the road's are, then the
 *  verb alone on the button, as every other panel's action reads. */
function ExamActions({ entry, busy, onStart }: { entry: Extract<CalendarEntry, { kind: "exam" }>; busy: boolean; onStart: StartSession }) {
	const { next } = entry;
	if (!next) return null;
	const { move } = next;
	return (
		<div data-slot="exam-next" className="flex flex-col gap-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-label font-medium text-muted-foreground">Next step</p>
				<p data-slot="exam-next-what" className="text-label text-foreground">
					<MathText>{next.what}</MathText>
				</p>
			</div>
			<div className="flex items-center gap-2">
				{move.kind === "open" ? (
					<Button asChild size="sm">
						<Link href={`/chat/${move.chat.id}`}>{next.verb}</Link>
					</Button>
				) : (
					<Button
						size="sm"
						disabled={busy}
						onClick={() => onStart(move.opening, entry.course.workspace, { topics: move.topics, ...(move.from ? { from: move.from } : {}) })}
						data-slot="calendar-entry-start"
					>
						{next.verb}
					</Button>
				)}
			</div>
		</div>
	);
}

function EntryActions({ entry, busy, onStart }: { entry: Exclude<CalendarEntry, { kind: "session" }>; busy: boolean; onStart: StartSession }) {
	if (entry.kind === "exam") return <ExamActions entry={entry} busy={busy} onStart={onStart} />;
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
				<Button size="sm" disabled={busy} onClick={() => onStart(action.opening, workspace, { topics: handle ? [handle] : [] })} data-slot="calendar-entry-start">
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
