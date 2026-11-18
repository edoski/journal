"use client";

import { useEffect } from "react";
import { isTypingSurface } from "@/src/core";
import { overlayOpen } from "@/components/spatial-arrows";

/** The page's composer field, when one is drawn and can take words. */
function composerField(): HTMLTextAreaElement | null {
	const fields = document.querySelectorAll<HTMLTextAreaElement>('[data-slot="composer"] textarea');
	return [...fields].find((field) => !field.disabled && field.offsetParent !== null) ?? null;
}

/** Whether this key types a character into a field: one printable
 *  character with no ⌘, Ctrl or ⌥ (Shift only makes a capital). Space is
 *  left to the button it would press, "?" to the shortcut list. */
export function typesCharacter(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "isComposing">): boolean {
	if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return false;
	return e.key.length === 1 && e.key !== " " && e.key !== "?";
}

/**
 * Typing anywhere on a page with a composer goes into the composer (Edo,
 * 17 Nov 2026: "If I start typing and there is a chat composer on the page,
 * it starts automatically"): with no field focused and no dialog open, a
 * key that types a character focuses the composer, and the character lands
 * there. The page's own single-letter keys yield to it, so they never fire
 * on a page that has a composer; a digit still reaches a posed question,
 * which picks its choice with it.
 */
export function useTypeToCompose(): void {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || !typesCharacter(e) || isTypingSurface(e) || overlayOpen()) return;
			const field = composerField();
			if (!field) return;
			if (!/^[0-9]$/.test(e.key)) e.stopImmediatePropagation();
			field.focus();
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, []);
}
