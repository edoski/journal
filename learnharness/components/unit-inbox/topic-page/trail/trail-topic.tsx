import { ScrollArea } from "@/components/ui/scroll-area";
import { PickupRows } from "@/components/unit-inbox/topic-page/pickup-rows";
import { TopicHead } from "@/components/unit-inbox/topic-page/topic-head";
import type { TopicPageProps } from "@/components/unit-inbox/topic-page/topic-page";
import { Trail } from "@/components/unit-inbox/topic-page/trail/trail";
import { opensAtFirst, trailDays } from "@/components/unit-inbox/topic-page/trail/trail-facts";

/** Topic page candidate "trail" (spec: trail.md): the shared head with the
 *  page's one action, the open tasks that hold the topic, then one dated
 *  line of its sessions and the engine's scored attempts. The session to
 *  resume is the line's first entry, its steps open. */
export function TrailTopic({ facts, busy, onAct, onTask }: TopicPageProps) {
	return (
		<ScrollArea bar={false} className="min-h-0 flex-1">
			<div data-testid="unit-page" data-topic-candidate="trail" className="mx-auto flex w-full max-w-[46rem] flex-col gap-5 px-6 pb-8 pt-6">
				<TopicHead facts={facts} busy={busy} onAct={onAct} />
				<PickupRows pickups={facts.pickups.filter((pickup) => pickup.kind === "task")} busy={busy} onTask={onTask} />
				<Trail days={trailDays(facts.sessions, facts.attempts, facts.today)} opensAtFirst={opensAtFirst(facts.action)} titleOf={facts.titleOf} />
			</div>
		</ScrollArea>
	);
}
