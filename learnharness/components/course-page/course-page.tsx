"use client";

import { useSyncExternalStore } from "react";
import NotFound from "next/dist/client/components/builtin/not-found";
import { useCourseVariant } from "@/components/design-variant";
import { CourseChrome } from "@/components/course-page/course-chrome";
import { BriefCourse } from "@/components/course-page/brief/brief-course";
import { ListCourse } from "@/components/course-page/list/list-course";
import { MapCourse } from "@/components/course-page/map/map-course";
import { SplitCourse } from "@/components/course-page/split/split-course";

const subscribeNever = () => () => {};

/** False while the server draws the page and while it hydrates, when the
 *  switch reads Current whatever it holds; true after. */
function useHydrated(): boolean {
	return useSyncExternalStore(
		subscribeNever,
		() => true,
		() => false,
	);
}

/**
 * One course's page, `/unit/<course>` (spec: course-page.md): the
 * candidate the Course switch names, each from its own folder. On Current
 * there is no course page, so the address shows what any unknown address
 * shows. The one place that reads the switch: shipping a candidate deletes
 * the others, this branch and the switch.
 */
export function CoursePage({ workspace, initialConfigured }: { workspace: string; initialConfigured: boolean }) {
	const variant = useCourseVariant();
	const hydrated = useHydrated();
	if (!hydrated) return <CourseChrome />;
	switch (variant) {
		case "list":
			return <ListCourse workspace={workspace} initialConfigured={initialConfigured} />;
		case "map":
			return <MapCourse workspace={workspace} initialConfigured={initialConfigured} />;
		case "brief":
			return <BriefCourse workspace={workspace} initialConfigured={initialConfigured} />;
		case "split":
			return <SplitCourse workspace={workspace} initialConfigured={initialConfigured} />;
		case "current":
			return <NotFound />;
	}
}
