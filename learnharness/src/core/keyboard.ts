/**
 * Keyboard shortcuts (shortcut wave, 2026-09-17) — the single source of truth
 * for every app action that has a binding. This module is PURE (no React, no
 * window access at module scope beyond the guarded helpers) so it can render
 * a cheat sheet, match events, and — at the settings milestone — drive a
 * user-editable key map without touching any component.
 *
 * Design (owner-approved plan):
 * - Tab is DEAD: browser tab-focus navigation is abandoned entirely. Tab
 *   does nothing (Shift+Tab included).
 * - Esc is a layered dismiss: topmost popover (each popover stopPropagation's
 *   its own Esc) → abort in-flight turn.
 * - The key map persists overrides in localStorage (`lh:keymap`, overrides
 *   only) merged over DEFAULT_BINDINGS — the settings wave adds the editor.
 *
 * Binding strings are normalized, cross-platform:
 *   "mod+k"    — mod = ⌘ on macOS, Ctrl elsewhere (both are accepted live)
 *   "shift+tab", "alt+arrowdown", "mod+shift+f", "?", "f2", "escape"
 * Order is fixed: mod, alt, shift, then the key.
 */

export type KeyAction =
	| "open-model-picker"
	| "toggle-sidebar"
	| "sessions-search"
	| "jump-graph"
	| "new-session"
	| "rename-session"
	| "cheat-sheet"
	| "find"
	| "question-focus"
	| "question-next-row"
	| "question-prev-row"
	| "question-pick-row"
	| "question-submit"
	| "open-settings"
	| "toggle-user-thinking"
	| "page-move"
	| "page-open"
	| "calendar-today"
	| "calendar-week"
	| "calendar-month"
	| "calendar-previous"
	| "calendar-next"
	| "confidence-up"
	| "confidence-down"
	| "pick-course"
	| "practice-hint"
	| "practice-show"
	| "practice-explain"
	| "jump-latest"
	| "done-tonight"
	| "dispute-mark"
	| "dialog-confirm"
	| "try-again"
	| "attach-photo"
	| "question-pick-digit"
	| "question-ask-instead";

/** Where Settings and the cheat sheet group an action (display only —
 *  dispatch is global; a seam that isn't mounted simply no-ops). */
export type KeyScope = "global" | "lesson" | "question";

/** The group headings, in the app's words. */
export const KEY_SCOPES: readonly { scope: KeyScope; label: string }[] = [
	{ scope: "global", label: "Anywhere" },
	{ scope: "lesson", label: "In a lesson" },
	{ scope: "question", label: "Answering a question" },
];

/** A finer heading the Proposed cheat sheet files an action under, inside
 *  its scope's place. Settings lists by scope alone. */
export type KeyGroup = "pages" | "calendar";

export interface KeyActionDef {
	id: KeyAction;
	/** What the shortcut does, in the app's words. */
	label: string;
	scope: KeyScope;
	binding: string;
	/** Display-only (cheat sheet) — contextual keys a SURFACE owns (the
	 *  question dock's row machine); never dispatched from the registry,
	 *  so they can't leak to pages where the surface isn't mounted. */
	displayOnly?: boolean;
	/** The Proposed cheat sheet's finer heading inside the scope. */
	group?: KeyGroup;
	/** The lessons whose keys these are (the Lesson switch's values); the
	 *  cheat sheet lists the action only while one of them is drawn. */
	lessons?: readonly string[];
}

export const KEYBOARD_ACTIONS: readonly KeyActionDef[] = [
	{ id: "new-session", label: "New lesson", scope: "global", binding: "mod+n" },
	{ id: "jump-graph", label: "Go home", scope: "global", binding: "mod+g" },
	{ id: "sessions-search", label: "Search topics, lessons and courses", scope: "global", binding: "mod+shift+f" },
	{ id: "toggle-sidebar", label: "Show or hide the sidebar", scope: "global", binding: "mod+b" },
	{ id: "open-settings", label: "Settings", scope: "global", binding: "mod+," },
	{ id: "cheat-sheet", label: "All shortcuts", scope: "global", binding: "?" },
	// (The Alt+↑/↓/↵ session cycle was RETIRED, owner 2026-10-10: barely
	// used, felt laggy. Session navigation lives IN the search now — ↑/↓
	// walk the filtered list, Enter opens (first match when nothing
	// walked) — see sidebar.tsx's search input.)
	// Mod+F is surface-scoped: the lesson's text Find (and the Current
	// design's graph node search) share one action; only the mounted
	// surface listens.
	{ id: "find", label: "Find in this lesson", scope: "lesson", binding: "mod+f" },
	{ id: "rename-session", label: "Rename this lesson", scope: "lesson", binding: "f2" },
	{ id: "toggle-user-thinking", label: "Show or hide your thinking", scope: "lesson", binding: "mod+t" },
	{ id: "open-model-picker", label: "Lesson details", scope: "lesson", binding: "mod+k" },
	// The practice problem's requests: the mounted problem box answers them.
	{ id: "practice-hint", label: "Problem or check · hint", scope: "lesson", binding: "mod+shift+h" },
	{ id: "practice-show", label: "Problem · show me", scope: "lesson", binding: "mod+shift+s" },
	{ id: "practice-explain", label: "Problem · explain instead", scope: "lesson", binding: "mod+shift+e" },
	{ id: "jump-latest", label: "Go to the newest reply", scope: "lesson", binding: "mod+arrowdown" },
	{ id: "done-tonight", label: "Done for tonight", scope: "lesson", binding: "mod+shift+d" },
	// The newest answer's mark: the dialog opens on it (answer-mark.tsx).
	{ id: "dispute-mark", label: "Dispute the newest answer's mark", scope: "lesson", binding: "mod+shift+m" },
	// The answer field on show (composer, check or problem) opens its picker.
	{ id: "attach-photo", label: "Attach a photo of your working", scope: "lesson", binding: "mod+shift+p" },
	{ id: "try-again", label: "Try again after a reply that never came", scope: "lesson", binding: "enter", displayOnly: true },
	{ id: "dialog-confirm", label: "Confirm a stop or skip (← → pick a button)", scope: "lesson", binding: "mod+enter", displayOnly: true },
	// The question dock's row machine (wave B) — displayOnly: the dock owns
	// the keys while a question is open; the registry never dispatches
	// them, so bare arrows stay free everywhere else.
	{ id: "question-focus", label: "Move between the choices and your thinking", scope: "question", binding: "tab", displayOnly: true, lessons: ["current", "slot"] },
	{ id: "question-next-row", label: "Next choice", scope: "question", binding: "arrowdown", displayOnly: true, lessons: ["current", "slot"] },
	{ id: "question-prev-row", label: "Previous choice", scope: "question", binding: "arrowup", displayOnly: true, lessons: ["current", "slot"] },
	{ id: "question-pick-row", label: "Choose", scope: "question", binding: "space", displayOnly: true, lessons: ["current", "slot"] },
	// The Prose lesson's question (components/lesson/prose/prose.md): its
	// choices are rows in the tutor's message, and the composer answers.
	{ id: "question-pick-digit", label: "Pick a choice by its number", scope: "question", binding: "1–9", displayOnly: true, lessons: ["prose"] },
	{ id: "question-ask-instead", label: "Ask the tutor instead of answering, and back", scope: "question", binding: "escape", displayOnly: true, lessons: ["prose"] },
	{ id: "question-submit", label: "Send your answer", scope: "question", binding: "enter", displayOnly: true },
	// Keyboard reach (13 Nov 2026): the page's own arrows (spatial-arrows.ts)
	// walk its rows and links, and Enter opens them natively.
	{ id: "page-move", label: "Move between rows and links", scope: "global", binding: "arrows", displayOnly: true, group: "pages" },
	{ id: "page-open", label: "Open the row or link", scope: "global", binding: "enter", displayOnly: true, group: "pages" },
	// The calendar's letters, Google Calendar's; only the mounted calendar listens.
	{ id: "calendar-today", label: "Go to today", scope: "global", binding: "t", group: "calendar" },
	{ id: "calendar-week", label: "Show the week", scope: "global", binding: "w", group: "calendar" },
	{ id: "calendar-month", label: "Show the month", scope: "global", binding: "m", group: "calendar" },
	{ id: "calendar-previous", label: "Previous week or month", scope: "global", binding: "p", group: "calendar" },
	{ id: "calendar-next", label: "Next week or month", scope: "global", binding: "n", group: "calendar" },
	// The confidence toggle owns these while it is mounted (confidence-choice.tsx).
	{ id: "confidence-up", label: "More sure", scope: "lesson", binding: "alt+arrowup", displayOnly: true },
	{ id: "confidence-down", label: "Less sure", scope: "lesson", binding: "alt+arrowdown", displayOnly: true },
	{ id: "pick-course", label: "Pick a course", scope: "lesson", binding: "mod+o" },
];

const STORAGE_KEY = "lh:keymap";

/** localStorage overrides ({actionId: binding}) — read once per module
 *  instance; the settings editor will write this key. Guarded: SSR and a
 *  corrupt/absent store both fall back to defaults. */
export function loadOverrides(): Partial<Record<KeyAction, string>> {
	if (typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Partial<Record<KeyAction, string>>;
		if (parsed && typeof parsed === "object") return parsed;
	} catch {
		/* corrupt store = defaults */
	}
	return {};
}

/** Write the full overrides map ({actionId: binding}) — the settings
 *  editor's rebind/reset persistence. Guarded: SSR no-ops. An empty
 *  map clears the store entirely (all-defaults). */
export function saveOverrides(overrides: Partial<Record<KeyAction, string>>): void {
	if (typeof window === "undefined") return;
	try {
		if (Object.keys(overrides).length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
		else window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* storage unavailable = overrides don't persist, defaults keep working */
	}
}

/** The live key map: defaults with user overrides applied. */
export function effectiveKeymap(): Map<string, KeyAction> {
	const overrides = loadOverrides();
	const map = new Map<string, KeyAction>();
	for (const def of KEYBOARD_ACTIONS) {
		if (def.displayOnly) continue; // surface-owned, never dispatched
		const binding = overrides[def.id] ?? def.binding;
		if (typeof binding === "string" && binding) map.set(binding, def.id);
	}
	return map;
}

/** Which action a normalized binding fires, if any (override-aware). */
export function actionForBinding(binding: string): KeyAction | undefined {
	return effectiveKeymap().get(binding);
}

/** The effective (override-aware) binding for one action — display use. */
export function bindingForAction(id: KeyAction): string {
	const overrides = loadOverrides();
	const def = KEYBOARD_ACTIONS.find((a) => a.id === id);
	if (!def) return "";
	return overrides[id] ?? def.binding;
}

/**
 * Normalize a KeyboardEvent to a canonical binding string. Rules:
 * - mod matches BOTH meta (⌘) and ctrl — Ctrl+K works on a Mac keyboard too.
 * - a printable key ("?") bakes its shift in: "shift+/?" collapses to "?".
 */
export function eventBinding(e: KeyboardEvent): string {
	const mod = e.metaKey || e.ctrlKey;
	// A bare printable key bakes its shift into the character ("?" not
	// "shift+/"), so it returns alone. With a real modifier riding along,
	// shift is explicit (⌘⇧F = "mod+shift+f"); non-printable keys (Tab,
	// arrows) always keep their shift (Shift+Tab = "shift+tab").
	if (e.key.length === 1 && !mod && !e.altKey) return e.key.toLowerCase();
	const mods: string[] = [];
	if (mod) mods.push("mod");
	if (e.altKey) mods.push("alt");
	if (e.shiftKey) mods.push("shift");
	return [...mods, e.key.toLowerCase()].join("+");
}

/** The window event name a registry action dispatches/answers on —
 *  the ONE spelling shared by the dispatcher (keyboard-shortcuts) and
 *  every surface listener. Born from the ⌘B bug (owner interlude
 *  2026-09-25): the sidebar listened on the pre-convention name
 *  "lh:toggle-sidebar" while the dispatcher sent "lh:kbd-toggle-sidebar",
 *  so ⌘B silently did nothing. With both sides composing through this
 *  helper the mismatch is structurally impossible.
 */
export function kbdEventForAction(action: KeyAction): string {
	return `lh:kbd-${action}`;
}

/** True when the event lands in a typing surface (input, textarea, or a
 *  contentEditable). In one, only mod/alt combos (and Tab, which types
 *  nothing) may fire — bare keys belong to the field (typing, caret). */
export function isTypingSurface(e: KeyboardEvent): boolean {
	const target = e.target as HTMLElement | null;
	if (!target) return false;
	const tag = target.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	return target.isContentEditable;
}

/** Whether a field keeps this key from the shortcut registry: inside a
 *  typing surface only keys that never type a character fire, which are
 *  ⌘, Ctrl and ⌥ combos and the function keys. F2 (rename) was dead in a
 *  lesson once focus always sat in the answer box, and the title he typed
 *  went to the tutor (round 3, 14 Nov 2026). */
export function fieldKeepsKey(e: KeyboardEvent): boolean {
	if (!isTypingSurface(e)) return false;
	if (e.metaKey || e.ctrlKey || e.altKey) return false;
	return !/^F\d{1,2}$/.test(e.key);
}

/** macOS styling for binding display ("⌘D", "⇧⇥", "⌥↑"). */
export const IS_MAC =
	typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);

const MOD_GLYPH = IS_MAC ? "⌘" : "Ctrl+";
const ALT_GLYPH = IS_MAC ? "⌥" : "Alt+";
const SHIFT_GLYPH = IS_MAC ? "⇧" : "Shift+";

const KEY_GLYPH: Record<string, string> = {
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
	enter: "↵",
	tab: "⇥",
	escape: "Esc",
	space: "Space",
	// Display-only: the four arrows as one cheat-sheet row (page-move).
	arrows: "↑ ↓ ← →",
};

/** Format a binding for display: "mod+shift+f" → "⌘⇧F". */
export function formatBinding(binding: string): string {
	const parts = binding.split("+");
	const key = parts.pop()!; // last part is always the key
	const glyphs: string[] = [];
	for (const part of parts) {
		if (part === "mod") glyphs.push(MOD_GLYPH);
		else if (part === "alt") glyphs.push(ALT_GLYPH);
		else if (part === "shift") glyphs.push(SHIFT_GLYPH);
	}
	const keyGlyph = KEY_GLYPH[key] ?? key.toUpperCase();
	return glyphs.join("") + keyGlyph;
}
