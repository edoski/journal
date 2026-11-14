"use client";

import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { LessonCard } from "@/components/lesson/lesson-card";

/** Recovery belongs to the transcript, never the answer dock. The caller
 * only offers it for the current saved malformed batch, not failed/aborted
 * generations or historical attempts. */
export function MalformedQuestion({ onRetry, disabled, reason }: {
	onRetry?: () => void;
	disabled?: boolean;
	reason?: string;
}) {
	return (
		<LessonCard data-testid="malformed-question" className="text-row text-muted-foreground">
			<p>This question could not be displayed.{onRetry ? " Retry it or send a message to continue." : ""}</p>
			{reason && <p className="mt-1">{reason}</p>}
			{onRetry && (
				<Hint label={reason ?? "Requests a replacement from the model."}>
					<Button type="button" variant="quiet" size="row" className="-ml-2 mt-2 text-foreground" disabled={disabled}
						data-testid="retry-malformed-question" onClick={onRetry}>
						Retry question
					</Button>
				</Hint>
			)}
		</LessonCard>
	);
}
