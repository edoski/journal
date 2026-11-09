"use client";

import { CornerDownRightIcon } from "lucide-react";
import type { CourseSummary } from "@/src/core";
import { Button } from "@/components/ui/button";
import { suggestions } from "@/components/start/today-c/suggestions-facts";

/** Candidate C (spec: suggestions.md): what is waiting, as up to three
 *  requests under the composer; a click puts one in the composer, with its
 *  course chosen, for the learner to send or edit. */
export function SuggestionsToday({
	courses,
	busy,
	onSuggest,
}: {
	courses: readonly CourseSummary[];
	busy: boolean;
	onSuggest: (request: string, workspace: string) => void;
}) {
	const offered = suggestions(courses);
	if (offered.length === 0) return null;
	return (
		<ul aria-label="Suggestions" data-slot="today-suggestions" className="flex flex-col">
			{offered.map((s) => (
				<li key={`${s.workspace}:${s.request}`}>
					<Button
						variant="quiet"
						data-slot="today-suggestion"
						disabled={busy}
						onClick={() => onSuggest(s.request, s.workspace)}
						className="h-8 w-full justify-start gap-2 px-4 text-row font-normal"
					>
						<CornerDownRightIcon className="size-3.5" />
						<span className="min-w-0 truncate">{s.request}</span>
						{s.course && <span className="ml-auto shrink-0 pl-4 text-label">{s.course}</span>}
					</Button>
				</li>
			))}
		</ul>
	);
}
