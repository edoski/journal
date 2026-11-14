"use client";

import type { CourseMap, TopicHandle } from "@/src/core";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { mapFade } from "@/components/study-home/map-frame";

/** The fade at the pane's edges, the lesson map's (lesson-map.tsx). */
const FADE = { x: 24, y: 40 };
const VIGNETTE = mapFade(FADE.x, FADE.y);

/**
 * The map pane of a topic not started (spec: hybrid.md, "A topic not
 * started"): the course map cut to the topic and everything it builds on
 * (`buildsMapOf`), each card with its pie and where he stands, the topic's
 * own card glowing; a row he points at in Builds on glows instead.
 */
export function BuildsOnMap({ map, topic, pointed }: { map: CourseMap; topic: TopicHandle; pointed: TopicHandle | null }) {
	return (
		<div data-slot="topic-builds-map" className="relative flex min-h-0 flex-1 flex-col" style={VIGNETTE}>
			<TopicMap map={map} margin={FADE} marked={pointed ?? topic} />
		</div>
	);
}
