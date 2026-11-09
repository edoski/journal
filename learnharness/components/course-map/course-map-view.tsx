"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisIcon, LocateFixedIcon } from "lucide-react";
import { courseLabel, type CourseMap, type CourseMapResponse, type CourseMapTopic, type GraphSnapshot } from "@/src/core";
import { layoutCourseMap } from "./course-map-layout";
import { useActivity } from "@/components/activity-dock";
import { ChainTableOverlay } from "@/components/chain-table.tsx";
import { CoursesUnavailable, useCourseChoice, type CourseState } from "@/components/course-picker";
import { NotesImportErrors, NotesImportNotices, useNotesImport } from "@/components/notes-import.tsx";
import { SetupDialog } from "@/components/setup-dialog";
import { openModelPicker, selectedModelUnavailable, useModelSetup } from "@/components/setup-cta";
import { SidebarToggle } from "@/components/sidebar";
import { SessionStarter } from "@/components/start-session";
import { CONTINUE_OPENING, examText } from "@/components/start/course-facts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CourseMapGraph } from "./course-map-graph";
import { CourseMapList } from "./course-map-list";

type MapFetch =
	| { status: "loading"; workspace: string }
	| { status: "ready"; workspace: string; map: CourseMap }
	| { status: "failed"; workspace: string; error: string };

/** What the page body shows: one state at a time. */
export type MapBody =
	| { kind: "loading" }
	| { kind: "unavailable"; reason: string }
	| { kind: "no-courses" }
	| { kind: "failed"; error: string }
	| { kind: "empty"; map: CourseMap }
	| { kind: "map"; map: CourseMap };

/** The body for the course listing and the selected course's map. Pure. */
export function mapBody(courses: CourseState, fetched: MapFetch | null, workspace: string): MapBody {
	if (courses.status === "loading") return { kind: "loading" };
	if (courses.status === "unavailable") return { kind: "unavailable", reason: courses.reason };
	if (courses.courses.length === 0) return { kind: "no-courses" };
	if (!fetched || fetched.workspace !== workspace || fetched.status === "loading") return { kind: "loading" };
	if (fetched.status === "failed") return { kind: "failed", error: fetched.error };
	return fetched.map.topics.length === 0 ? { kind: "empty", map: fetched.map } : { kind: "map", map: fetched.map };
}

function useCourseMap(workspace: string) {
	const [fetched, setFetched] = useState<MapFetch | null>(null);
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		if (!workspace) return;
		let live = true;
		setFetched({ status: "loading", workspace });
		fetch(`/api/courses/map?workspace=${encodeURIComponent(workspace)}`)
			.then((r) => r.json() as Promise<CourseMapResponse>)
			.then((body) => {
				if (!live) return;
				setFetched(body.ok ? { status: "ready", workspace, map: body.map } : { status: "failed", workspace, error: body.error });
			})
			.catch(() => {
				if (live) setFetched({ status: "failed", workspace, error: "the map could not be loaded" });
			});
		return () => {
			live = false;
		};
	}, [workspace, attempt]);
	return { fetched, retry: () => setAttempt((n) => n + 1) };
}

const START_FAILURE = "Couldn’t open the session. Try again.";

/**
 * The course map (spec: course-map.md), the Proposed design's Knowledge
 * page: one course at a time, its topics and prerequisites as a layered
 * map or a list, where the learner is, and Study this on any topic. The
 * notes import and the statements browser stay one menu away.
 */
export function CourseMapView() {
	const router = useRouter();
	const choice = useCourseChoice();
	const courses = choice.state;
	const workspace = choice.workspace || (courses.status === "ready" ? (courses.courses[0]?.workspace ?? "") : "");
	const { fetched, retry } = useCourseMap(workspace);
	const body = mapBody(courses, fetched, workspace);
	const map = body.kind === "map" || body.kind === "empty" ? body.map : null;
	const layout = useMemo(() => (body.kind === "map" ? layoutCourseMap(body.map.topics, body.map.edges) : null), [body.kind, map]);
	const [view, setView] = useState<"map" | "list">("map");
	const [jumpRequest, setJumpRequest] = useState(0);

	// Study this: a teaching session in this course opened on the topic, through
	// the same creation path and guards as Today.
	const { catalog, configured, zeroKeys } = useModelSetup(true);
	const [setupOpen, setSetupOpen] = useState(false);
	const starter = useRef(new SessionStarter());
	const [studying, setStudying] = useState(false);
	const [studyError, setStudyError] = useState<string | null>(null);
	const study = (opening: string) => {
		if (studying || !workspace) return;
		if (!configured || zeroKeys) return setSetupOpen(true);
		const strong = catalog?.slots.strong?.model;
		if (selectedModelUnavailable(catalog, strong ? `${strong.provider}:${strong.id}` : undefined)) return openModelPicker();
		setStudying(true);
		setStudyError(null);
		void starter.current
			.start({ title: opening, course: { workspace } }, fetch, JSON.stringify(catalog?.slots.strong))
			.then((target) => router.push(target))
			.catch(() => {
				setStudying(false);
				setStudyError(START_FAILURE);
			});
	};
	const studyTopic = (topic: CourseMapTopic) => study(topic.title);

	// The notes import and the statements browser, kept from the old page.
	const fileInput = useRef<HTMLInputElement>(null);
	const refreshActivity = useActivity().refresh;
	const notesImport = useNotesImport({
		onStart: () => {
			refreshActivity();
			setTimeout(() => refreshActivity(), 600);
		},
	});
	const [statementsOpen, setStatementsOpen] = useState(false);
	const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
	const loadStatements = useCallback(() => {
		void fetch("/api/graph")
			.then((r) => r.json() as Promise<GraphSnapshot>)
			.then(setSnapshot)
			.catch(() => setSnapshot(null));
	}, []);
	useEffect(() => {
		if (!statementsOpen) return;
		loadStatements();
		window.addEventListener("lh:graph-revision", loadStatements);
		return () => window.removeEventListener("lh:graph-revision", loadStatements);
	}, [statementsOpen, loadStatements]);

	const listed = courses.status === "ready" ? courses.courses : [];
	const exam = examText(listed.find((c) => c.workspace === workspace)?.exam ?? null);
	const messages = [...(studyError ? [studyError] : [])];

	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<header data-slot="course-map-header" className="relative flex h-13 shrink-0 items-center gap-2 px-3">
				<SidebarToggle />
				{listed.length > 0 && (
					<Select value={workspace} onValueChange={choice.choose}>
						<SelectTrigger size="sm" aria-label="Course" data-testid="map-course" className="lh-no-drag max-w-64">
							<SelectValue />
						</SelectTrigger>
						<SelectContent position="popper" align="start">
							{listed.map((course) => (
								<SelectItem key={course.workspace} value={course.workspace}>
									{courseLabel(course)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
				{exam && <span className="text-label text-muted-foreground">{exam}</span>}
				<div className="ml-auto flex items-center gap-2">
					{body.kind === "map" && view === "map" && map?.current && (
						<Button variant="quiet" size="sm" className="lh-no-drag h-7 text-row font-normal" onClick={() => setJumpRequest((n) => n + 1)}>
							<LocateFixedIcon />
							Jump to current
						</Button>
					)}
					{body.kind === "map" && (
						<ToggleGroup
							type="single"
							variant="segmented"
							size="segment"
							value={view}
							onValueChange={(next) => next && setView(next as "map" | "list")}
							aria-label="View"
							className="lh-no-drag"
						>
							<ToggleGroupItem value="map" data-testid="map-view-map">
								Map
							</ToggleGroupItem>
							<ToggleGroupItem value="list" data-testid="map-view-list">
								List
							</ToggleGroupItem>
						</ToggleGroup>
					)}
					<input
						ref={fileInput}
						type="file"
						multiple
						accept=".md,.markdown,.txt,.pdf"
						className="hidden"
						onChange={(e) => {
							notesImport.onImportFiles(e.target.files);
							e.target.value = "";
						}}
					/>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="quiet" size="icon-row" aria-label="More" data-testid="map-more" className="lh-no-drag">
								<EllipsisIcon />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem disabled={notesImport.importing} onSelect={() => fileInput.current?.click()}>
								{notesImport.importing ? "Importing notes…" : "Import notes…"}
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setStatementsOpen(true)} data-testid="map-statements">
								Statements…
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>
			{(messages.length > 0 || notesImport.errors.length > 0 || notesImport.notices.length > 0) && (
				<div className="flex flex-col gap-1 px-5 pb-2">
					{messages.map((m) => (
						<p key={m} role="alert" className="text-row text-danger">
							{m}
						</p>
					))}
					<NotesImportErrors errors={notesImport.errors} variant="proposed" />
					<NotesImportNotices notices={notesImport.notices} variant="proposed" />
				</div>
			)}
			<main data-slot="course-map-view" className="relative flex min-h-0 flex-1 flex-col">
				{body.kind === "map" && layout && map ? (
					view === "map" ? (
						<CourseMapGraph key={map.workspace} map={map} layout={layout} jumpRequest={jumpRequest} onStudy={studyTopic} busy={studying} />
					) : (
						<CourseMapList key={map.workspace} map={map} layout={layout} onStudy={studyTopic} busy={studying} />
					)
				) : (
					<MapNotice body={body} busy={studying} onStart={() => study(CONTINUE_OPENING)} onRetry={retry} />
				)}
				<ChainTableOverlay
					open={statementsOpen}
					nodes={snapshot?.propositions ?? []}
					chains={snapshot?.chains ?? []}
					sessions={snapshot?.sessions ?? {}}
					fileSources={snapshot?.fileSources ?? {}}
					onClose={() => setStatementsOpen(false)}
				/>
			</main>
			<SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} onDone={() => setSetupOpen(false)} />
		</div>
	);
}

/** Every state with no map to draw: one quiet centred block. */
function MapNotice({ body, busy, onStart, onRetry }: { body: MapBody; busy: boolean; onStart: () => void; onRetry: () => void }) {
	if (body.kind === "map") return null;
	return (
		<div data-slot="course-map-notice" data-state={body.kind} className="flex flex-1 flex-col items-center justify-center gap-2 px-5 pb-24 text-center">
			{body.kind === "loading" && <p className="text-row text-muted-foreground">Reading the course…</p>}
			{body.kind === "unavailable" && (
				<div className="max-w-[28rem] text-left">
					<CoursesUnavailable reason={body.reason} variant="proposed" />
				</div>
			)}
			{body.kind === "no-courses" && (
				<>
					<h2 className="text-subheading font-semibold text-foreground">No courses yet</h2>
					<p className="text-row text-muted-foreground">A course appears here once you start studying one on Today.</p>
				</>
			)}
			{body.kind === "failed" && (
				<>
					<p role="alert" className="text-row text-danger">
						The map could not be read: {body.error}
					</p>
					<Button variant="quiet" size="sm" className="h-7 text-row font-normal" onClick={onRetry}>
						Try again
					</Button>
				</>
			)}
			{body.kind === "empty" && (
				<>
					<h2 className="text-subheading font-semibold text-foreground">No map yet</h2>
					<p className="text-row text-muted-foreground">Topics appear as you study this course.</p>
					<Button size="sm" className="mt-2 text-row" disabled={busy} onClick={onStart}>
						Start a session
					</Button>
				</>
			)}
		</div>
	);
}
