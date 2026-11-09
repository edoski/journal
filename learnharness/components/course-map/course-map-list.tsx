"use client";

import { useCallback, useMemo, useState } from "react";
import type { CourseMap, CourseMapTopic, TopicHandle } from "@/src/core";
import type { CourseMapLayout } from "./course-map-layout";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TopicDetail } from "./topic-detail";
import { CURRENT_TAG, titlesText, topicCaption } from "./topic-words";

/**
 * The map as a list (spec: course-map.md), for the keyboard and screen
 * readers: the same layers top to bottom, each topic a row naming its
 * level, states and prerequisites, opening the same detail as its node.
 */
export function CourseMapList({
	map,
	layout,
	onStudy,
	busy,
}: {
	map: CourseMap;
	layout: CourseMapLayout;
	onStudy: (topic: CourseMapTopic) => void;
	busy: boolean;
}) {
	const [opened, setOpened] = useState<TopicHandle | null>(null);
	const byHandle = useMemo(() => new Map(map.topics.map((t) => [t.handle, t])), [map.topics]);
	const titleOf = useCallback((handle: TopicHandle) => byHandle.get(handle)?.title ?? handle, [byHandle]);
	return (
		<div data-slot="course-map-scroll" className="min-h-0 flex-1 overflow-y-auto">
			<div data-slot="course-map-list" className="mx-auto flex w-full max-w-[46rem] flex-col gap-6 px-5 pt-2 pb-10">
				{layout.layers.map((layer, index) => (
					<section key={index} aria-labelledby={`map-step-${index}`} className="flex flex-col gap-1">
						<h2 id={`map-step-${index}`} className="px-3 text-label font-medium text-muted-foreground">
							Step {index + 1}
						</h2>
						<ul className="flex flex-col">
							{layer.map((handle) => {
								const topic = byHandle.get(handle);
								if (!topic) return null;
								const current = map.current === handle;
								const needs = map.edges.flatMap((e) => (e.kind === "needs" && e.topic === handle ? [e.prerequisite] : []));
								return (
									<li key={handle}>
										<Popover open={opened === handle} onOpenChange={(open) => setOpened(open ? handle : null)}>
											<PopoverTrigger asChild>
												<button
													type="button"
													data-slot="course-map-row"
													data-current={current || undefined}
													data-testid={`map-row-${handle}`}
													className={cn(
														"flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
														current && "bg-fill-selected",
													)}
												>
													<span className="flex items-baseline gap-2">
														<span className={cn("truncate text-row font-medium", topic.level === "new" ? "text-muted-foreground" : "text-foreground")}>
															{topic.title}
														</span>
														<span className="shrink-0 text-label text-muted-foreground">
															{current ? `${CURRENT_TAG} · ` : ""}
															{topicCaption(topic)}
														</span>
													</span>
													{needs.length > 0 && (
														<span className="truncate text-label text-muted-foreground">Needs {titlesText(needs, titleOf)}</span>
													)}
												</button>
											</PopoverTrigger>
											<PopoverContent side="bottom" align="start" className="w-80">
												<TopicDetail map={map} topic={topic} titleOf={titleOf} onStudy={onStudy} busy={busy} />
											</PopoverContent>
										</Popover>
									</li>
								);
							})}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}
