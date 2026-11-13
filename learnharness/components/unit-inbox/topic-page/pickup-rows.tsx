import Link from "next/link";
import { BookmarkIcon, DumbbellIcon, MessageSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HAIRLINE, TWO_LINE_ROW } from "@/components/unit-inbox/topic-page/row-classes";
import { WRITING, type Pickup } from "@/components/unit-inbox/topic-page/topic-facts";
import { WhyMark } from "@/components/unit-inbox/topic-page/why-mark";

const ICON = "row-span-2 size-4 text-muted-foreground";

/** What the row is: a lesson, a practice, or an open task. */
function PickupIcon({ pickup }: { pickup: Pickup }) {
	if (pickup.kind === "task") return <BookmarkIcon aria-label="Open task" className={ICON} />;
	return pickup.chat.kind === "practice" ? <DumbbellIcon aria-label="Practice" className={ICON} /> : <MessageSquareIcon aria-label="Lesson" className={ICON} />;
}

/**
 * The places to pick the topic back up (spec: pickup-rows.md), in Home's
 * two-line row: what it is and when it was last touched, then where it
 * stands and, for a session, whether it waits on him or the tutor is
 * writing. A session row opens the session; a task row starts a session
 * that continues the task. Nothing when there is no place.
 */
export function PickupRows({ pickups, busy, onTask }: { pickups: readonly Pickup[]; busy: boolean; onTask: (opening: string) => void }) {
	if (pickups.length === 0) return null;
	return (
		<ul data-slot="topic-pickups" className="flex flex-col">
			{pickups.map((pickup) => {
				const lines = (
					<>
						<PickupIcon pickup={pickup} />
						<span className="truncate text-label text-muted-foreground">{pickup.title}</span>
						<span className="justify-self-end text-label text-muted-foreground tabular-nums">{pickup.when}</span>
						<span className="truncate text-control font-medium text-foreground">{pickup.where}</span>
						{pickup.kind === "session" ? pickup.waits ? <WhyMark kind="reply" words="Your turn" /> : <WhyMark kind="writing" words={pickup.where === WRITING ? undefined : WRITING} /> : <span />}
					</>
				);
				return (
					<li key={pickup.kind === "session" ? pickup.chat.id : pickup.task.key} className={HAIRLINE}>
						{pickup.kind === "session" ? (
							<Button variant="quiet" asChild data-slot="topic-pickup" data-kind="session" className={TWO_LINE_ROW}>
								<Link href={`/chat/${pickup.chat.id}`} aria-disabled={busy || undefined} onClick={busy ? (event) => event.preventDefault() : undefined}>
									{lines}
								</Link>
							</Button>
						) : (
							<Button variant="quiet" data-slot="topic-pickup" data-kind="task" className={TWO_LINE_ROW} disabled={busy} onClick={() => onTask(pickup.opening)}>
								{lines}
							</Button>
						)}
					</li>
				);
			})}
		</ul>
	);
}
