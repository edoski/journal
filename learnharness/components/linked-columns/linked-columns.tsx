"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { routeTie, type Box, type TieGeometry } from "@/components/linked-columns/tie-route";

/** The list up to 24rem on the left, the map filling the rest, 24px apart,
 *  both the full height. */
export const LINKED_GRID = "grid min-h-0 flex-1 grid-cols-[minmax(0,24rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-6";

/** Every node on a map React Flow draws, and the tags above them. */
const OBSTACLES = ".react-flow__node, [data-slot=course-map-current-tag], [data-slot=topic-step-tag]";

/** What the columns tie: the selected row in the list and its node on the
 *  map, each a selector inside its column. `key` names the pair, so a new
 *  pair draws its line in afresh. */
export interface Tie {
	key: string;
	row: string;
	node: string;
}

/** Where the tie's line starts and the gutter it crosses, in the map
 *  column's own pixels (its top-left corner is 0, 0). */
export type TieAnchor = Pick<TieGeometry, "from" | "gutter">;

const TieContext = createContext<(() => TieAnchor | null) | null>(null);

/** For a map inside the linked columns: measures where the tied row's line
 *  starts, so the map can move its node beside it (`clearShift`). Null
 *  outside the columns or with the Link switch off; the function answers
 *  null while nothing is tied or the row is out of view. */
export function useTieAnchor(): (() => TieAnchor | null) | null {
	return useContext(TieContext);
}

const boxOf = (rect: DOMRect, origin: DOMRect): Box => ({ left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top });

/**
 * Two columns, a list beside a map, with nothing around them (spec:
 * linked-columns.md): the course page's topics beside its course map, the
 * topic page's history beside a lesson's step map. Given a `tie` and
 * `connected`, a line in the map's edge ink runs from the selected row to
 * its node: one smooth curve across the gutter (`routeTie`), drawn in once
 * when the pair changes (none under reduced motion), and following every
 * pan, zoom, scroll and resize in the same frame. Pointing at or focusing
 * either end lights the line and sets `data-lit`, which the row and the
 * node answer (`in-data-[lit]:`). The line leaves while either end is out
 * of its column's view.
 */
export function LinkedColumns({
	list,
	map,
	tie,
	connected,
	className,
	...rest
}: {
	list: ReactNode;
	map: ReactNode;
	tie: Tie | null;
	/** The Link switch: whether the line is drawn. */
	connected: boolean;
} & Omit<ComponentProps<"div">, "children">) {
	const root = useRef<HTMLDivElement>(null);
	const line = useRef<SVGPathElement>(null);
	const listColumn = useRef<HTMLDivElement>(null);
	const mapColumn = useRef<HTMLDivElement>(null);
	const [lit, setLit] = useState(false);
	const drawn = connected && tie !== null;

	/** Measures both ends and redraws the line at once, outside React, so it never trails the map or the list. */
	const measure = useCallback(() => {
		const path = line.current;
		const box = root.current;
		const left = listColumn.current;
		const right = mapColumn.current;
		if (!path || !box || !left || !right || !tie) return;
		const row = left.querySelector(tie.row);
		const node = right.querySelector(tie.node);
		const hide = () => path.setAttribute("visibility", "hidden");
		if (!row || !node) return hide();
		const origin = box.getBoundingClientRect();
		const listView = left.getBoundingClientRect();
		const mapView = right.getBoundingClientRect();
		const r = row.getBoundingClientRect();
		const n = node.getBoundingClientRect();
		const y = r.top + r.height / 2;
		if (y < listView.top || y > listView.bottom || n.bottom < mapView.top || n.top > mapView.bottom || n.right < mapView.left || n.left > mapView.right) return hide();
		const obstacles: Box[] = [];
		for (const el of right.querySelectorAll(OBSTACLES)) {
			if (el.contains(node)) continue;
			const o = el.getBoundingClientRect();
			// Only what shows: a node scrolled or panned out of the column is clipped away.
			if (o.width === 0 || o.right < mapView.left || o.left > mapView.right || o.bottom < mapView.top || o.top > mapView.bottom) continue;
			obstacles.push(boxOf(o, origin));
		}
		const route = routeTie({
			from: { x: r.right - origin.left, y: y - origin.top },
			to: boxOf(n, origin),
			obstacles,
			gutter: { left: listView.right - origin.left, right: mapView.left - origin.left },
		});
		if (!route) return hide();
		path.setAttribute("d", route.d);
		path.setAttribute("data-side", route.side);
		path.setAttribute("data-clear", String(route.clear));
		path.setAttribute("data-around", String(route.around));
		path.removeAttribute("visibility");
	}, [tie]);

	useLayoutEffect(() => {
		const box = root.current;
		if (!drawn || !box) return;
		measure();
		let frame = 0;
		// A burst of changes in one frame redraws once more after it settles.
		const now = () => {
			measure();
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		};
		const resize = new ResizeObserver(now);
		resize.observe(box);
		// React Flow pans and zooms by restyling its viewport; nodes arrive, and a row is selected by an attribute.
		const changes = new MutationObserver(now);
		changes.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "data-shown", "aria-current", "data-highlighted"] });
		box.addEventListener("scroll", now, { capture: true, passive: true });
		return () => {
			cancelAnimationFrame(frame);
			resize.disconnect();
			changes.disconnect();
			box.removeEventListener("scroll", now, { capture: true });
		};
	}, [drawn, measure]);

	const anchor = useCallback((): TieAnchor | null => {
		const left = listColumn.current;
		const right = mapColumn.current;
		const row = tie && left?.querySelector(tie.row);
		if (!row || !left || !right) return null;
		const listView = left.getBoundingClientRect();
		const origin = right.getBoundingClientRect();
		const r = row.getBoundingClientRect();
		const y = r.top + r.height / 2;
		if (y < listView.top || y > listView.bottom) return null;
		return { from: { x: r.right - origin.left, y: y - origin.top }, gutter: { left: listView.right - origin.left, right: 0 } };
	}, [tie]);
	const tieAnchor = useMemo(() => (connected ? anchor : null), [connected, anchor]);

	/** Whether the pointer or focus is on either end of the tie. */
	const point = (target: EventTarget | null) => {
		if (!tie || !(target instanceof Element)) return setLit(false);
		const onRow = listColumn.current?.querySelector(tie.row)?.contains(target) ?? false;
		const onNode = mapColumn.current?.querySelector(tie.node)?.contains(target) ?? false;
		setLit(onRow || onNode);
	};

	return (
		<div
			ref={root}
			data-lit={(drawn && lit) || undefined}
			onPointerOver={(event) => point(event.target)}
			onPointerLeave={() => setLit(false)}
			onFocus={(event) => point(event.target)}
			onBlur={() => setLit(false)}
			className={cn(LINKED_GRID, "relative", className)}
			{...rest}
		>
			{/* Under both columns, so the map's nodes paint over the line wherever no clear route exists. */}
			{drawn && (
				<svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
					<path
						key={tie.key}
						ref={line}
						data-slot="linked-tie"
						visibility="hidden"
						fill="none"
						strokeWidth={1}
						pathLength={1}
						strokeDasharray="1 1"
						className={cn(
							"motion-safe:animate-[lh-tie-draw_180ms_cubic-bezier(0.19,1,0.22,1)] transition-[stroke] duration-[120ms] motion-reduce:transition-none",
							lit ? "stroke-white/70" : "stroke-white/33",
						)}
					/>
				</svg>
			)}
			<div ref={listColumn} className="flex min-h-0 min-w-0 flex-col">
				{list}
			</div>
			<div ref={mapColumn} className="relative flex min-h-0 min-w-0 flex-col">
				<TieContext.Provider value={tieAnchor}>{map}</TieContext.Provider>
			</div>
		</div>
	);
}
