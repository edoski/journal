"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ChatListItem } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { focusWhereHeTypes } from "@/components/ui/overlay";

/** The sidebar's snapshot as a turn starts or settles in this window: a
 *  start marks the session busy at once; a settle leaves the snapshot as
 *  it is until the server's fresh one lands, since the one it holds was
 *  read mid-turn and reads the reply as cut off (round 10, 2 m5: "Reply
 *  cut off" flashed on the card at the end of the opener, then "Your
 *  turn"). Pure. */
export function turnStatePatch(chats: ChatListItem[] | null, id: string, running: boolean): ChatListItem[] | null {
	if (!running || !chats) return chats;
	return chats.map((c) => (c.id === id ? { ...c, busy: true } : c));
}

/** A turn settled in this window: the server's fresh snapshot replaces
 *  the one the start patched (turnStatePatch). When the app cannot be
 *  reached it never lands, and no turn runs there that the card could
 *  show: the card stops saying the tutor writes, and the server's own
 *  state replaces it once the app is back (round 12, 4 minor 4: offline,
 *  "Still can't reach the app…" in the lesson and "Tutor writing" on its
 *  card; after the server died mid-turn, the same until the restart). */
export async function settleSnapshot(
	refresh: () => Promise<boolean>,
	setChats: (patch: (chats: ChatListItem[] | null) => ChatListItem[] | null) => void,
	id: string,
): Promise<void> {
	if (await refresh()) return;
	setChats((chats) => chats?.map((c) => (c.id === id && c.busy ? { ...c, busy: false } : c)) ?? chats);
}

/** A title's words as search reads them: lowercase letters and digits,
 *  maths markup set aside. */
function titleWords(text: string): string[] {
	return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** How well a title matches the query, by its words: 0 unless every word
 *  of the query starts a word of the title (round 16, m29: cmdk's
 *  scattered-letter match listed "Matrix multiplication as composition"
 *  for "Poisson"); 3 for the title itself, 2 for a title that starts with
 *  the query, 1 for one that holds it further in. */
export function titleScore(title: string, query: string): number {
	const words = titleWords(title);
	const asked = titleWords(query);
	if (asked.length === 0 || !asked.every((q) => words.some((w) => w.startsWith(q)))) return 0;
	const whole = words.join(" ");
	const said = asked.join(" ");
	return whole === said ? 3 : whole.startsWith(said) ? 2 : 1;
}

/** The items whose title matches the query (`titleScore`), best first,
 *  ties in the list's own order. An empty query keeps the list's order. */
export function rankByTitle<T>(items: readonly T[], query: string, title: (item: T) => string): T[] {
	if (!query.trim()) return [...items];
	return items
		.map((item) => ({ item, score: titleScore(title(item), query) }))
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((r) => r.item);
}

/** The search over the sessions (owner round 8, 2026-10-05), by title,
 *  and by the title of every topic it saved answers on (`topicTitle`), so
 *  a review named for its course is found by its topics (round 17, m5:
 *  "chain rule" found no session). */
export function filterSessions(list: ChatListItem[], query: string, topicTitle: (chat: ChatListItem, handle: string) => string | undefined = () => undefined): ChatListItem[] {
	if (!query.trim()) return [...list];
	// A deleted course's session reads the titles it kept (round 18, m24).
	const names = (c: ChatListItem) => [c.title, ...[...new Set([...Object.keys(c.answeredOn ?? {}), ...Object.keys(c.topicTitles ?? {})])].flatMap((h) => topicTitle(c, h) ?? c.topicTitles?.[h] ?? [])];
	return list
		.map((item) => ({ item, score: Math.max(...names(item).map((name) => titleScore(name, query))) }))
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((r) => r.item);
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

	// Whether the server's snapshot landed (settleSnapshot reads it).
	const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
	/** Bumped by a course's delete: a list read begun before it is stale. */
	const deletes = useRef(0);
	const refresh = useCallback((): Promise<boolean> => {
		// In-flight coalesce (S6): event bursts may land several refresh
		// calls at once — one fetch serves them all; anything newer arrives
		// with the next event's fetch.
		if (refreshInFlightRef.current) return refreshInFlightRef.current;
		const reading = (async () => {
			const begun = deletes.current;
			try {
				const res = await fetch("/api/chats", { cache: "no-store" });
				if (!res.ok) throw new Error(`the sessions list failed: ${res.status}`);
				const d = (await res.json()) as { chats: ChatListItem[] };
				if (begun === deletes.current) setChats(d.chats);
				return true;
			} catch {
				// a transient failure keeps the last snapshot
				setChats((prev) => prev ?? []);
				return false;
			} finally {
				refreshInFlightRef.current = null;
			}
		})();
		refreshInFlightRef.current = reading;
		return reading;
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
			if (running && !chatsRef.current?.some((c) => c.id === id)) {
				void refresh(); // the brand-new session: it isn't in the snapshot yet
				return;
			}
			setChats((prev) => turnStatePatch(prev, id, running));
			// Settle: the server snapshot is now truthful — land it now.
			if (!running) void settleSnapshot(refresh, setChats, id);
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
	// A deleted course's sessions are history at once, on the event that flips its open lesson (round 21, m8: its
	// card read "Your turn" in both windows for at least 2.4 s, and opened the deleted course's review).
	useServerEvent("courses-changed", ({ deleted }) => {
		if (!deleted) return;
		deletes.current++;
		setChats((prev) => prev?.map((c) => (c.course?.workspace === deleted ? { ...c, courseDeleted: true } : c)) ?? prev);
		scheduleEventRefresh();
	});
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
	const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, shown: readonly ChatListItem[] | null, top: string | null = null) => {
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
			// The quick-open: the best match shown, whatever its section, else
			// the first (round 16, m29: Enter opened the first section's row,
			// never the topic named exactly).
			e.preventDefault();
			setKbdIndex(null);
			e.currentTarget.blur();
			(rows.find((row) => row.dataset.sidebarRow === top) ?? rows[0]!).click();
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
