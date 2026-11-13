"use client";

import { useMemo } from "react";
import type { ChatListItem } from "@/src/core";
import { courseRead, type CourseRead } from "@/components/course-page/course-model";
import { useStudyHome } from "@/components/study-home/use-study-home";

/** One course's page, read as Home reads its courses (`useStudyHome`: the
 *  courses and every session, read again on the server's events), and the
 *  sessions its button picks up from. `retry` reads again. */
export function useCourse(workspace: string): { read: CourseRead; chats: readonly ChatListItem[]; retry: () => void } {
	const { state, retry } = useStudyHome();
	const read = useMemo(() => courseRead(state, workspace), [state, workspace]);
	return { read, chats: state.status === "ready" ? state.chats : NO_CHATS, retry };
}

const NO_CHATS: readonly ChatListItem[] = [];
