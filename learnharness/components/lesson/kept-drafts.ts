/**
 * His typed work and waiting photos, kept on this Mac per box and window (round 3,
 * 14 Nov 2026): a reload, a restart, Hint or Done for today never empties
 * a box he was writing in. Words live in localStorage, read at once when
 * a box mounts; photos live in IndexedDB, too large for localStorage, and
 * join the box a moment after it mounts. Spec: kept-drafts.md.
 *
 * A box's scope names it: `new` (the New lesson box), `<chat>:composer`,
 * `<chat>:q:<question key>`, `<chat>:p:<problem call id>`, `<chat>:opening`
 * (photos going with a new lesson's first message), and
 * `carry:<course workspace>` (what the next question in that course opens
 * with, after Hint re-asks a check or Done for today leaves one).
 */

import type { Confidence, Photo, QuestionFormDraft } from "@/src/core";

const PREFIX = "lh.kept.";

/** A question form's words as stored: its selection as plain indexes. */
export interface KeptForm {
	selected: number[];
	otherSelected: boolean;
	thinking: string;
	other: string;
	text: string;
	confidence: Confidence;
}

/** What a box keeps: plain text (a composer, a problem) or a question form. */
export interface KeptWords {
	text?: string;
	form?: KeptForm;
}

function storage(): Storage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

/* ── Whose box (round 5, 14 Nov 2026) ───────────────────────────────────
 * A box belongs to the window it was typed in: words typed in one window
 * never fill a box in another. Each window has an id that survives its
 * reloads (sessionStorage) and holds a Web Lock named after it while it
 * lives, so the others can tell a closed window from an open one. A box's
 * key is `lh.kept.<window>|<scope>`. A window opening after another has
 * gone (an app restart) takes the gone window's words for a box it has
 * none in, once; words of a window still open are never taken. */

const WINDOW_KEY = "lh.window";
const LOCK_PREFIX = "lh.window:";
const SEP = "|";

interface KeptWindow {
	id: string;
	/** Ids of windows known to be open; null until the locks answer, when
	 *  nothing is taken from another window. */
	live: Set<string> | null;
}

let current: KeptWindow | null = null;

function newWindowId(): string {
	return `w-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function thisWindow(): KeptWindow {
	if (current) return current;
	let id: string | null = null;
	try {
		id = globalThis.sessionStorage?.getItem(WINDOW_KEY) ?? null;
		if (!id) {
			id = newWindowId();
			globalThis.sessionStorage?.setItem(WINDOW_KEY, id);
		}
	} catch {
		id ??= newWindowId();
	}
	const win: KeptWindow = { id, live: null };
	current = win;
	const locks = (globalThis.navigator as Navigator | undefined)?.locks;
	if (locks) {
		// Held until the window closes: the promise never settles.
		void locks.request(LOCK_PREFIX + id, () => new Promise<void>(() => {})).catch(() => {});
		void locks.query().then((state) => {
			const live = new Set<string>([id]);
			for (const lock of [...(state.held ?? []), ...(state.pending ?? [])]) {
				if (lock.name?.startsWith(LOCK_PREFIX)) live.add(lock.name.slice(LOCK_PREFIX.length));
			}
			if (current === win) win.live = live;
		}).catch(() => {});
	}
	return win;
}

/** Tests name the window and the open ones; the app learns both itself. */
export function setKeptWindow(id: string, others: { live: readonly string[] }): void {
	current = { id, live: new Set([id, ...others.live]) };
}

function keyFor(windowId: string, scope: string): string {
	return `${PREFIX}${windowId}${SEP}${scope}`;
}

/** A stored key's window and scope; a key from before windows had ids
 *  belongs to no open window. */
function parseKey(key: string): { window: string | null; scope: string } | null {
	if (!key.startsWith(PREFIX)) return null;
	const rest = key.slice(PREFIX.length);
	const at = rest.indexOf(SEP);
	if (rest.startsWith("w-") && at > 0) return { window: rest.slice(0, at), scope: rest.slice(at + 1) };
	return { window: null, scope: rest };
}

/** Whether a box's words were left by a window that has closed. */
function orphaned(window: string | null, win: KeptWindow): boolean {
	return window !== win.id && win.live !== null && (window === null || !win.live.has(window));
}

/** Whether a kept value holds anything he typed or chose. */
function holdsWork(words: KeptWords): boolean {
	if (words.text?.trim()) return true;
	const form = words.form;
	return !!form && (form.selected.length > 0 || form.otherSelected || !!form.thinking.trim() || !!form.other.trim() || !!form.text.trim());
}

/** Keeps a box's words, or forgets them when it holds nothing. */
export function keepWords(scope: string, words: KeptWords | null): void {
	const store = storage();
	if (!store) return;
	const key = keyFor(thisWindow().id, scope);
	try {
		if (!words || !holdsWork(words)) store.removeItem(key);
		else store.setItem(key, JSON.stringify(words));
	} catch {
		// Storage full or refused: the box still works, it just won't survive a reload.
	}
}

function parseWords(raw: string | null): KeptWords | undefined {
	if (!raw) return undefined;
	try {
		const value = JSON.parse(raw) as KeptWords;
		return value && typeof value === "object" ? value : undefined;
	} catch {
		return undefined;
	}
}

/** A box's kept words in this window, if any; else a closed window's
 *  words for the same box, taken over by this window. */
export function keptWords(scope: string): KeptWords | undefined {
	const store = storage();
	if (!store) return undefined;
	const win = thisWindow();
	try {
		const own = parseWords(store.getItem(keyFor(win.id, scope)));
		if (own) return own;
		for (let i = 0; i < store.length; i++) {
			const key = store.key(i);
			const parsed = key ? parseKey(key) : null;
			if (!key || !parsed || parsed.scope !== scope || !orphaned(parsed.window, win)) continue;
			const words = parseWords(store.getItem(key));
			store.removeItem(key);
			if (!words) continue;
			store.setItem(keyFor(win.id, scope), JSON.stringify(words));
			return words;
		}
	} catch {
		// Storage refused: nothing kept.
	}
	return undefined;
}

/** A question form as kept words. */
export function formToKept(form: Omit<QuestionFormDraft, "photos">): KeptForm {
	return {
		selected: [...form.selection.selected],
		otherSelected: form.selection.otherSelected,
		thinking: form.thinking,
		other: form.other,
		text: form.text,
		confidence: form.confidence,
	};
}

/** Kept words as a question form's starting draft. */
export function keptToForm(kept: KeptForm): QuestionFormDraft {
	return {
		selection: { selected: new Set(kept.selected), otherSelected: kept.otherSelected },
		thinking: kept.thinking,
		other: kept.other,
		text: kept.text,
		confidence: kept.confidence,
	};
}

/** The carried work as the next question's draft: a typed answer goes in
 *  the answer box of a question that takes one, else in Your thinking. */
export function carriedForm(carry: KeptWords, textMode: boolean): QuestionFormDraft | undefined {
	const words = carry.form ? [carry.form.text, carry.form.other, carry.form.thinking] : [carry.text];
	const text = words.map((w) => w?.trim() ?? "").filter(Boolean).join("\n\n");
	if (!text) return undefined;
	return {
		selection: { selected: new Set(), otherSelected: false },
		thinking: textMode ? "" : text,
		other: "",
		text: textMode ? text : "",
		confidence: carry.form?.confidence ?? "neutral",
	};
}

/** Forgets a lesson's question and problem boxes other than the ones still
 *  open, so answered questions leave nothing behind. */
export function forgetClosedBoxes(chatId: string, open: readonly string[]): void {
	const store = storage();
	if (!store) return;
	const win = thisWindow().id;
	const keep = new Set(open.map((scope) => keyFor(win, scope)));
	const boxes = [keyFor(win, `${chatId}:q:`), keyFor(win, `${chatId}:p:`)];
	try {
		const stale: string[] = [];
		for (let i = 0; i < store.length; i++) {
			const key = store.key(i);
			if (key && boxes.some((box) => key.startsWith(box)) && !keep.has(key)) stale.push(key);
		}
		for (const key of stale) store.removeItem(key);
	} catch {
		// Nothing to tidy when storage is refused.
	}
	void forgetClosedPhotos(`${chatId}:`, open);
}

/* ── Photos (IndexedDB) ─────────────────────────────────────────────── */

const DB_NAME = "lh-kept";
const STORE = "photos";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve) => {
		try {
			if (typeof indexedDB === "undefined") return resolve(null);
			const request = indexedDB.open(DB_NAME, 1);
			request.onupgradeneeded = () => request.result.createObjectStore(STORE);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
	return dbPromise;
}

function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
	return db().then((database) => new Promise<T | undefined>((resolve) => {
		if (!database) return resolve(undefined);
		try {
			const request = act(database.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(undefined);
		} catch {
			resolve(undefined);
		}
	}));
}

/** A box's photos key: its window and scope, as its words' key. */
function photoKey(windowId: string, scope: string): string {
	return `${windowId}${SEP}${scope}`;
}

/** Keeps a box's waiting photos; none forgets them. */
export async function keepPhotos(scope: string, photos: readonly Photo[]): Promise<void> {
	const key = photoKey(thisWindow().id, scope);
	await run<unknown>("readwrite", (store) => (photos.length ? store.put([...photos], key) : store.delete(key)) as IDBRequest<unknown>);
}

/** A box's kept photos in this window; else a closed window's photos for
 *  the same box, taken over by this window. */
export async function keptPhotos(scope: string): Promise<Photo[]> {
	const win = thisWindow();
	const own = await run<unknown>("readonly", (store) => store.get(photoKey(win.id, scope)));
	if (Array.isArray(own) && own.length) return own as Photo[];
	const keys = await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
	for (const key of keys ?? []) {
		if (typeof key !== "string") continue;
		const parsed = parseKey(PREFIX + key);
		if (!parsed || parsed.scope !== scope || !orphaned(parsed.window, win)) continue;
		const value = await run<unknown>("readonly", (store) => store.get(key));
		await run<unknown>("readwrite", (store) => store.delete(key) as IDBRequest<unknown>);
		if (!Array.isArray(value) || !value.length) continue;
		await keepPhotos(scope, value as Photo[]);
		return value as Photo[];
	}
	return [];
}

/** Takes a box's kept photos once: read and forgotten. */
export async function takeKeptPhotos(scope: string): Promise<Photo[]> {
	const photos = await keptPhotos(scope);
	if (photos.length) await keepPhotos(scope, []);
	return photos;
}

async function forgetClosedPhotos(chatPrefix: string, open: readonly string[]): Promise<void> {
	const keys = await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
	const win = thisWindow().id;
	const keep = new Set(open.map((scope) => photoKey(win, scope)));
	const boxes = [photoKey(win, `${chatPrefix}q:`), photoKey(win, `${chatPrefix}p:`)];
	for (const key of keys ?? []) {
		if (typeof key !== "string" || keep.has(key) || !boxes.some((box) => key.startsWith(box))) continue;
		await run<unknown>("readwrite", (store) => store.delete(key) as IDBRequest<unknown>);
	}
}
