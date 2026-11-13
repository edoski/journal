import { CalendarClockIcon, BookmarkIcon, MessageCircleQuestionIcon, type LucideIcon } from "lucide-react";
import type { TopicFact } from "@/components/course-page/course-model";
import { cn } from "@/lib/utils";
import type { Box } from "./map-plan";

/** The facts a note can say: what the node itself does not. */
export type NoteFact = Extract<TopicFact, { kind: "back" | "task" | "your-turn" }>;

/** The icons the course page's rows lead these facts with. */
const NOTE_ICON: Record<NoteFact["kind"], LucideIcon> = { back: CalendarClockIcon, task: BookmarkIcon, "your-turn": MessageCircleQuestionIcon };

/** Whether the node leaves this fact unsaid, so a note may say it: the day
 *  a topic comes back, where an open task was left, a turn that waits. Pure. */
export function isNoteFact(fact: TopicFact | null): fact is NoteFact {
	return fact?.kind === "back" || fact?.kind === "task" || fact?.kind === "your-turn";
}

/**
 * A few words under a lit topic's card (spec: map-course.md): the fact the
 * page's rows end with that the map's node does not say, its 12px icon then
 * its words in the caption style, as the node's need line. It sits in the
 * gap below the card, on the page's ground so a need line passes behind it.
 * Placed where `topicBoxes` puts the card.
 */
export function TopicNote({ fact, box }: { fact: NoteFact; box: Box }) {
	const Icon = NOTE_ICON[fact.kind];
	return (
		<span
			data-slot="course-map-note"
			data-kind={fact.kind}
			className="pointer-events-none absolute flex justify-start px-2"
			style={{ left: box.x, top: box.y + box.height + 4, width: box.width }}
		>
			<span className={cn("flex min-w-0 items-center gap-1 rounded-sm bg-background px-1 text-caption", fact.kind === "your-turn" ? "text-link" : "text-muted-foreground")}>
				<Icon aria-hidden="true" className="size-3 shrink-0" />
				<span className="truncate">{fact.words}</span>
			</span>
		</span>
	);
}
