"use client";

import { ChevronDownIcon } from "lucide-react";
import type { CourseSummary } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { nextStep } from "@/components/start/today-a/next-step-facts";

/** Candidate A (spec: next-step.md): Today names the one next step in
 *  words with one Continue; the other courses wait behind a disclosure. */
export function NextStepToday({
	courses,
	busy,
	onStart,
}: {
	courses: readonly CourseSummary[];
	busy: boolean;
	onStart: (workspace: string) => void;
}) {
	const { lead, others } = nextStep(courses);
	if (!lead) {
		return (
			<p data-slot="today-next" className="px-4 text-row text-muted-foreground">
				Nothing is waiting today.
			</p>
		);
	}
	return (
		<Collapsible data-slot="today-next" className="flex flex-col px-4">
			<p className="text-row text-muted-foreground">{lead.caption}</p>
			<h2 className="mt-1 text-prose font-medium text-foreground">{lead.title}</h2>
			{lead.detail && <p className="mt-0.5 max-w-[36rem] text-row text-muted-foreground">{lead.detail}</p>}
			<div className="mt-4 flex items-center gap-2">
				<Button
					data-slot="today-continue"
					disabled={busy}
					onClick={() => onStart(lead.workspace)}
					className="h-8 rounded-full px-3.5 text-row font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					Continue
				</Button>
				{others.length > 0 && (
					<CollapsibleTrigger asChild>
						<Button variant="quiet" className="group h-8 gap-1 rounded-full px-3 text-row font-normal">
							Other courses
							<ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
						</Button>
					</CollapsibleTrigger>
				)}
			</div>
			{others.length > 0 && (
				<CollapsibleContent>
					<ul aria-label="Other courses" className="-mx-3 mt-3 flex flex-col">
						{others.map((other) => (
							<li key={other.workspace}>
								<Button
									variant="quiet"
									data-slot="today-other"
									disabled={busy}
									onClick={() => onStart(other.workspace)}
									className="h-8 w-full justify-start gap-0 px-3 text-row font-normal"
								>
									<span className="text-foreground">{other.course}</span>
									<span className="min-w-0 truncate">&nbsp;· {other.line}</span>
								</Button>
							</li>
						))}
					</ul>
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
