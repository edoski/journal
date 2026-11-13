"use client";

import { useMemo } from "react";
import { courseRead, type CourseRead } from "@/components/course-page/course-model";
import { useStudyHome } from "@/components/study-home/use-study-home";
import { useTopicStarts } from "@/components/unit-inbox/use-unit-inbox";

/** One course's page, read as Home reads its courses (`useStudyHome`: the
 *  courses and every session, once per visit), with the sessions started on
 *  a topic's page linked to it as the sidebar links them. `retry` reads
 *  again. */
export function useCourse(workspace: string): { read: CourseRead; retry: () => void } {
	const { state, retry } = useStudyHome();
	const [starts] = useTopicStarts();
	const read = useMemo(() => courseRead(state, workspace, starts), [state, workspace, starts]);
	return { read, retry };
}
