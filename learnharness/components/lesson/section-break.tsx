/** A quiet break in the lesson column (spec: section-break.md): where the
 *  session moves into a new phase, or where older history was compacted.
 *  A hairline, with the section's name in sentence case when it has one. */
export function SectionBreak({ label, testId }: { label?: string; testId?: string }) {
	return (
		<div data-slot="section-break" data-testid={testId} role="separator" aria-label={label} className="my-2 flex w-full items-center gap-3">
			{label && <span className="shrink-0 text-body system-current:text-row text-muted-foreground">{label}</span>}
			<span aria-hidden className="h-px flex-1 bg-border" />
		</div>
	);
}
