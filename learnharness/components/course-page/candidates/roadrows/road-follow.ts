"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArcHandle, StudyCourse, TopicHandle } from "@/src/core";
import { litArc } from "@/components/study-home/home-map";
import { FOLLOW_DWELL_MS } from "@/components/study-home/study-home";
import { RETURN_DWELL_MS } from "@/components/course-map/topic-map/lit-camera";
import type { CourseArcSection } from "@/components/course-page/course-model";

/** What the map follows while he points at the road, as Home's map follows
 *  a Today row: the topics it lights (the rest dim), whether the camera
 *  brings them into view (`framed`), and the arc it shows. */
export interface RoadFollow {
	lit: ReadonlySet<TopicHandle>;
	framed: boolean;
	/** The card ringed, a row's own; null for a stop. */
	marked: TopicHandle | null;
	arc: ArcHandle | null;
}

/** A topic row: its topic lit and framed, in the arc it lies in (Home's `litArc`). Pure. */
export function followTopic(course: StudyCourse, topic: TopicHandle): RoadFollow {
	const lit = new Set([topic]);
	return { lit, framed: true, marked: topic, arc: litArc(course, lit) ?? null };
}

/** An arc's stop: the arc shown, its topics lit. Pure. */
export function followArc(section: CourseArcSection): RoadFollow {
	return { lit: new Set(section.topics.map((t) => t.topic.handle)), framed: false, marked: null, arc: section.arc.handle };
}

/**
 * The road's follow, timed as Home's: a pointer rests on a stop or row for
 * Home's dwell before the map follows it (`FOLLOW_DWELL_MS`), so a sweep
 * across the road does not flip the map arc by arc; focus follows at once;
 * pointing at nothing returns the map to the page's view after the map's
 * own return dwell (`RETURN_DWELL_MS`), so crossing from one row to the
 * next never sends it home and back.
 */
export function useRoadFollow(): { follow: RoadFollow | null; point: (to: RoadFollow | null, by?: "pointer" | "focus") => void } {
	const [follow, setFollow] = useState<RoadFollow | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	const point = useCallback((to: RoadFollow | null, by: "pointer" | "focus" = "pointer") => {
		clearTimeout(timer.current);
		if (to && by === "focus") return setFollow(to);
		timer.current = setTimeout(() => setFollow(to), to ? FOLLOW_DWELL_MS : RETURN_DWELL_MS);
	}, []);
	return { follow, point };
}
