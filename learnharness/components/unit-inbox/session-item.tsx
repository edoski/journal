"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatListItem } from "@/src/core";
import type { useSessionsSidebar } from "@/components/sidebar-state";
import { SessionRowNext } from "@/components/sidebar-next";
import { CoverageMenuItem } from "@/components/unit-inbox/coverage-menu-item";
import { Input } from "@/components/ui/input";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";

export type SessionsSidebar = ReturnType<typeof useSessionsSidebar>;

/** The inline rename: the row's geometry with the title as a field. Enter
 *  or blur commits, Esc discards. */
function RenameRow({ chat, onCommit, onCancel }: { chat: ChatListItem; onCommit: (next: string) => void; onCancel: () => void }) {
	const [draft, setDraft] = useState(chat.title);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);
	return (
		<div data-testid="session-rename-row" className="flex h-8 items-center">
			<Input
				ref={inputRef}
				variant="quiet"
				value={draft}
				spellCheck={false}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => onCommit(draft)}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
					if (e.key === "Escape") {
						e.stopPropagation();
						onCancel();
					}
				}}
				aria-label="Rename session"
				data-testid="session-rename-input"
				className="bg-fill-selected pl-8 hover:bg-fill-selected focus-visible:bg-fill-selected"
			/>
		</div>
	);
}

/** One session as a sidebar row, with its menu (Rename, Export, Delete,
 *  the notes it has not given yet): the Proposed session row as it is. */
export function SessionItem({ chat, s, highlighted = false }: { chat: ChatListItem; s: SessionsSidebar; highlighted?: boolean }) {
	if (s.renamingId === chat.id) {
		return <RenameRow chat={chat} onCommit={(next) => void s.commitRename(chat.id, next)} onCancel={() => s.setRenamingId(null)} />;
	}
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<SessionRowNext
					chat={chat}
					active={s.pathname === `/chat/${chat.id}`}
					highlighted={highlighted}
					onOpen={() => s.openChat(chat.id)}
				/>
			</ContextMenuTrigger>
			<ContextMenuContent data-testid="session-context-menu" className="w-64">
				<ContextMenuItem data-testid="ctx-rename" onSelect={() => s.renameChat(chat.id)}>
					Rename
				</ContextMenuItem>
				<ContextMenuItem data-testid="ctx-export-md" onSelect={() => s.exportChat(chat.id)}>
					Export as Markdown…
				</ContextMenuItem>
				<ContextMenuItem data-testid="ctx-delete" variant="destructive" onSelect={() => s.deleteChat(chat.id)}>
					Delete…
				</ContextMenuItem>
				<CoverageMenuItem chatId={chat.id} />
			</ContextMenuContent>
		</ContextMenu>
	);
}
