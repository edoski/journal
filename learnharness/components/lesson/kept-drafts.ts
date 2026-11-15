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
 * `carry:<course workspace>` (his words for one question, waiting for that
 * question to be asked again after Hint, a side question or Done for today).
 */

import { sameQuestionKey, type Confidence, type Photo, type QuestionFormDraft } from "@/src/core";

const PREFIX = "lh.kept.";

/** The New lesson box's scope. */
export const NEW_LESSON_BOX = "new";

/** Pieces of his writing as one text, each as he typed it, trailing space
 *  too (round 9: "v = " came back as "v ="): only the joint between two
 *  pieces is tidied, and empty pieces drop. Pure. */
export function joinAsTyped(pieces: readonly (string | null | undefined)[]): string {
	const parts = pieces.filter((w): w is string => !!w?.trim());
	return parts.map((w, i) => (i < parts.length - 1 ? w.trimEnd() : w)).map((w, i) => (i > 0 ? w.trimStart() : w)).join("\n\n");
}

/** Leaves his words for a new lesson, after what the New lesson box holds
 *  (a deleted course's lesson sends what he wrote there, round 7). The
 *  same message twice (sent and refused, and still in the box) is kept
 *  once. Whether anything was kept. */
export function keepForNewLesson(...words: readonly (string | null | undefined)[]): boolean {
	const distinct = words.filter((w, i) => w?.trim() && words.findIndex((o) => o?.trim() === w.trim()) === i);
	if (distinct.length === 0) return false;
	keepWords(NEW_LESSON_BOX, { text: joinAsTyped([keptWords(NEW_LESSON_BOX)?.text, ...distinct]) });
	return true;
}

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
	/** How sure he was, beside a problem's words (a form keeps its own). */
	confidence?: Confidence;
	form?: KeptForm;
	/** A carry's question, its words as `sameQuestionKey` reads them: only
	 *  that question asked again takes the carry. */
	question?: string;
	/** When the words were kept, so a window that wrote after another
	 *  looked at the open windows is known to be open. */
	at?: number;
	/** A carry's question call: the next question after that call, when it
	 *  was left open by a hint or a side question, asks it again in
	 *  whatever words (round 7: a re-ask that dropped "Say why." lost his
	 *  words). */
	from?: string;
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
 * none in, once; words of a window still open are never taken. A window
 * that wrote after this one looked at the locks is open, whatever the
 * locks said then (round 7: a window reloading while another opened looked
 * closed, and lost its carried words to it); the look is taken again
 * whenever this window comes to the front. */

const WINDOW_KEY = "lh.window";
const LOCK_PREFIX = "lh.window:";
const SEP = "|";

interface KeptWindow {
	id: string;
	/** Ids of windows known to be open; null until the locks answer, when
	 *  nothing is taken from another window. */
	live: Set<string> | null;
	/** When `live` was read: words written after it are an open window's. */
	seenAt: number;
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
	const win: KeptWindow = { id, live: null, seenAt: 0 };
	current = win;
	const locks = (globalThis.navigator as Navigator | undefined)?.locks;
	if (locks) {
		// Held until the window closes: the promise never settles.
		void locks.request(LOCK_PREFIX + id, () => new Promise<void>(() => {})).catch(() => {});
		const look = () => {
			const at = Date.now();
			void locks.query().then((state) => {
				const live = new Set<string>([id]);
				for (const lock of [...(state.held ?? []), ...(state.pending ?? [])]) {
					if (lock.name?.startsWith(LOCK_PREFIX)) live.add(lock.name.slice(LOCK_PREFIX.length));
				}
				if (current === win) Object.assign(win, { live, seenAt: at });
			}).catch(() => {});
		};
		look();
		globalThis.addEventListener?.("focus", look);
	}
	return win;
}

/** Tests name the window and the open ones; the app learns both itself. */
export function setKeptWindow(id: string, others: { live: readonly string[]; seenAt?: number }): void {
	current = { id, live: new Set([id, ...others.live]), seenAt: others.seenAt ?? Date.now() };
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

/** Whether a box's words were left by a window that has closed: not open
 *  when this window looked, and written before it looked. */
function orphaned(window: string | null, win: KeptWindow, at: number | undefined): boolean {
	return window !== win.id && win.live !== null && (window === null || !win.live.has(window)) && (at === undefined || at <= win.seenAt);
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
		else store.setItem(key, JSON.stringify({ ...words, at: Date.now() }));
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
			if (!key || !parsed || parsed.scope !== scope) continue;
			const words = parseWords(store.getItem(key));
			if (!orphaned(parsed.window, win, words?.at)) continue;
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

/* ── The carry (round 6, 14 Nov 2026) ───────────────────────────────────
 * His words for one question wait in the course's carry until the tutor
 * asks that question again, word for word (the tutor asks a question he
 * left unanswered "as it was"), in this lesson or the next. Another
 * question never takes them: the Done-for-today draft once filled the next,
 * unrelated Yes/No question, where Enter would have sent it as its note.
 * The question asked right after one left open by a hint or a side
 * question is that question again, whatever its words (`from`).
 * A newer carry replaces an older one. */

/** The question a carry waits for: its words and its call. */
export interface CarryFor {
	question: string;
	from: string;
}

function keepCarry(carryScope: string, left: CarryFor, words: KeptWords | undefined): void {
	keepWords(carryScope, words && holdsWork(words) ? { ...words, question: sameQuestionKey(left.question), from: left.from } : null);
}

/** Leaves his words and photos for the question asked again. */
export function carryWords(carryScope: string, left: CarryFor, words: KeptWords | undefined, photos: readonly Photo[]): void {
	keepCarry(carryScope, left, words);
	void keepPhotos(carryScope, photos);
}

/** Leaves what an open question's box holds for that question asked again:
 *  its words at once, its photos read before the closed box forgets them. */
export function carryBox(box: string, carryScope: string, left: CarryFor): void {
	keepCarry(carryScope, left, keptWords(box));
	void keptPhotos(box).then((photos) => keepPhotos(carryScope, photos));
}

/** The carry, when it waits for this question: the same words, or the
 *  question asked right after the call it was left on (`reaskOf`). */
export function carriedFor(carryScope: string, question: string, reaskOf?: string | null): KeptWords | undefined {
	const carry = keptWords(carryScope);
	if (!carry) return undefined;
	return carry.question === sameQuestionKey(question) || (!!reaskOf && carry.from === reaskOf) ? carry : undefined;
}

/** Takes the carry for this question: its words now, its photos after. */
export function takeCarry(carryScope: string, question: string, reaskOf?: string | null): { words: KeptWords; photos: Promise<Photo[]> } | undefined {
	const words = carriedFor(carryScope, question, reaskOf);
	if (!words) return undefined;
	keepWords(carryScope, null);
	return { words, photos: takeKeptPhotos(carryScope) };
}

/** The carried work as the next question's draft: a typed answer goes in
 *  the answer box of a question that takes one, else in Your thinking. */
export function carriedForm(carry: KeptWords, textMode: boolean): QuestionFormDraft | undefined {
	const text = joinAsTyped(carry.form ? [carry.form.text, carry.form.other, carry.form.thinking] : [carry.text]);
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
		if (!parsed || parsed.scope !== scope || !orphaned(parsed.window, win, undefined)) continue;
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
