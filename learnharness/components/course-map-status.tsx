"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNotifyHub } from "@/components/server-events";
import { courseLabel, type CourseSummary } from "@/src/core";

/** Where the new course's map stands, as GET /api/courses/map reports it. */
export type MapStatus =
	| { state: "building" }
	| { state: "built"; outcome: string }
	| { state: "failed"; reason: string }
	| { state: "none" };

/** The status in words: what he sees, and whether Try again is offered. Pure. */
export function mapStatusWords(status: MapStatus | null): { text: string; retry: boolean } {
	switch (status?.state) {
		case "built":
			return { text: `Its topic map is ready: ${status.outcome}.`, retry: false };
		case "failed":
			return { text: `Its topic map could not be built, because ${status.reason}. Nothing in the course changed.`, retry: true };
		case "none":
			return { text: "Its topic map has not been built yet.", retry: true };
		default:
			return { text: "Its topic map is being built from your material. You can follow it in Activity and start studying now.", retry: false };
	}
}

/** The New course dialog after Create, when material came with the course:
 *  the map building in the background, live, until Done. */
export function CourseMapStatus({ course, onClose, fetchLike = fetch }: { course: CourseSummary; onClose: () => void; fetchLike?: typeof fetch }) {
	const [status, setStatus] = useState<MapStatus | null>(null);
	const hub = useNotifyHub();
	const url = `/api/courses/map?workspace=${encodeURIComponent(course.workspace)}`;
	const refresh = useCallback(() => {
		void fetchLike(url)
			.then((r) => (r.ok ? (r.json() as Promise<MapStatus>) : null))
			.then((s) => s && setStatus(s))
			.catch(() => {});
	}, [fetchLike, url]);
	useEffect(() => {
		refresh();
		if (!hub) return;
		const offs = [hub.subscribe("courses-changed", refresh), hub.subscribe("activity-changed", refresh)];
		return () => offs.forEach((off) => off());
	}, [hub, refresh]);
	const retry = () => {
		setStatus({ state: "building" });
		void fetchLike("/api/courses/map", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: course.workspace }) })
			.then(refresh)
			.catch(() => {});
	};
	const words = mapStatusWords(status);
	return (
		<div className="flex flex-col gap-4" data-testid="course-map-status" data-state={status?.state ?? "building"}>
			<DialogHeader>
				<DialogTitle>{courseLabel(course)} is ready</DialogTitle>
			</DialogHeader>
			<p className="flex items-start gap-2 text-row text-muted-foreground" role="status">
				{(status === null || status.state === "building") && <LoaderCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />}
				<span>{words.text}</span>
			</p>
			<DialogFooter className="pt-2">
				{words.retry && (
					<Button type="button" variant="quiet" onClick={retry} data-testid="course-map-retry">
						Try again
					</Button>
				)}
				<Button type="button" onClick={onClose} data-testid="course-map-done" autoFocus>
					Done
				</Button>
			</DialogFooter>
		</div>
	);
}
