import { Shimmer } from "@/components/ai-elements/shimmer";

/** One muted line saying the tutor is working (spec: activity-line.md):
 *  "Thinking…", "Planning the lesson…".
 *  Shimmering text only; no spinner, no tool arguments. */
export function ActivityLine({ label, testId }: { label: string; testId?: string }) {
	return (
		<div data-slot="activity-line" data-testid={testId} role="status" className="flex h-6 items-center text-body system-current:text-row">
			<Shimmer as="span" duration={1.6}>{label}</Shimmer>
		</div>
	);
}
