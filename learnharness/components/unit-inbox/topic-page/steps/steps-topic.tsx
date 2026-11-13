"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PickupRows } from "@/components/unit-inbox/topic-page/pickup-rows";
import { SessionRows } from "@/components/unit-inbox/topic-page/session-rows";
import { StepsMap } from "@/components/unit-inbox/topic-page/steps/steps-map";
import { planTabs } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { TopicHead } from "@/components/unit-inbox/topic-page/topic-head";
import type { TopicPageProps } from "@/components/unit-inbox/topic-page/topic-page";

/**
 * Topic page candidate "steps" (spec: steps.md): Home one level down. The
 * shared head and pick-up rows, then the steps of a lesson whose tutor
 * wrote a plan as a map, under its name, or under a tab per lesson when
 * there are several, then the sessions. A topic with no planned lesson has
 * no map.
 */
export function StepsTopic({ facts, busy, onAct, onTask }: TopicPageProps) {
	const { tabs, opens } = planTabs(facts.sessions, facts.pickups, facts.today);
	const [chosen, setChosen] = useState(opens);
	const value = tabs.some((tab) => tab.id === chosen) ? chosen : opens;
	return (
		<ScrollArea bar={false} className="min-h-0 flex-1">
			<div data-testid="unit-page" data-topic-candidate="steps" className="mx-auto flex w-full max-w-[46rem] flex-col gap-5 px-6 pb-8 pt-6">
				<TopicHead facts={facts} busy={busy} onAct={onAct} />
				<PickupRows pickups={facts.pickups} busy={busy} onTask={onTask} />
				{tabs.length === 1 && (
					<section data-slot="topic-lessons" className="flex flex-col">
						<h2 className="flex h-7 items-center text-label font-medium text-muted-foreground">{tabs[0]!.label}</h2>
						<StepsMap plan={tabs[0]!.entry.plan} waits={tabs[0]!.entry.state === "your-turn"} href={`/chat/${tabs[0]!.id}`} lesson={tabs[0]!.label} />
					</section>
				)}
				{tabs.length > 1 && value && (
					<Tabs value={value} onValueChange={setChosen} data-slot="topic-lessons">
						<TabsList variant="line" aria-label="Steps of a lesson">
							{tabs.map((tab) => (
								<TabsTrigger key={tab.id} value={tab.id} data-slot="topic-lesson-tab">
									{tab.label}
								</TabsTrigger>
							))}
						</TabsList>
						{tabs.map((tab) => (
							// The map inside holds the panel's one tab stop.
							<TabsContent key={tab.id} value={tab.id} tabIndex={-1}>
								<StepsMap plan={tab.entry.plan} waits={tab.entry.state === "your-turn"} href={`/chat/${tab.id}`} lesson={tab.label} />
							</TabsContent>
						))}
					</Tabs>
				)}
				<SessionRows entries={facts.listed} />
			</div>
		</ScrollArea>
	);
}
