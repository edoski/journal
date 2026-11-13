"use client";

import { useEffect, type RefObject } from "react";
import { entryOf, listStops, reveal } from "@/components/course-page/list/list-keys";

/** With nothing focused, Down or Home steps into the list's first stop and
 *  Up or End into its last, so the page is walkable from the keyboard with
 *  no Tab (dead app-wide, owner 17 Sep 2026). Only while focus rests on the
 *  page and no dialog is open: a field, the sidebar and every layer keep
 *  their own keys. */
export function useListEntry(root: RefObject<HTMLElement | null>): void {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const entry = entryOf(e);
			const el = root.current;
			if (!entry || !el) return;
			const active = document.activeElement;
			if (active && active !== document.body) return;
			if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
			const stops = listStops(el);
			const stop = entry === "first" ? stops[0] : stops[stops.length - 1];
			if (!stop) return;
			e.preventDefault();
			reveal(stop);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [root]);
}
