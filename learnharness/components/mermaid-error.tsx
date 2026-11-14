"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MermaidErrorComponentProps } from "streamdown";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** The failed diagram's source, collapsed behind a quiet 13px trigger. */
function DiagramSource({ chart }: { chart: string }) {
	return (
		<Collapsible className="mt-3">
			<CollapsibleTrigger className="-mx-1 rounded-md px-1 text-row text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground motion-reduce:transition-none">
				Show diagram source
			</CollapsibleTrigger>
			<CollapsibleContent>
				<pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">{chart}</pre>
			</CollapsibleContent>
		</Collapsible>
	);
}

/**
 * Fallback for mermaid diagrams that fail to parse — wired via Streamdown's
 * `mermaid.errorComponent`. Replaces the default light-themed red box with a
 * card matching the app: the error, the source collapsed (so a
 * broken diagram doesn't flood the transcript), and a retry.
 */
export const MermaidError = ({
	chart,
	error,
	retry,
	className,
}: MermaidErrorComponentProps & { className?: string }) => (
	<div
		className={cn(
			"my-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4",
			className,
		)}
		data-streamdown="mermaid-error"
	>
		<p className="text-sm font-medium text-destructive">
			Diagram failed to render
		</p>
		<p className="mt-1 font-mono text-xs break-words text-muted-foreground">
			{error}
		</p>
		<DiagramSource chart={chart} />
		<Button className="mt-3" onClick={retry} size="sm" variant="outline">
			Retry
		</Button>
	</div>
);
