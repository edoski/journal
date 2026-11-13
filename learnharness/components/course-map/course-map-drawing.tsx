"use client";

import type { ComponentProps } from "react";
import type { TopicHandle } from "@/src/core";
import { useMapVariant } from "@/components/design-variant";
import { CourseMapGraph } from "./course-map-graph";
import { TopicMap } from "./topic-map/topic-map";

/**
 * The course's map as a study home draws it: the topic map (spec:
 * topic-map/topic-map.md) while the Map switch is on Proposed, else the
 * map as it was. The one place that reads the switch; shipping the topic
 * map deletes this file, the old graph and its popover.
 */
export function CourseMapDrawing({ highlight = null, ...props }: ComponentProps<typeof CourseMapGraph> & { highlight?: ReadonlySet<TopicHandle> | null }) {
	const proposed = useMapVariant() === "proposed";
	return proposed ? <TopicMap map={props.map} margin={props.margin} highlight={highlight} /> : <CourseMapGraph {...props} />;
}
