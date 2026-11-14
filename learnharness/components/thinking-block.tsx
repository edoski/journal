"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageResponse } from "@/components/ai-elements/message";

/** The unified user-thinking row (owner round, 2026-10-05): ONE visual
 *  language for every surface where the learner's own thinking renders —
 *  practice thinking traces, the reading channel lifted above the answered
 *  card, the quiz answer's thinking inside its container. The learner's
 *  quiet surface (radius 12, card fill, no rail) with a sentence-case
 *  trigger; expanding opens the text in muted italics, the inner-voice
 *  signature. In a card (`inCard`) it takes no surface of its own.
 *  `defaultOpen` marks transcript rows, which arrive EXPANDED (clearly
 *  conveyed that the thinking was sent).
 *
 *  ⌘T (toggle-user-thinking) sets EVERY row to one state via the module
 *  store below — one source of truth, no provider tree: rows subscribe on
 *  mount; explicit sets (and only those) stomp individual toggles. */

// ── The ⌘T store (module-scope, one per page load) ─────────────────────────
// null = "rows run their own defaults" (the pre-toggle state); the first ⌘T
// resolves from `true` (transcript rows default open) and then alternates.
let allUserThinkingOpen: boolean | null = null;
const userThinkingListeners = new Set<(open: boolean) => void>();

export function currentUserThinkingOpen(): boolean {
	return allUserThinkingOpen ?? true;
}

/** The row's starting state: an explicit ⌘T set wins over the row's own
 *  default (late mounts honor the last set — same path as the live sync,
 *  readable at render time so static SSR reflects the store too). */
function resolveUserThinkingOpen(defaultOpen: boolean): boolean {
	return allUserThinkingOpen ?? defaultOpen;
}

export function setAllUserThinkingOpen(open: boolean) {
	allUserThinkingOpen = open;
	for (const l of userThinkingListeners) l(open);
}

function subscribeUserThinking(fn: (open: boolean) => void): () => void {
	userThinkingListeners.add(fn);
	if (allUserThinkingOpen !== null) fn(allUserThinkingOpen); // late mounts honor the last set
	return () => userThinkingListeners.delete(fn);
}

export function ThinkingBlock({
	label = "YOUR THINKING",
	text,
	testId,
	dataCommit,
	defaultOpen = false,
	inCard = false,
}: {
	label?: string;
	text: string;
	testId?: string;
	/** The practice marker's register flag (commit vs nudge). */
	dataCommit?: boolean;
	/** Transcript rows arrive expanded (owner, 2026-10-07). */
	defaultOpen?: boolean;
	/** On the card's own background: no surface of its own. */
	inCard?: boolean;
}) {
	const [open, setOpen] = useState(() => resolveUserThinkingOpen(defaultOpen));
	// ⌘T: an explicit global set overrides every row (once set, rows re-sync).
	const syncedRef = useRef(false);
	useEffect(
		() => subscribeUserThinking((o) => { syncedRef.current = true; setOpen(o); }),
		[],
	);
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			data-testid={testId}
			data-slot="learner-note"
			data-commit={dataCommit === undefined ? undefined : dataCommit ? "true" : "false"}
			className={cn("lh-card-enter w-full", inCard ? "mt-3" : "my-1 rounded-xl bg-card px-4 py-3")}
		>
			<CollapsibleTrigger
				data-testid={testId ? `${testId}-trigger` : undefined}
				onClick={blurAfterPointerClick}
				className="-mx-1 flex items-center gap-1 rounded-md px-1 text-row text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
			>
				{label === "YOUR THINKING" ? "Your thinking" : label}
				<ChevronDownIcon className={cn("size-4 shrink-0 transition-transform motion-reduce:transition-none", open ? "rotate-180" : "rotate-0")} />
			</CollapsibleTrigger>
			<CollapsibleContent asChild>
				<div className="mt-1">
					<MessageResponse className="italic text-muted-foreground">{text}</MessageResponse>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
