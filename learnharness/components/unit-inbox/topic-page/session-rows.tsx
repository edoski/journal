import Link from "next/link";
import { ChevronRightIcon, DumbbellIcon, MessageSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HAIRLINE, ONE_LINE_ROW, RULE } from "@/components/unit-inbox/topic-page/row-classes";
import type { SessionEntry } from "@/components/unit-inbox/topic-page/topic-facts";
import { WhyMark } from "@/components/unit-inbox/topic-page/why-mark";

/** The rows shown before the rest fold under "Earlier sessions". */
export const SHOWN_SESSIONS = 5;

const ICON = "size-4 text-muted-foreground";

/** One session: lesson or practice, its title, then whether it waits on
 *  him or the tutor is writing, else how long ago. */
function SessionRow({ entry }: { entry: SessionEntry }) {
	const { chat, state } = entry;
	return (
		<Button variant="quiet" asChild data-testid="unit-page-session" className={ONE_LINE_ROW}>
			<Link href={`/chat/${chat.id}`}>
				{chat.kind === "practice" ? <DumbbellIcon aria-label="Practice" className={ICON} /> : <MessageSquareIcon aria-label="Lesson" className={ICON} />}
				<span className="truncate text-row text-foreground">{chat.title}</span>
				{state === "your-turn" ? (
					<WhyMark kind="reply" words="Your turn" />
				) : state === "working" ? (
					<WhyMark kind="writing" words="The tutor is writing" />
				) : (
					<time dateTime={chat.updatedAt} className="justify-self-end text-label text-muted-foreground tabular-nums">
						{entry.when}
					</time>
				)}
			</Link>
		</Button>
	);
}

/**
 * The topic's sessions as quiet rows (spec: session-rows.md), newest
 * first, under a small header. Past five, one more row, "Earlier
 * sessions", unfolds the rest. Nothing when there is none.
 */
export function SessionRows({ entries, title = "Sessions" }: { entries: readonly SessionEntry[]; title?: string }) {
	if (entries.length === 0) return null;
	const shown = entries.slice(0, SHOWN_SESSIONS);
	const rest = entries.slice(SHOWN_SESSIONS);
	return (
		<section data-slot="topic-sessions" className="flex flex-col">
			<h2 className="flex h-7 items-center text-label font-medium text-muted-foreground">{title}</h2>
			<ul className="flex flex-col">
				{shown.map((entry) => (
					<li key={entry.chat.id} className={HAIRLINE}>
						<SessionRow entry={entry} />
					</li>
				))}
				{rest.length > 0 && (
					<li className={RULE}>
						<Collapsible>
							<CollapsibleTrigger asChild>
								<Button variant="quiet" data-slot="topic-earlier" className={`group/earlier ${ONE_LINE_ROW}`}>
									<ChevronRightIcon aria-hidden className={`${ICON} transition-transform duration-150 group-data-[state=open]/earlier:rotate-90 motion-reduce:transition-none`} />
									<span className="truncate text-row">Earlier sessions</span>
									<span />
								</Button>
							</CollapsibleTrigger>
							<CollapsibleContent asChild>
								<ul className="flex flex-col">
									{rest.map((entry) => (
										<li key={entry.chat.id} className={RULE}>
											<SessionRow entry={entry} />
										</li>
									))}
								</ul>
							</CollapsibleContent>
						</Collapsible>
					</li>
				)}
			</ul>
		</section>
	);
}
