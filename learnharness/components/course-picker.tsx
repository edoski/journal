"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, GraduationCapIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { takeHeld } from "@/components/held-asks";
import { DeleteCourseDialog, RenameCourseDialog } from "@/components/course-manage-dialogs";
import { useServerEvent } from "@/components/server-events";
import { courseLabel, kbdEventForAction, type CourseListing, type CourseSummary } from "@/src/core";

/** Where the last picked course is remembered (per device). */
const COURSE_CHOICE_KEY = "lh:course";

export const PICK_A_COURSE = "Pick a course first";
/** The course control on no course: what he sends sets something new up
 *  by conversation, a course or a self-study. */
export const NEW_LEARNING = "New course or self-study";
/** The composer's prompt there. */
export const NEW_LEARNING_PLACEHOLDER = "Name a course you're taking, or something you want to learn";

/** What the engine said, as the composer needs it. */
export type CourseState =
	| { status: "loading" }
	| { status: "unavailable"; reason: string }
	| { status: "ready"; courses: CourseSummary[]; roots: string[] };

export interface CourseChoice {
	state: CourseState;
	/** The picked course's workspace; "" when none is picked. */
	workspace: string;
	/** Why the last send was blocked, until the learner acts on it. */
	notice: string | null;
	/** How many sends were blocked for want of a course; each one opens the
	 *  picker. */
	asked: number;
	choose: (workspace: string) => void;
	/** A course the New course dialog just created: listed and picked. */
	add: (course: CourseSummary) => void;
	/** A course renamed here: its new title shows at once. */
	renamed: (workspace: string, title: string) => void;
	/** A course deleted here: it leaves the list, and the pick if it held it. */
	removed: (workspace: string) => void;
	/** The picked workspace, or null after showing why nothing can start. */
	requireCourse: () => string | null;
}

export function unavailableMessage(reason: string): string {
	return `Courses are unavailable: ${reason}`;
}

let asking: Promise<CourseListing> | null = null;

/** The engine's course list. Callers that ask while a request is in flight
 *  share it (Today's composer and the sidebar mount together, each asking
 *  `plan --all`); the next ask after it settles reads fresh. */
export function fetchCourses(): Promise<CourseListing> {
	if (!asking) {
		const request = fetch("/api/courses").then((r) => r.json() as Promise<CourseListing>);
		asking = request;
		void request.catch(() => {}).finally(() => {
			asking = null;
		});
	}
	return asking;
}

/** The engine's courses and the picked one. `remember` restores and stores
 *  the last pick; the link banner turns it off, because an old session's
 *  course is not the one last studied. */
export function useCourseChoice({ remember = true }: { remember?: boolean } = {}): CourseChoice {
	const [state, setState] = useState<CourseState>({ status: "loading" });
	const [workspace, setWorkspace] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	const [asked, setAsked] = useState(0);
	const [revision, setRevision] = useState(0);
	useEffect(() => {
		let live = true;
		void fetchCourses()
			.then((listing) => {
				if (!live) return;
				if (!listing.available) {
					setState({ status: "unavailable", reason: listing.reason });
					return;
				}
				setState({ status: "ready", courses: listing.courses, roots: listing.roots });
				const remembered = remember ? localStorage.getItem(COURSE_CHOICE_KEY) ?? "" : "";
				setWorkspace((picked) => {
					if (picked) return listing.courses.some((c) => c.workspace === picked) ? picked : "";
					return listing.courses.some((c) => c.workspace === remembered) ? remembered : "";
				});
			})
			.catch(() => {
				if (live) setState({ status: "unavailable", reason: "the course list could not be loaded" });
			});
		return () => {
			live = false;
		};
	}, [remember, revision]);
	// Another window created, renamed or deleted a course.
	useServerEvent("courses-changed", () => setRevision((n) => n + 1));
	const choose = (next: string) => {
		setWorkspace(next);
		setNotice(null);
		if (remember) localStorage.setItem(COURSE_CHOICE_KEY, next);
	};
	const add = (course: CourseSummary) => {
		setState((s) => (s.status === "ready" ? { ...s, courses: [...s.courses, course] } : s));
		choose(course.workspace);
	};
	const renamed = (target: string, title: string) => {
		setState((s) => (s.status === "ready" ? { ...s, courses: s.courses.map((c) => (c.workspace === target ? { ...c, title } : c)) } : s));
	};
	const removed = (target: string) => {
		setState((s) => (s.status === "ready" ? { ...s, courses: s.courses.filter((c) => c.workspace !== target) } : s));
		if (workspace === target) {
			setWorkspace("");
			if (remember) localStorage.removeItem(COURSE_CHOICE_KEY);
		}
	};
	const requireCourse = () => {
		if (state.status === "ready" && workspace) return workspace;
		setNotice(state.status === "unavailable" ? unavailableMessage(state.reason) : PICK_A_COURSE);
		if (state.status === "ready") setAsked((n) => n + 1);
		return null;
	};
	return { state, workspace, notice, asked, choose, add, renamed, removed, requireCourse };
}

/** The composer toolbar's course chip. The host shows the unavailable line
 *  and the notice under the composer. Nothing while the engine is being
 *  asked or when no course can be picked. In a composer (`newLearning`),
 *  New course or self-study takes the chip off every course, so what he
 *  sends sets something new up by conversation (22 Nov 2026: it replaces
 *  the New course form). */
export function CourseControl({ choice, newLearning = true }: { choice: CourseChoice; newLearning?: boolean }) {
	const [managing, setManaging] = useState<{ action: "rename" | "delete"; course: CourseSummary } | null>(null);
	const { state } = choice;
	if (state.status === "loading") return null;
	if (state.status === "unavailable") return null;
	return (
		<>
			<CoursePicker
				courses={state.courses}
				workspace={choice.workspace}
				onChange={choice.choose}
				{...(newLearning ? { onNew: () => choice.choose("") } : {})}
				onManage={(action, course) => setManaging({ action, course })}
				asked={choice.asked}
			/>
			<RenameCourseDialog
				course={managing?.action === "rename" ? managing.course : null}
				onClose={() => setManaging(null)}
				onRenamed={(title) => {
					if (managing) choice.renamed(managing.course.workspace, title);
					setManaging(null);
				}}
			/>
			<DeleteCourseDialog
				course={managing?.action === "delete" ? managing.course : null}
				onClose={() => setManaging(null)}
				onDeleted={() => {
					if (managing) choice.removed(managing.course.workspace);
					setManaging(null);
				}}
			/>
		</>
	);
}

/** No lesson exists outside a course, so this line replaces the picker and
 *  every send is blocked with the same words. */
export function CoursesUnavailable({ reason }: { reason: string }) {
	return (
		<p role="alert" data-testid="courses-unavailable" className="text-body text-muted-foreground">
			<span className="text-danger">{unavailableMessage(reason)}.</span> If the engine is not found, set
			LH_LEARNING_ENGINE to its folder and LH_LEARNING_PYTHON to its Python, then restart.
		</p>
	);
}

/** The course chip: which course record the session studies from and saves
 *  into. The courses as one choice, then New course or self-study (when
 *  `onNew` is given), then Rename and Delete for the picked course. No due
 *  counts: Today says what is waiting, in words. */
export function CoursePicker({ courses, workspace, onChange, onNew, onManage, asked = 0 }: {
	courses: readonly CourseSummary[];
	workspace: string;
	onChange: (workspace: string) => void;
	/** Takes the chip off every course: something new is set up. */
	onNew?: () => void;
	/** Rename or Delete the picked course. */
	onManage?: (action: "rename" | "delete", course: CourseSummary) => void;
	/** A change opens the menu (a send blocked for want of a course). */
	asked?: number;
}) {
	const picked = courses.find((c) => c.workspace === workspace);
	const [open, setOpen] = useState(false);
	// The menu closed, chosen or let go with Esc: focus goes on to the
	// composer's field, where he types his question next, not back to this
	// chip (focus-home.ts; round 7: Esc left it on the chip).
	const triggerRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (asked > 0) setOpen(true);
	}, [asked]);
	useEffect(() => {
		const onPick = (e: Event) => {
			e.preventDefault();
			setOpen(true);
		};
		const name = kbdEventForAction("pick-course");
		window.addEventListener(name, onPick);
		// ⌘O pressed while this page was on its way (⌘N, then ⌘O; held-asks.ts).
		if (takeHeld("pick-course")) setOpen(true);
		return () => window.removeEventListener(name, onPick);
	}, []);
	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				ref={triggerRef}
				data-testid="course-picker"
				data-slot="composer-chip"
				aria-label="Course"
				className={cn(
					"flex h-8 min-w-0 items-center gap-1.5 rounded-full px-3 text-body outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-fill-hover motion-reduce:transition-none",
					picked ? "text-foreground" : "text-muted-foreground",
				)}
			>
				<GraduationCapIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				<span className="max-w-[16rem] truncate">{picked ? courseLabel(picked) : onNew ? NEW_LEARNING : "Pick a course"}</span>
				<ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-64"
				data-testid="course-menu"
				onCloseAutoFocus={(e) => {
					const field = triggerRef.current?.closest('[data-testid="composer"]')?.querySelector("textarea");
					if (!field) return;
					e.preventDefault();
					field.focus();
				}}
			>
				{courses.length > 0 && (
					<>
						<DropdownMenuRadioGroup value={picked ? workspace : ""} onValueChange={onChange}>
							{courses.map((c) => (
								<DropdownMenuRadioItem key={c.workspace} value={c.workspace} data-testid="course-option">
									<span className="min-w-0 flex-1 truncate">{courseLabel(c)}</span>
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
						<DropdownMenuSeparator />
					</>
				)}
				{onNew && (
					<DropdownMenuItem onSelect={onNew} data-testid="course-new">
						<PlusIcon aria-hidden="true" />
						{NEW_LEARNING}
					</DropdownMenuItem>
				)}
				{picked && onManage && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => onManage("rename", picked)} data-testid="course-rename">
							<PencilIcon aria-hidden="true" />
							<span className="min-w-0 flex-1 truncate">Rename {courseLabel(picked)}…</span>
						</DropdownMenuItem>
						<DropdownMenuItem variant="destructive" onSelect={() => onManage("delete", picked)} data-testid="course-delete">
							<Trash2Icon aria-hidden="true" />
							<span className="min-w-0 flex-1 truncate">Delete {courseLabel(picked)}…</span>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
