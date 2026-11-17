"use client";

import type { CourseMap, TopicHandle } from "@/src/core";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { PANE_FADE, mapFade } from "@/components/study-home/map-frame";
import type { Said } from "@/components/unit-inbox/sidebar-says";

const VIGNETTE = mapFade(PANE_FADE.x, PANE_FADE.y);

/**
 * The map pane of a topic not started (spec: hybrid.md, "A topic not
 * started"): the course map cut to the topic and everything it builds on
 * (`buildsMapOf`), each card with its pie and its line, as every map's
 * card says it (`said`), the topic's own card glowing; a row he points at
 * in Builds on glows instead.
 */
export function BuildsOnMap({ map, said, topic, pointed }: { map: CourseMap; said: ReadonlyMap<TopicHandle, Said>; topic: TopicHandle; pointed: TopicHandle | null }) {
	return (
		<div data-slot="topic-builds-map" className="relative flex min-h-0 flex-1 flex-col" style={VIGNETTE}>
			<TopicMap map={map} said={said} margin={PANE_FADE} marked={pointed ?? topic} opensOn={topic} />
		</div>
	);
}
