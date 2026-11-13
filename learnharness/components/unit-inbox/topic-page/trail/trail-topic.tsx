import { ScrollArea } from "@/components/ui/scroll-area";
import { PickupRows } from "@/components/unit-inbox/topic-page/pickup-rows";
import { SessionRows } from "@/components/unit-inbox/topic-page/session-rows";
import { TopicHead } from "@/components/unit-inbox/topic-page/topic-head";
import type { TopicPageProps } from "@/components/unit-inbox/topic-page/topic-page";

/** Topic page candidate "trail" (spec: trail.md). A stub until its builder
 *  draws it: the shared head, pick-up rows and sessions, so the page works
 *  on this option. */
export function TrailTopic({ facts, busy, onAct, onTask }: TopicPageProps) {
	return (
		<ScrollArea bar={false} className="min-h-0 flex-1">
			<div data-testid="unit-page" data-topic-candidate="trail" className="mx-auto flex w-full max-w-[46rem] flex-col gap-5 px-6 pb-8 pt-6">
				<TopicHead facts={facts} busy={busy} onAct={onAct} />
				<PickupRows pickups={facts.pickups} busy={busy} onTask={onTask} />
				<SessionRows entries={facts.listed} />
			</div>
		</ScrollArea>
	);
}
