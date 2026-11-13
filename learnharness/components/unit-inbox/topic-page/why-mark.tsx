import { MessageCircleQuestionIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrailleSpinner } from "@/components/braille-spinner";

/** Why a row wants him now, as Home's Hybrid row says it: "Your turn" in
 *  the accent with its icon, or the spinner and "The tutor is writing".
 *  Home keeps its own mark private, so the values are restated here. */
export function WhyMark({ kind, words }: { kind: "reply" | "writing"; words: string }) {
	return (
		<span
			data-slot="topic-why"
			data-kind={kind}
			className={cn("inline-flex max-w-56 items-center gap-1.5 justify-self-end text-label", kind === "reply" ? "font-medium text-link" : "text-muted-foreground")}
		>
			{kind === "reply" ? <MessageCircleQuestionIcon aria-hidden className="size-3.5" /> : <BrailleSpinner className="text-muted-foreground" />}
			<span className="truncate">{words}</span>
		</span>
	);
}
