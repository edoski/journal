import { ScrollArea } from "@/components/ui/scroll-area";
import { PickupRows } from "@/components/unit-inbox/topic-page/pickup-rows";
import { SessionRows } from "@/components/unit-inbox/topic-page/session-rows";
import { TopicHead } from "@/components/unit-inbox/topic-page/topic-head";
import type { TopicPageProps } from "@/components/unit-inbox/topic-page/topic-page";

/** Topic page candidate "brief" (spec: brief.md): Home's Today for one
 *  topic. The head says where he stands and the one thing to do, the
 *  pick-up rows where it was left, the sessions are a quiet dated list,
 *  and the page stops there. */
export function BriefTopic({ facts, busy, onAct, onTask }: TopicPageProps) {
	return (
		<ScrollArea bar={false} className="min-h-0 flex-1">
			<div data-testid="unit-page" data-topic-candidate="brief" className="mx-auto flex w-full max-w-[46rem] flex-col gap-5 px-6 pb-8 pt-6">
				<TopicHead facts={facts} busy={busy} onAct={onAct} />
				<PickupRows pickups={facts.pickups} busy={busy} onTask={onTask} />
				<SessionRows entries={facts.listed} />
			</div>
		</ScrollArea>
	);
}
