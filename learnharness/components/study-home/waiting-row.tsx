import Link from "next/link";
import type { ChatListItem } from "@/src/core";
import { courseLabel } from "@/src/core";

/** A session waiting on the learner's reply: its title, its course, and
 *  "Your turn" in the accent; the whole row opens the session. */
export function WaitingRow({ chat }: { chat: ChatListItem }) {
	return (
		<Link
			href={`/chat/${chat.id}`}
			data-slot="waiting-row"
			className="-mx-3 flex h-10 items-center gap-3 rounded-lg px-3 outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
		>
			<span className="size-1.5 shrink-0 rounded-full bg-link" aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate text-row text-foreground">{chat.title}</span>
			<span className="shrink-0 text-label text-muted-foreground">{chat.course ? courseLabel(chat.course) : "No course"}</span>
			<span className="shrink-0 text-label font-semibold text-link">Your turn</span>
		</Link>
	);
}
