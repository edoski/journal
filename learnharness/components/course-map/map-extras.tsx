"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EllipsisIcon } from "lucide-react";
import type { GraphSnapshot } from "@/src/core";
import { useActivity } from "@/components/activity-dock";
import { ChainTableOverlay } from "@/components/chain-table.tsx";
import { NotesImportErrors, NotesImportNotices, useNotesImport } from "@/components/notes-import.tsx";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * The course map's More menu (Import notes, Statements), shared by the map
 * page and Home's enlarged map. It returns the menu's trigger, the import's
 * notices for the host to place under its bar, and the statements overlay
 * for the host to place over its map.
 */
export function useMapExtras(): {
	menu: ReactNode;
	notices: ReactNode;
	overlay: ReactNode;
} {
	const fileInput = useRef<HTMLInputElement>(null);
	const refreshActivity = useActivity().refresh;
	const notesImport = useNotesImport({
		onStart: () => {
			refreshActivity();
			setTimeout(() => refreshActivity(), 600);
		},
	});
	const [statementsOpen, setStatementsOpen] = useState(false);
	const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
	const loadStatements = useCallback(() => {
		void fetch("/api/graph")
			.then((r) => r.json() as Promise<GraphSnapshot>)
			.then(setSnapshot)
			.catch(() => setSnapshot(null));
	}, []);
	useEffect(() => {
		if (!statementsOpen) return;
		loadStatements();
		window.addEventListener("lh:graph-revision", loadStatements);
		return () => window.removeEventListener("lh:graph-revision", loadStatements);
	}, [statementsOpen, loadStatements]);

	const menu = (
		<>
			<input
				ref={fileInput}
				type="file"
				multiple
				accept=".md,.markdown,.txt,.pdf"
				className="hidden"
				onChange={(e) => {
					notesImport.onImportFiles(e.target.files);
					e.target.value = "";
				}}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="quiet" size="icon-row" aria-label="More" data-testid="map-more" className="lh-no-drag">
						<EllipsisIcon />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem disabled={notesImport.importing} onSelect={() => fileInput.current?.click()}>
						{notesImport.importing ? "Importing notes…" : "Import notes…"}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setStatementsOpen(true)} data-testid="map-statements">
						Statements…
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
	const notices =
		notesImport.errors.length > 0 || notesImport.notices.length > 0 ? (
			<>
				<NotesImportErrors errors={notesImport.errors} variant="proposed" />
				<NotesImportNotices notices={notesImport.notices} variant="proposed" />
			</>
		) : null;
	const overlay = (
		<ChainTableOverlay
			open={statementsOpen}
			nodes={snapshot?.propositions ?? []}
			chains={snapshot?.chains ?? []}
			sessions={snapshot?.sessions ?? {}}
			fileSources={snapshot?.fileSources ?? {}}
			onClose={() => setStatementsOpen(false)}
		/>
	);
	return { menu, notices, overlay };
}
