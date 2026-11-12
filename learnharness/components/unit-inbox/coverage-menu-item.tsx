"use client";

import { coverageItem, useSessionCoverage } from "@/components/extraction-coverage";
import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@/components/ui/context-menu";

/** The session menu's last item: what the extractor hasn't read yet, and
 *  Extract. Choosing it keeps the menu open, so the label turns to
 *  "Extracting notes…" in place. Nothing shows until the first read. */
export function CoverageMenuItem({ chatId }: { chatId: string }) {
	const { coverage, extracting, extract } = useSessionCoverage(chatId);
	if (coverage === null) return null;
	const item = coverageItem(coverage, extracting);
	return (
		<>
			<ContextMenuSeparator />
			<ContextMenuItem
				data-testid="ctx-extract"
				className="whitespace-nowrap"
				disabled={item.disabled}
				onSelect={(e) => {
					e.preventDefault();
					extract();
				}}
			>
				<span data-testid={item.running ? "ctx-coverage-running" : "ctx-coverage"}>{item.label}</span>
				{item.detail && <ContextMenuShortcut>{item.detail}</ContextMenuShortcut>}
			</ContextMenuItem>
		</>
	);
}
