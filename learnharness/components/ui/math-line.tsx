"use client";

import { useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { MathText, mathPieces } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";

/**
 * A label cut where it may end (spec: math-line.md): at each run of
 * spaces, never inside a formula, so a formula and the word it is glued
 * to ("$\sigma$-algebras") stay one piece. Each piece keeps its own source,
 * a formula back in `$`…`$`, and the spaces after it. Pure.
 */
export function mathUnits(text: string): string[] {
	const units: string[] = [];
	let unit = "";
	let spaced = false;
	const push = () => {
		if (unit) units.push(unit);
		unit = "";
		spaced = false;
	};
	for (const piece of mathPieces(text)) {
		if (piece.kind === "math") {
			if (spaced) push();
			unit += `$${piece.tex}$`;
			continue;
		}
		for (const part of piece.text.split(/(\s+)/)) {
			if (!part) continue;
			if (/^\s+$/.test(part)) {
				unit += part;
				spaced = true;
			} else {
				if (spaced) push();
				unit += part;
			}
		}
	}
	push();
	return units;
}

/** The first `count` pieces of a label and an ellipsis, or the whole label
 *  when every piece is kept. Pure. */
export function mathPrefix(units: readonly string[], count: number): string {
	return count >= units.length ? units.join("") : `${units.slice(0, count).join("").trimEnd()}…`;
}

/**
 * A one-line label that may hold TeX (`MathText`) and, when it is too wide
 * for its box, ends on the last whole word or whole formula that fits,
 * then "…", instead of an ellipsis cutting a formula in half. It measures
 * before the browser paints, again when its box changes width and once the
 * fonts have loaded. A single piece wider than the box still ends in the
 * box's own ellipsis.
 */
export function MathLine({ children, className, ...props }: { children: string } & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">) {
	const units = useMemo(() => mathUnits(children), [children]);
	const [shown, setShown] = useState(units.length);
	const whole = useRef(units.length);
	whole.current = units.length;
	// A new label starts from the whole of it again.
	const [was, setWas] = useState(units);
	if (was !== units) {
		setWas(units);
		setShown(units.length);
	}
	const box = useRef<HTMLSpanElement>(null);
	// Renders again even when the whole label is already shown, so a refit measures anew.
	const [, measureAgain] = useReducer((n: number) => n + 1, 0);

	// Drop a piece at a time until the line fits.
	useLayoutEffect(() => {
		const el = box.current;
		if (el && shown > 1 && el.scrollWidth > el.clientWidth + 0.5) setShown(shown - 1);
	});
	// A change of the box's width, or the fonts loading, fits the line again from the whole label.
	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		let width = el.clientWidth;
		const refit = () => {
			setShown(whole.current);
			measureAgain();
		};
		const observer = new ResizeObserver(() => {
			if (el.clientWidth === width) return;
			width = el.clientWidth;
			refit();
		});
		observer.observe(el);
		let live = true;
		void document.fonts?.ready.then(() => live && refit());
		return () => {
			live = false;
			observer.disconnect();
		};
	}, []);

	return (
		<span ref={box} className={cn("block truncate", className)} {...props}>
			<MathText>{mathPrefix(units, shown)}</MathText>
		</span>
	);
}
