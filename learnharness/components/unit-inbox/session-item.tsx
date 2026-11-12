"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatListItem } from "@/src/core";
import type { useSessionsSidebar } from "@/components/sidebar-state";
import { CoverageMenuItem } from "@/components/unit-inbox/coverage-menu-item";
import { SessionSlimRow } from "@/components/unit-inbox/unit-row";
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
		<li data-testid="session-rename-row" className="flex h-9 list-none items-center">
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
				className="h-9 bg-fill-selected pl-[2.125rem] hover:bg-fill-selected focus-visible:bg-fill-selected"
			/>
		</li>
	);
}

/** One session as a one-line shelf row, with its menu (Rename, Export,
 *  Delete, the notes it has not given yet). */
export function SessionItem({ chat, s, highlighted = false, parent }: { chat: ChatListItem; s: SessionsSidebar; highlighted?: boolean; parent?: string }) {
	if (s.renamingId === chat.id) {
		return <RenameRow chat={chat} onCommit={(next) => void s.commitRename(chat.id, next)} onCancel={() => s.setRenamingId(null)} />;
	}
	return (
		<li className="group/sidebar-row relative list-none">
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<SessionSlimRow chat={chat} active={s.pathname === `/chat/${chat.id}`} highlighted={highlighted} parent={parent} onOpen={() => s.openChat(chat.id)} />
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
		</li>
	);
}
