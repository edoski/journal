"use client";

import Link from "next/link";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { MathText } from "@/components/ui/math-text";
import { READY_WORDS } from "@/components/study-words";
import { unitHref } from "@/components/unit-inbox/unit-href";
import type { ExamReady } from "@/components/course-page/standing/standing-model";

/** The readiness words, as the head's readiness fact and the exam's
 *  run-up both say them, so the two never differ: when the line names only the least ready
 *  topics, "and the rest" follows, a press that shows every topic it means,
 *  least ready first, each opening its page (round 9, 2 m13: nine names said
 *  little; round 7: "and others" hid them with no way to see them). */
export function ReadyWords({ ready, workspace }: { ready: ExamReady; workspace: string }) {
	const rest = ready.kind === "notYet" ? ready.rest : null;
	return (
		<span data-slot="ready-words" className="min-w-0">
			<MathText>{ready.words}</MathText>
			{rest && (
				<>
					{" "}
					<Popover>
						<PopoverTrigger data-slot="ready-rest" className="rounded-sm text-link outline-none underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:underline">
							{READY_WORDS.rest}
						</PopoverTrigger>
						<PopoverContent data-slot="ready-rest-list" align="start" collisionPadding={12} className="p-3">
							<PopoverHeader className="px-1 pb-1">
								<PopoverTitle>{rest.heading}</PopoverTitle>
							</PopoverHeader>
							<ol className="flex flex-col">
								{rest.topics.map((topic) => (
									<li key={topic.handle}>
										<Link href={unitHref(workspace, topic.handle)} className="flex min-h-8 items-center rounded-md px-1 text-body font-normal text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
											<MathText>{topic.title}</MathText>
										</Link>
									</li>
								))}
							</ol>
						</PopoverContent>
					</Popover>
				</>
			)}
		</span>
	);
}
