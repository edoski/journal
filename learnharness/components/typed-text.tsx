import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/**
 * What he typed, as he typed it (spec: typed-text.md): his answer, his
 * thinking. His lines and spaces stay, a `*` stays a star (he writes
 * 0.5*0.10 for a product), and only his LaTeX is typeset, by MathText.
 * Never markdown: his words are not a page to lay out.
 */
export function TypedText({ children, className }: { children: string; className?: string }) {
	return (
		<p data-slot="typed-text" className={cn("lh-prose whitespace-pre-wrap break-words", className)}>
			<MathText>{children}</MathText>
		</p>
	);
}
