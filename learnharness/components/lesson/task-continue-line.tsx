import { SectionBreak } from "@/components/lesson/section-break";
import { MathText } from "@/components/ui/math-text";

/** His Continue on a task, where he picks it up (spec: task-continue-line.md):
 *  the task's title as the break, then the step he left it at, drawn the
 *  moment he presses while the tutor's turn writes that step out (round 17,
 *  M8: Continue Problem sheet 4 showed only "Thinking…" for 42 s). */
export function TaskContinueLine({ title, step }: { title: string; step: string | null }) {
	return (
		<div data-slot="task-continue" data-testid="task-continue-line" className="flex w-full flex-col">
			<SectionBreak label={title} />
			{step && (
				<p data-slot="task-continue-step" className="text-body text-foreground">
					<MathText>{step}</MathText>
				</p>
			)}
		</div>
	);
}
