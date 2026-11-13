"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import type { CourseMap, TopicHandle } from "@/src/core";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { chainOf, isWalkKey, layoutTopicMap } from "@/components/course-map/topic-map/topic-map-layout";
import { useNodeSize } from "@/components/course-map/topic-map/node-size";
import { unitHref } from "@/components/unit-inbox/unit-href";
import { cn } from "@/lib/utils";
import { acrossColumns, columnMap, MAP_ROOM, mapPlan, pathLinks, scrollToShow, topicBoxes, type Frame, type MapPlan } from "./map-plan";
import { PathLink } from "./path-link";
import { TopicNote, type NoteFact } from "./topic-note";
import { useScrollEdges } from "./use-scroll-edges";

/** What the page asks of the map from outside it. */
export interface CourseMapPaneHandle {
	/** Focus the map's one tab stop (the current topic, else the first). */
	focus: () => void;
}

/** The page's side margin (the column's `px-8`): the pane runs into it,
 *  edge to edge, only when the course needs the room. */
const PAGE_SIDE = 32;

/** How long a lit fact stays lit before the area scrolls to its topics, so
 *  a pointer sweeping along the legend does not drag the map about. */
const REVEAL_DELAY_MS = 150;

function reducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The area's size, kept as it is resized. */
function useFrame(): [React.RefObject<HTMLDivElement | null>, Frame | null] {
	const ref = useRef<HTMLDivElement>(null);
	const [frame, setFrame] = useState<Frame | null>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const read = () => setFrame((was) => (was && was.width === el.clientWidth && was.height === el.clientHeight ? was : { width: el.clientWidth, height: el.clientHeight }));
		read();
		const observer = new ResizeObserver(read);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return [ref, frame];
}

/**
 * The course's topic map given the rest of the window (spec:
 * map-course.md), laid in by `mapPlan` so every title stays at 11px or
 * larger: the whole course when it fits, a long path wrapped into columns
 * joined by the need between them, else an area that scrolls with no bar,
 * fading only the edges with more past them. It opens on `startAt` (the
 * header's topic) and scrolls to the topics `reveal` names; `highlight`
 * lights a set of topics, as the legend asks, and `notes` puts a few words
 * under some of them. Across wrapped columns, pointing at a topic lights
 * its whole chain and the arrows walk on from one column to the next.
 */
export function CourseMapPane({
	map,
	highlight,
	reveal,
	notes,
	startAt,
	onTop,
	ref,
}: {
	map: CourseMap;
	/** Topics to light, the rest dimmed; null lights none. */
	highlight: ReadonlySet<TopicHandle> | null;
	/** Topics to bring into view, the most pressing first; null moves nothing. */
	reveal: ReadonlySet<TopicHandle> | null;
	/** A fact to show under some topics, while they are lit. */
	notes: ReadonlyMap<TopicHandle, NoteFact> | null;
	/** The topic the area opens on when it scrolls. */
	startAt: TopicHandle | null;
	/** Up from a topic with nothing above it. */
	onTop: () => void;
	ref?: React.Ref<CourseMapPaneHandle>;
}) {
	const [area, frame] = useFrame();
	const scroller = useRef<HTMLDivElement>(null);
	const [edges] = useScrollEdges(scroller);
	const node = useNodeSize();
	const layout = useMemo(() => layoutTopicMap(map.topics, map.edges, node), [map.topics, map.edges, node]);
	const plan = useMemo<MapPlan | null>(() => (frame ? mapPlan(layout, frame, PAGE_SIDE) : null), [layout, frame]);
	const columns = useMemo(() => plan?.columns ?? [], [plan]);
	const wrapped = columns.length > 1;
	// Each column's run of the map, made once per plan so its camera stays put.
	const runs = useMemo(() => {
		let before = 0;
		return columns.map((column) => {
			const run = columnMap(map, column, before, columns.length);
			before += column.length;
			return run;
		});
	}, [map, columns]);
	const boxes = useMemo(() => (plan ? topicBoxes(plan, wrapped ? runs.map((r) => layoutTopicMap(r.topics, r.edges, node)) : [layout]) : new Map()), [plan, wrapped, runs, layout, node]);
	const links = useMemo(() => (plan && wrapped ? pathLinks(plan, boxes) : []), [plan, wrapped, boxes]);
	const contentWidth = plan ? plan.frames.reduce((sum, f) => sum + f.width, 0) : 0;

	// A topic pointed at in one column lights its chain in every column.
	const [pointed, setPointed] = useState<TopicHandle | null>(null);
	const byHref = useMemo(() => new Map(map.topics.map((t) => [unitHref(map.workspace, t.handle), t.handle])), [map.topics, map.workspace]);
	const topicAt = (target: EventTarget | null): TopicHandle | null => {
		const href = target instanceof Element ? target.closest("a[data-slot=course-map-node]")?.getAttribute("href") : null;
		return href ? (byHref.get(href) ?? null) : null;
	};
	const lit = wrapped && pointed ? chainOf(pointed, map.edges) : highlight;

	const nodeOf = (topic: TopicHandle) => area.current?.querySelector<HTMLAnchorElement>(`a[data-slot=course-map-node][href="${CSS.escape(unitHref(map.workspace, topic))}"]`) ?? null;
	useImperativeHandle(ref, () => ({
		focus: () => {
			const stop = (map.current && nodeOf(map.current)) || area.current?.querySelector<HTMLAnchorElement>('a[data-slot=course-map-node][tabindex="0"]');
			stop?.focus({ preventScroll: true });
		},
	}));

	/** Scrolls the area so these topics show, when some do not. */
	const show = (topics: readonly TopicHandle[], smooth: boolean) => {
		const el = scroller.current;
		if (!el || !plan) return;
		// A row narrower than the area sits at its middle.
		const offset = Math.max(0, (el.clientWidth - contentWidth) / 2);
		const shown = topics.flatMap((t) => {
			const box = boxes.get(t);
			return box ? [{ ...box, x: box.x + offset }] : [];
		});
		const to = scrollToShow(shown, { left: el.scrollLeft, top: el.scrollTop }, { width: el.clientWidth, height: el.clientHeight }, { width: el.scrollWidth, height: el.scrollHeight });
		if (to) el.scrollTo({ ...to, behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
	};
	const showRef = useRef(show);
	useLayoutEffect(() => {
		showRef.current = show;
	});

	// It opens on the header's topic, and keeps it in view as the window resizes.
	useLayoutEffect(() => {
		if (plan?.mode === "scroll" && startAt) showRef.current([startAt], false);
	}, [plan, startAt]);

	// A fact that stays lit brings its topics into view.
	useEffect(() => {
		if (!reveal || plan?.mode !== "scroll") return;
		const timer = window.setTimeout(() => showRef.current([...reveal], true), REVEAL_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [reveal, plan]);

	// The map's own walk moves within a column and stops at its ends: past
	// them, on to the next column, or Up from the top to the legend.
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.defaultPrevented || !isWalkKey(event.key)) return;
		const from = topicAt(event.target);
		if (!from) return;
		const next = wrapped ? acrossColumns(columns, from, event.key) : null;
		if (next) {
			event.preventDefault();
			nodeOf(next)?.focus({ preventScroll: true });
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			onTop();
		}
	};
	const point = (event: PointerEvent<HTMLDivElement>) => {
		if (wrapped) setPointed(topicAt(event.target));
	};
	// A topic the keyboard reaches comes into view, and lights its chain across columns.
	const onFocus = (event: FocusEvent<HTMLDivElement>) => {
		const topic = topicAt(event.target);
		if (wrapped) setPointed(topic);
		if (topic && event.target instanceof Element && event.target.matches(":focus-visible")) show([topic], true);
	};

	const linkState = (from: TopicHandle, to: TopicHandle) => (!lit ? "rest" : lit.has(from) && lit.has(to) ? "on" : "off");
	const noted = notes && lit ? [...notes].filter(([topic]) => lit.has(topic) && boxes.has(topic)) : [];

	return (
		<div
			ref={area}
			data-slot="course-map-pane"
			data-plan={plan?.mode}
			className="relative -mx-8 mt-1 min-h-0 flex-1"
			onKeyDown={onKeyDown}
			onPointerOver={point}
			onPointerLeave={() => setPointed(null)}
			onFocus={onFocus}
			onBlur={() => setPointed(null)}
		>
			<div
				ref={scroller}
				data-slot="course-map-scroller"
				data-more-above={edges.top || undefined}
				data-more-below={edges.bottom || undefined}
				data-more-left={edges.left || undefined}
				data-more-right={edges.right || undefined}
				className={cn(
					"absolute inset-0 overflow-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					// Only an edge with more past it fades, as far in as a topic brought into view keeps off it (REVEAL_ROOM).
					edges.top && "mask-t-from-[calc(100%-2rem)]",
					edges.bottom && "mask-b-from-[calc(100%-2rem)]",
					edges.left && "mask-l-from-[calc(100%-2rem)]",
					edges.right && "mask-r-from-[calc(100%-2rem)]",
				)}
			>
				{/* The wheel scrolls the area, not the maps: each shows its topics whole (React Flow's `nowheel`). A row wider than the area starts at its left. */}
				<div className="nowheel flex w-max min-w-full justify-center">
					{plan && (
						// pt-3 pb-6 is WRAP_ROOM: the room the links between columns run through.
						<div className={cn("relative flex shrink-0", wrapped && "pt-3 pb-6")}>
							{plan.columns.map((column, i) => (
								<div key={column[0]} data-slot="course-map-column" className="relative flex shrink-0 flex-col" style={{ width: plan.frames[i]!.width, height: plan.frames[i]!.height }}>
									<TopicMap map={runs[i]!} margin={MAP_ROOM} highlight={lit} />
								</div>
							))}
							{links.length > 0 && (
								<svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
									{links.map((link) => (
										<PathLink key={link.from} d={link.d} state={linkState(link.from, link.to)} />
									))}
								</svg>
							)}
							{noted.map(([topic, fact]) => (
								<TopicNote key={topic} fact={fact} box={boxes.get(topic)!} />
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

