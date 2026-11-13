"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { curveBumpY, line } from "d3-shape";
import { FileTextIcon } from "lucide-react";
import type { CourseMap, CourseMapTopic, TopicHandle } from "@/src/core";
import {
	NODE_HEIGHT,
	NODE_WIDTH,
	contrastsOf,
	prerequisitesOf,
	type CourseMapLayout,
	type Point,
} from "./course-map-layout";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TopicDetail } from "./topic-detail";
import { CURRENT_TAG, topicCaption } from "./topic-words";

/** Space around the drawing: room for the current topic's tag above layer 0. */
const PAD = 32;
const NO_MARGIN = { x: 0, y: 0 };
/** The open's per-layer stagger, capped so the whole entrance ends under 300ms. */
const STAGGER_MS = 15;
const STAGGER_CAP_MS = 110;
/** A drawing a little wider than the view shrinks to fit, down to this
 *  scale; a wider one scrolls sideways instead. */
const MIN_FIT = 0.8;
const SECURE = new Set(["independent", "retained", "transferred"]);
const EDGE_REST = "rgb(255 255 255 / 0.16)";
const EDGE_LIT = "rgb(255 255 255 / 0.4)";

const path = line<Point>().curve(curveBumpY);

function reducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A dashed arc between two competing methods, bowed to the side so it
 *  reads apart from the vertical `needs` links. */
function contrastPath(from: Point, to: Point): string {
	const [x1, y1] = from;
	const [x2, y2] = to;
	const bow = Math.max(40, Math.abs(y2 - y1) * 0.35);
	const cx = (x1 + x2) / 2 + (x2 >= x1 ? bow : -bow);
	const cy = (y1 + y2) / 2 - (Math.abs(y2 - y1) < 1 ? bow : 0);
	return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

/**
 * The course drawn as a layered map (spec: course-map.md): prerequisites
 * above the topics that need them, every topic a node naming its level and
 * states. Hover or focus lights a topic's prerequisite chain and draws its
 * contrasts; a click opens its detail; arrows walk the edges.
 */
export function CourseMapGraph({
	map,
	layout,
	jumpRequest,
	onStudy,
	busy,
	anchor = 0.4,
	margin = NO_MARGIN,
	className,
}: {
	map: CourseMap;
	layout: CourseMapLayout;
	/** Bumped by "Jump to current": scroll the current topic into view. */
	jumpRequest: number;
	onStudy: (topic: CourseMapTopic) => void;
	busy: boolean;
	/** Where the current topic sits down the view, as a share of its height. */
	anchor?: number;
	/** Room around the drawing at screen size, for a frame that fades its
	 *  edges: a topic at the drawing's edge scrolls clear of the fade. */
	margin?: { x: number; y: number };
	/** The scroll box's own classes, for a frame that embeds the map. */
	className?: string;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const nodeRefs = useRef(new Map<TopicHandle, HTMLButtonElement>());
	const [active, setActive] = useState<TopicHandle | null>(null);
	const [opened, setOpened] = useState<TopicHandle | null>(null);
	const width = layout.width + PAD * 2;
	const height = layout.height + PAD * 2;
	const [fit, setFit] = useState(1);
	useEffect(() => {
		const box = scrollRef.current;
		if (!box) return;
		const measure = () => setFit(Math.min(1, Math.max(MIN_FIT, box.clientWidth / width)));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(box);
		return () => observer.disconnect();
	}, [width]);
	const [tabStop, setTabStop] = useState<TopicHandle | null>(map.current ?? map.topics[0]?.handle ?? null);
	const byHandle = useMemo(() => new Map(map.topics.map((t) => [t.handle, t])), [map.topics]);
	const titleOf = useCallback((handle: TopicHandle) => byHandle.get(handle)?.title ?? handle, [byHandle]);

	const lit = useMemo(() => (active ? new Set([active, ...prerequisitesOf(active, map.edges)]) : null), [active, map.edges]);
	const partners = useMemo(() => (active ? contrastsOf(active, map.edges) : []), [active, map.edges]);

	const centre = (handle: TopicHandle): Point => {
		const p = layout.topics.get(handle)!;
		return [PAD + p.x + NODE_WIDTH / 2, PAD + p.y + NODE_HEIGHT / 2];
	};

	/** Puts the current topic at `anchor` of the view's height (about 40% on the Map page). */
	const jump = useCallback(
		(behavior: ScrollBehavior) => {
			const box = scrollRef.current;
			const placed = map.current ? layout.topics.get(map.current) : undefined;
			if (!box || !placed) return;
			box.scrollTo({
				top: margin.y + (PAD + placed.y + NODE_HEIGHT / 2) * fit - box.clientHeight * anchor,
				left: margin.x + (PAD + placed.x + NODE_WIDTH / 2) * fit - box.clientWidth / 2,
				behavior,
			});
		},
		[layout, map.current, fit, anchor, margin.x, margin.y],
	);
	useEffect(() => jump("auto"), [jump]);
	useEffect(() => {
		if (jumpRequest > 0) jump(reducedMotion() ? "auto" : "smooth");
	}, [jumpRequest, jump]);

	const neighbour = (handle: TopicHandle, key: string): TopicHandle | null => {
		const here = layout.topics.get(handle);
		if (!here) return null;
		const nearest = (candidates: TopicHandle[]) =>
			candidates.sort((a, b) => Math.abs(layout.topics.get(a)!.x - here.x) - Math.abs(layout.topics.get(b)!.x - here.x))[0] ?? null;
		if (key === "ArrowLeft" || key === "ArrowRight") {
			const row = layout.layers[here.layer] ?? [];
			return row[row.indexOf(handle) + (key === "ArrowLeft" ? -1 : 1)] ?? null;
		}
		if (key === "ArrowUp") {
			return nearest(map.edges.flatMap((e) => (e.kind === "needs" && e.topic === handle ? [e.prerequisite] : [])));
		}
		if (key === "ArrowDown") {
			return nearest(map.edges.flatMap((e) => (e.kind === "needs" && e.prerequisite === handle ? [e.topic] : [])));
		}
		return null;
	};
	const onKeyDown = (handle: TopicHandle) => (event: KeyboardEvent<HTMLButtonElement>) => {
		const next = neighbour(handle, event.key);
		if (!next) return;
		event.preventDefault();
		setTabStop(next);
		nodeRefs.current.get(next)?.focus();
	};

	const currentTitle = map.current ? titleOf(map.current) : null;

	return (
		<div ref={scrollRef} data-slot="course-map-scroll" className={cn("min-h-0 flex-1 overflow-auto", className)}>
			<div className="relative mx-auto" style={{ width: width * fit + margin.x * 2, height: height * fit + margin.y * 2 }}>
				<figure
					data-slot="course-map-graph"
					aria-labelledby="course-map-caption"
					className="absolute origin-top-left"
					style={{ top: margin.y, left: margin.x, width, height, transform: fit < 1 ? `scale(${fit})` : undefined }}
				>
					<figcaption id="course-map-caption" className="sr-only">
						{`${map.title}: ${map.topics.length} topics, prerequisites above the topics that need them.`}
						{currentTitle ? ` You are at ${currentTitle}.` : ""}
					</figcaption>
					<svg
						aria-hidden="true"
						width={width}
						height={height}
						className="pointer-events-none absolute inset-0 motion-safe:animate-[chrome-fade-in_180ms_ease-out_backwards]"
					>
						{layout.needs.map((need) => {
							const on = lit !== null && lit.has(need.topic) && lit.has(need.prerequisite);
							return (
								<path
									key={`${need.prerequisite}>${need.topic}`}
									d={path(need.points.map(([x, y]) => [x + PAD, y + PAD] as const)) ?? ""}
									fill="none"
									stroke={on ? EDGE_LIT : EDGE_REST}
									strokeWidth={1}
									strokeLinecap="round"
									className={cn("transition-opacity duration-[120ms] motion-reduce:transition-none", lit && !on && "opacity-35")}
								/>
							);
						})}
						{active &&
							partners.map((partner) => (
								<path
									key={`contrast:${partner}`}
									data-slot="course-map-contrast"
									d={contrastPath(centre(active), centre(partner))}
									fill="none"
									stroke={EDGE_LIT}
									strokeWidth={1}
									strokeDasharray="3 3"
								/>
							))}
					</svg>
					{map.topics.map((topic) => {
						const placed = layout.topics.get(topic.handle);
						if (!placed) return null;
						const current = map.current === topic.handle;
						const caption = topicCaption(topic);
						const dim = lit !== null && !lit.has(topic.handle) && !partners.includes(topic.handle);
						const delay = Math.min(placed.layer * STAGGER_MS, STAGGER_CAP_MS);
						return (
							<div
								key={topic.handle}
								className={cn(
									"absolute transition-opacity duration-[120ms] motion-safe:animate-[lh-card-enter_180ms_cubic-bezier(0.19,1,0.22,1)_backwards] motion-reduce:transition-none",
									dim && "opacity-35",
								)}
								style={{ left: PAD + placed.x, top: PAD + placed.y, width: NODE_WIDTH, height: NODE_HEIGHT, animationDelay: `${delay}ms` }}
							>
								{current && (
									<span data-slot="course-map-current-tag" className="absolute -top-5 left-0 text-caption font-medium text-foreground">
										{CURRENT_TAG}
									</span>
								)}
								<Popover open={opened === topic.handle} onOpenChange={(open) => setOpened(open ? topic.handle : null)}>
									<PopoverTrigger asChild>
										<button
											ref={(el) => {
												if (el) nodeRefs.current.set(topic.handle, el);
												else nodeRefs.current.delete(topic.handle);
											}}
											type="button"
											data-slot="course-map-node"
											data-level={topic.level}
											data-current={current || undefined}
											data-testid={`map-node-${topic.handle}`}
											aria-label={`${topic.title}${current ? `, ${CURRENT_TAG.toLowerCase()}` : ""}, ${caption}${topic.tasks.length ? ", in an open task" : ""}`}
											tabIndex={tabStop === topic.handle ? 0 : -1}
											onMouseEnter={() => setActive(topic.handle)}
											onMouseLeave={() => setActive(null)}
											onFocus={() => {
												setActive(topic.handle);
												setTabStop(topic.handle);
											}}
											onBlur={() => setActive(null)}
											onKeyDown={onKeyDown(topic.handle)}
											onDoubleClick={() => onStudy(topic)}
											className={cn(
												"relative flex size-full flex-col justify-center gap-0.5 rounded-md border px-3 text-left outline-none transition-colors duration-150",
												"hover:border-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
												topic.level === "new"
													? "border-dashed border-white/12 bg-background"
													: SECURE.has(topic.level)
														? "border-input bg-[color-mix(in_srgb,#fff_5%,var(--background))]"
														: "border-border bg-[color-mix(in_srgb,#fff_3%,var(--background))]",
												current && "border-ring shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_16%,transparent)] hover:border-ring",
											)}
										>
											<span
												className={cn(
													"line-clamp-2 pr-4 text-row font-medium",
													topic.level === "new" ? "text-muted-foreground" : "text-foreground",
												)}
											>
												{topic.title}
											</span>
											<span className="truncate text-caption text-muted-foreground">{caption}</span>
											{topic.tasks.length > 0 && (
												<FileTextIcon aria-hidden="true" className="absolute top-2 right-2 size-3.5 text-muted-foreground" />
											)}
										</button>
									</PopoverTrigger>
									<PopoverContent side="right" align="start" className="w-80" data-testid="topic-detail-popover">
										<TopicDetail map={map} topic={topic} titleOf={titleOf} onStudy={onStudy} busy={busy} />
									</PopoverContent>
								</Popover>
							</div>
						);
					})}
				</figure>
			</div>
		</div>
	);
}
