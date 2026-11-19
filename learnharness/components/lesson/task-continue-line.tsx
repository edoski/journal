import { SectionBreak } from "@/components/lesson/section-break";
import { MathText } from "@/components/ui/math-text";

/** His Continue on a task, where he picks it up (spec: task-continue-line.md):
 *  the task's title as the break, the part's text from his material, then
 *  the step he left it at, drawn the moment he presses while the tutor's
 *  turn writes that step out (round 17, M8: Continue Problem sheet 4 showed
 *  only "Thinking…" for 42 s; round 18, M6: the part's matrix waited for the
 *  turn, 64 to 80 s), so he can work on it at once. */
export function TaskContinueLine({ title, step, passage }: { title: string; step: string | null; passage?: string | null }) {
	return (
		<div data-slot="task-continue" data-testid="task-continue-line" className="flex w-full flex-col gap-2">
			<SectionBreak label={title} />
			{passage && (
				<p data-slot="task-continue-passage" className="whitespace-pre-line text-body text-foreground">
					<MathText>{passage}</MathText>
				</p>
			)}
			{step && (
				<p data-slot="task-continue-step" className="text-body text-foreground">
					<MathText>{step}</MathText>
				</p>
			)}
		</div>
	);
}
