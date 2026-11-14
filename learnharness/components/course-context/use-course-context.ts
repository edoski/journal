"use client";

import { useCallback, useEffect, useState } from "react";
import type { CourseContext } from "@/src/core";
import { useServerEvent } from "@/components/server-events";

export type ContextRead = { status: "loading" } | { status: "failed" } | { status: "ready"; context: CourseContext };

/** What a change answers: null when it landed, else the sentence to show. */
export type ContextChange = Promise<string | null>;

export interface CourseContextApi {
	read: ContextRead;
	describe: (description: string) => ContextChange;
	linkFolder: (folder: string) => ContextChange;
	addWebsite: (address: string) => ContextChange;
	remove: (handle: string) => ContextChange;
	/** Open a linked folder in Finder or a file in its app. */
	open: (handle: string) => ContextChange;
}

const UNREACHABLE = "LearnHarness could not be reached. Check it is running, then try again.";

/**
 * A course's context (GET /api/courses/context), read on mount and again
 * whenever its record changes (a link here, a lesson's save, a file
 * registered from a linked folder), and the changes Context makes. Each
 * change answers with the new context, which replaces the read.
 */
export function useCourseContext(workspace: string, fetchLike: typeof fetch = fetch): CourseContextApi {
	const [read, setRead] = useState<ContextRead>({ status: "loading" });
	const url = `/api/courses/context?workspace=${encodeURIComponent(workspace)}`;
	const load = useCallback(async () => {
		try {
			const res = await fetchLike(url, { cache: "no-store" });
			if (!res.ok) throw new Error(String(res.status));
			setRead({ status: "ready", context: (await res.json()) as CourseContext });
		} catch {
			setRead((prev) => (prev.status === "ready" ? prev : { status: "failed" }));
		}
	}, [fetchLike, url]);
	useEffect(() => void load(), [load]);
	useServerEvent("course-changed", (event) => {
		if (event.workspace === workspace) void load();
	});

	const send = useCallback(
		async (method: "POST" | "PATCH" | "DELETE", body: Record<string, string>): ContextChange => {
			try {
				const res = await fetchLike("/api/courses/context", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, ...body }) });
				const answer = (await res.json().catch(() => ({}))) as CourseContext & { error?: string };
				if (!res.ok) return answer.error ?? "That did not work. Try again.";
				setRead({ status: "ready", context: answer });
				return null;
			} catch {
				return UNREACHABLE;
			}
		},
		[fetchLike, workspace],
	);

	const open = useCallback(
		async (handle: string): ContextChange => {
			try {
				const res = await fetchLike("/api/courses/context/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, handle }) });
				if (res.ok) return null;
				return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That could not be opened.";
			} catch {
				return UNREACHABLE;
			}
		},
		[fetchLike, workspace],
	);

	return {
		read,
		describe: (description) => send("PATCH", { description }),
		linkFolder: (folder) => send("POST", { folder }),
		addWebsite: (website) => send("POST", { website }),
		remove: (handle) => send("DELETE", { handle }),
		open,
	};
}
