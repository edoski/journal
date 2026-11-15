"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fuzzyScore, type ChatListItem } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { focusWhereHeTypes } from "@/components/ui/overlay";

/** The search over the list (owner round 8, 2026-10-05): a fuzzy
 *  subsequence match ranked by fuzzyScore — prefix beats word-boundary
 *  beats scattered. An empty query keeps the list's own order. */
export function filterSessions(list: ChatListItem[], query: string): ChatListItem[] {
	const q = query.trim();
	if (!q) return list;
	return list
		.map((c) => ({ c, score: fuzzyScore(q, c.title) }))
		.filter((r): r is { c: ChatListItem; score: number } => r.score !== null)
		.sort((a, b) => b.score - a.score)
		.map((r) => r.c);
}

/**
 * The session sidebar's behaviour behind UnitSidebar: the push-driven
 * list, the instant rename and turn-state patches, inline rename, export
 * and delete, and the search walk. The rationale for each piece lives
 * beside it; the sidebar only draws.
 */
/** Esc out of the sidebar's search: the search empties, so the sidebar
 *  shows its agenda again (round 8: the filter stayed after Esc, on every
 *  page), and focus goes back to the box he types in where there is one
 *  (round 7: Esc left focus on the page). */
export function leaveSearch(field: { blur(): void }, changeQuery: (next: string) => void, doc: Document | undefined): void {
	changeQuery("");
	field.blur();
	focusWhereHeTypes(doc, false);
}

/** Whether a click in the search results opens one (a course, an arc, a
 *  topic or a session row): the search then empties, so the sidebar shows
 *  its agenda again on the page he opened (round 9: the filter stayed and
 *  hid Today until ✕). */
export function opensSearchResult(target: EventTarget | null): boolean {
	const el = target as Element | null;
	return typeof el?.closest === "function" && el.closest("[data-sidebar-row]") !== null;
}

export function useSessionsSidebar({ open, toggle }: { open: boolean; toggle: () => void }) {
	const [chats, setChats] = useState<ChatListItem[] | null>(null);
	const [query, setQuery] = useState("");
	const pathname = usePathname();
	const router = useRouter();

	const refreshInFlightRef = useRef(false);
	const refresh = useCallback(async () => {
		// In-flight coalesce (S6): event bursts may land several refresh
		// calls at once — one fetch serves them all; anything newer arrives
		// with the next event's fetch.
		if (refreshInFlightRef.current) return;
		refreshInFlightRef.current = true;
		try {
			const res = await fetch("/api/chats", { cache: "no-store" });
			const d = (await res.json()) as { chats: ChatListItem[] };
			setChats(d.chats);
		} catch {
			// a transient failure keeps the last snapshot
			setChats((prev) => prev ?? []);
		} finally {
			refreshInFlightRef.current = false;
		}
	}, []);

	/* Instant rename propagation (2026-09-17): the chat header's rename
	   commits dispatch lh:chat-renamed; patch the snapshot in place instead
	   of waiting for the 2.5s poll. */
	useEffect(() => {
		const onRenamed = (e: Event) => {
			const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
			setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, title } : c)) : prev));
		};
		window.addEventListener("lh:chat-renamed", onRenamed);
		return () => window.removeEventListener("lh:chat-renamed", onRenamed);
	}, []);

	/* INSTANT TURN-STATE (owner, sidebar round 2026-10-02): the open
	   session broadcasts lh:turn-state the instant its turn starts
	   (submitted — the optimistic machine's own flip) and at settle —
	   busy mirrors the server's own definition (isTurnRunning), so the
	   patch is exact: spinner up the moment the action happens, cleared
	   and refetched once at settle (title/order move with turns). The
	   events channel is the backstop for everything only the server
	   knows: other windows, wake turns in unopened sessions. A start on
	   a chat not yet in the snapshot (a brand-new session) = one
	   immediate refresh instead of a patch. */
	const chatsRef = useRef(chats);
	chatsRef.current = chats;
	useEffect(() => {
		const onTurnState = (e: Event) => {
			const { id, running } = (e as CustomEvent<{ id: string; running: boolean }>).detail;
			if (running) {
				if (chatsRef.current?.some((c) => c.id === id)) {
					setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, busy: true } : c)) : prev));
				} else {
					void refresh(); // the brand-new session: it isn't in the snapshot yet
				}
				return;
			}
			setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, busy: false } : c)) : prev));
			void refresh(); // settle: the server snapshot is now truthful — land it now
		};
		window.addEventListener("lh:turn-state", onTurnState);
		return () => window.removeEventListener("lh:turn-state", onTurnState);
	}, [refresh]);

	/* PUSH (architecture S6, 2026-10-02): the 2.5s poll is RETIRED — the
	   last standing network poll in the app. List truth arrives as
	   events: chats-changed (create/rename/delete — the list-SHAPE
	   writes), turn-started/turn-settled for EVERY chat (unfiltered:
	   any chat's turn flips busy/order/phase in this list), and
	   record-changed for the turn-less record writes (an idle dismissal
	   clears a waiting question or problem). Announced
	   fetches ride the 250ms trailing debounce (the S4/S5 law); resync
	   (reconnect / dev-restart) is immediate. lh:turn-state +
	   lh:chat-renamed stay for same-tab INSTANTS — local beats any
	   round-trip. */
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	const eventDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const scheduleEventRefresh = () => {
		if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current);
		eventDebounceRef.current = setTimeout(() => {
			eventDebounceRef.current = undefined;
			void refreshRef.current();
		}, 250);
	};
	useServerEvent("chats-changed", scheduleEventRefresh);
	useServerEvent("turn-started", scheduleEventRefresh);
	useServerEvent("turn-settled", scheduleEventRefresh);
	useServerEvent("record-changed", scheduleEventRefresh);
	useServerEvent("compaction-changed", scheduleEventRefresh);
	useServerResync(() => void refreshRef.current());
	useEffect(
		() => () => {
			if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current);
		},
		[],
	);

	/* ── Keyboard seams (shortcut wave A, 2026-09-17; search-walk round
	   2026-10-10) ── ⌘⇧F focuses the search field — and THE SEARCH OWNS THE
	   WALK: ↑/↓ cycle the filtered list (wrap — "cycle"), Enter opens the
	   walked row, or the FIRST match when nothing is walked (owner,
	   2026-10-10 — the quick-open pattern: ⌘⇧F, type, Enter, done). The
	   Alt+↑/↓/↵ global cycle was RETIRED the same round: barely used,
	   felt laggy. The selection is a row index into the shown list, so the
	   walk follows whatever the query (and Current's kind filter) leave.
	   Mouse and keyboard coexist: hovering doesn't claim, a click or an
	   open clears the selection. */
	const [kbdIndex, setKbdIndex] = useState<number | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const changeQuery = useCallback((next: string) => {
		setQuery(next);
		// The list reorders under the query every keystroke —
		// a stale walk index would point at the wrong row.
		setKbdIndex(null);
	}, []);

	// THE SEARCH OWNS THE WALK (owner, 2026-10-10 — the retired Alt+↑/↓/↵
	// cycle's successor): ↑/↓ cycle the filtered rows (wrap), Enter opens
	// the walked row — or the FIRST match when nothing is walked (the
	// quick-open pattern) — then blurs (focus returns to the app per the
	// Enter law; opening a result empties the search, opensSearchResult).
	// Esc leaves the search
	// (owner, keyboard wave): blur back to normal, and claim the key so the
	// window Esc chain (abort) doesn't also fire.
	const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, shown: readonly ChatListItem[] | null) => {
		if (e.key === "Escape") {
			e.stopPropagation();
			leaveSearch(e.currentTarget, changeQuery, document);
			return;
		}
		// Modified keys belong to the surface (⇧↵ etc.).
		if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		// Results only: an empty field's list is Today, which its own keys walk.
		if (shown === null) return;
		// Every result is a row, courses and topics as well as lessons
		// (round 3: the walk counted lessons only, so a course found by
		// name was out of the keyboard's reach). The arrows put focus on
		// the first or last row, and the list's own arrows walk on from it.
		const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-sidebar-row]") ?? []);
		if (rows.length === 0) return;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			setKbdIndex(null);
			(e.key === "ArrowDown" ? rows[0] : rows[rows.length - 1])!.focus();
			return;
		}
		if (e.key === "Enter") {
			// The quick-open: the first result shown.
			e.preventDefault();
			setKbdIndex(null);
			e.currentTarget.blur();
			rows[0]!.click();
		}
	};

	/* Inline rename and deletion: the row's own menu names the session it
	   acts on. */
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<ChatListItem | null>(null);

	const renameChat = (chatId: string) => setRenamingId(chatId);

	// Export as Markdown (owner, release polish 2026-10-06): same-origin
	// anchor download; the route's Content-Disposition names the file.
	const exportChat = (chatId: string) => {
		const a = document.createElement("a");
		a.href = `/api/chats/${chatId}/markdown`;
		a.download = ""; // the route's filename wins
		document.body.appendChild(a);
		a.click();
		a.remove();
	};

	const deleteChat = (chatId: string) => {
		const target = chats?.find((c) => c.id === chatId);
		if (target) setDeleting(target);
	};

	// Inline rename (owner ruling, wave 6): the row swaps to a text input;
	// commit rides the SAME plumbing as the header rename — PUT the title,
	// then lh:chat-renamed patches every listener (this sidebar's own
	// listener patches the snapshot instantly; an open chat header hears
	// it too). Esc discards; empty commit discards (the header's rules).
	const commitRename = useCallback(async (id: string, next: string) => {
		setRenamingId(null);
		const t = next.trim();
		if (t === "") return;
		try {
			const res = await fetch(`/api/chats/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: t }),
			});
			if (!res.ok) throw new Error(`rename failed: ${res.status}`);
			window.dispatchEvent(new CustomEvent("lh:chat-renamed", { detail: { id, title: t } }));
		} catch (err) {
			console.error("rename failed:", err); // keep the old title
		}
	}, []);

	// Delete success: patch the list instantly (the poll is the backstop)
	// and navigate home if the open session died (the chat view unmounts —
	// drafts die with it, no orphan bubbles).
	const onDeleted = useCallback(
		(id: string) => {
			setDeleting(null);
			setChats((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
			if (pathname === `/chat/${id}`) router.push("/");
		},
		[pathname, router],
	);

	useEffect(() => {
		const onFocusSearch = () => {
			if (!open) toggle();
			// A clipped (overflow-hidden) input still focuses — the sidebar's
			// slide-in doesn't gate the keystroke.
			requestAnimationFrame(() => searchRef.current?.focus());
		};
		window.addEventListener("lh:kbd-sessions-search", onFocusSearch);
		return () => window.removeEventListener("lh:kbd-sessions-search", onFocusSearch);
	}, [open, toggle]);

	// Keep the kbd-selected row in view (the session rows, in drawn order,
	// so the index matches; Proposed's course headers are buttons too).
	useEffect(() => {
		if (kbdIndex === null) return;
		listRef.current?.querySelectorAll('[data-testid^="session-row"]')[kbdIndex]?.scrollIntoView({ block: "nearest" });
	}, [kbdIndex]);

	useEffect(() => {
		if (!open) return;
		void refresh();
		// Opening + navigation refetch; while open, the events channel owns
		// freshness (S6) — no interval, nothing standing.
	}, [open, pathname, refresh]);

	const openChat = (id: string) => {
		setKbdIndex(null);
		router.push(`/chat/${id}`);
	};

	return {
		chats,
		pathname,
		router,
		query,
		changeQuery,
		kbdIndex,
		searchRef,
		listRef,
		onSearchKeyDown,
		openChat,
		renameChat,
		exportChat,
		deleteChat,
		renamingId,
		setRenamingId,
		commitRename,
		deleting,
		setDeleting,
		onDeleted,
	};
}
