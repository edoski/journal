/**
 * His typed work and waiting photos, kept on this Mac per box (round 3,
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
	try {
		if (!words || !holdsWork(words)) store.removeItem(PREFIX + scope);
		else store.setItem(PREFIX + scope, JSON.stringify(words));
	} catch {
		// Storage full or refused: the box still works, it just won't survive a reload.
	}
}

/** A box's kept words, if any. */
export function keptWords(scope: string): KeptWords | undefined {
	try {
		const raw = storage()?.getItem(PREFIX + scope);
		if (!raw) return undefined;
		const value = JSON.parse(raw) as KeptWords;
		return value && typeof value === "object" ? value : undefined;
	} catch {
		return undefined;
	}
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
	const keep = new Set(open.map((scope) => PREFIX + scope));
	const boxes = [`${PREFIX}${chatId}:q:`, `${PREFIX}${chatId}:p:`];
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

/** Keeps a box's waiting photos; none forgets them. */
export async function keepPhotos(scope: string, photos: readonly Photo[]): Promise<void> {
	await run<unknown>("readwrite", (store) => (photos.length ? store.put([...photos], scope) : store.delete(scope)) as IDBRequest<unknown>);
}

/** A box's kept photos. */
export async function keptPhotos(scope: string): Promise<Photo[]> {
	const value = await run<unknown>("readonly", (store) => store.get(scope));
	return Array.isArray(value) ? (value as Photo[]) : [];
}

/** Takes a box's kept photos once: read and forgotten. */
export async function takeKeptPhotos(scope: string): Promise<Photo[]> {
	const photos = await keptPhotos(scope);
	if (photos.length) await keepPhotos(scope, []);
	return photos;
}

async function forgetClosedPhotos(chatPrefix: string, open: readonly string[]): Promise<void> {
	const keys = await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
	const keep = new Set(open);
	for (const key of keys ?? []) {
		if (typeof key !== "string" || !key.startsWith(chatPrefix) || keep.has(key)) continue;
		if (key.startsWith(`${chatPrefix}q:`) || key.startsWith(`${chatPrefix}p:`)) await keepPhotos(key, []);
	}
}
