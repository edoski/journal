"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDownIcon, GraduationCapIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogSubject } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { ExamDayField, MaterialField } from "@/components/new-course-fields";
import { DeleteCourseDialog, RenameCourseDialog } from "@/components/course-manage-dialogs";
import { useServerEvent } from "@/components/server-events";
import { CourseMapStatus } from "@/components/course-map-status";
import { newCourseForm, type MaterialPick } from "@/components/new-course-facts";
import { courseLabel, kbdEventForAction, type CourseListing, type CourseSummary } from "@/src/core";

/** Where the last picked course is remembered (per device). */
const COURSE_CHOICE_KEY = "lh:course";

export const PICK_A_COURSE = "Pick a course first";

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
 *  asked or when no course can be picked. */
export function CourseControl({ choice }: { choice: CourseChoice }) {
	const [creating, setCreating] = useState(false);
	const [managing, setManaging] = useState<{ action: "rename" | "delete"; course: CourseSummary } | null>(null);
	// A course made: focus goes on to the composer's field, where he types
	// his first question, never to the page (round 3, 14 Nov 2026).
	const anchorRef = useRef<HTMLSpanElement>(null);
	const focusComposer = (e: Event) => {
		const field = anchorRef.current?.closest('[data-testid="composer"]')?.querySelector("textarea");
		if (!field) return;
		e.preventDefault();
		field.focus();
	};
	const { state } = choice;
	if (state.status === "loading") return null;
	if (state.status === "unavailable") return null;
	return (
		<>
			<span ref={anchorRef} hidden />
			<CoursePicker
				courses={state.courses}
				workspace={choice.workspace}
				onChange={choice.choose}
				onNew={() => setCreating(true)}
				onManage={(action, course) => setManaging({ action, course })}
				asked={choice.asked}
			/>
			<NewCourseDialog
				roots={creating ? state.roots : null}
				onClose={() => setCreating(false)}
				onCreated={(course) => choice.add(course)}
				onCloseAutoFocus={focusComposer}
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
		<p role="alert" data-testid="courses-unavailable" className="text-row text-muted-foreground">
			<span className="text-danger">{unavailableMessage(reason)}.</span> If the engine is not found, set
			LH_LEARNING_ENGINE to its folder and LH_LEARNING_PYTHON to its Python, then restart.
		</p>
	);
}

/** The course chip: which course record the session studies from and saves
 *  into. The courses as one choice, then "New course…", then Rename and
 *  Delete for the picked course. No due counts: Today says what is waiting,
 *  in words. */
export function CoursePicker({ courses, workspace, onChange, onNew, onManage, asked = 0 }: {
	courses: readonly CourseSummary[];
	workspace: string;
	onChange: (workspace: string) => void;
	onNew: () => void;
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
		const onPick = () => setOpen(true);
		const name = kbdEventForAction("pick-course");
		window.addEventListener(name, onPick);
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
					"flex h-8 min-w-0 items-center gap-1.5 rounded-full px-3 text-row outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-fill-hover motion-reduce:transition-none",
					picked ? "text-foreground" : "text-muted-foreground",
				)}
			>
				<GraduationCapIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				<span className="max-w-[16rem] truncate">{picked ? courseLabel(picked) : "Pick a course"}</span>
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
				<DropdownMenuItem onSelect={onNew} data-testid="course-new">
					<PlusIcon aria-hidden="true" />
					New course…
				</DropdownMenuItem>
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

/** A root as the dialog shows it: its last two folders. */
function rootLabel(root: string): string {
	return root.split("/").filter(Boolean).slice(-2).join("/");
}

/** Where the course goes, shown only when more than one folder is known: the shared select at the field's width; the
 *  hint carries the full path. */
function RootSelect({ roots, value, onChange }: { roots: readonly string[]; value: string; onChange: (root: string) => void }) {
	const trigger = (
		<SelectTrigger data-testid="new-course-root" aria-label="Save in" className="w-full font-normal">
			<SelectValue placeholder="Pick a folder" />
		</SelectTrigger>
	);
	return (
		<Select value={value || undefined} onValueChange={onChange}>
			{value ? <Hint label={value}>{trigger}</Hint> : trigger}
			<SelectContent data-testid="new-course-root-menu">
				{roots.map((r) => (
					<SelectItem key={r} value={r} data-testid="new-course-root-option">
						{rootLabel(r)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

/** The New course form in the shared dialog anatomy (components/ui/dialog.md):
 *  a title, the exam day and the material, plus where it goes when more than
 *  one folder is known. The server makes `<root>/<slug>`, copies the
 *  material in, and has the engine make it a course with that exam day and
 *  material. */
export function NewCourseBody({ roots, onClose, onCreated, onCloseAutoFocus, fetchLike = fetch }: {
	roots: readonly string[];
	onClose: () => void;
	onCreated: (course: CourseSummary) => void;
	/** Where focus goes once the dialog closes (the host's field). */
	onCloseAutoFocus?: (e: Event) => void;
	fetchLike?: typeof fetch;
}) {
	const [title, setTitle] = useState("");
	const [root, setRoot] = useState(roots[0] ?? "");
	const [exam, setExam] = useState<string | null>(null);
	const [picks, setPicks] = useState<MaterialPick[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	/** Created with material: the dialog stays to show its map being built. */
	const [created, setCreated] = useState<CourseSummary | null>(null);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		if (!title.trim() || !root || busy) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetchLike("/api/courses", { method: "POST", body: newCourseForm({ title, exam, root, picks }) });
			const body = (await res.json()) as CourseSummary | { error?: string };
			if (!res.ok) throw new Error("error" in body && body.error ? body.error : "The course could not be made. Try again.");
			onCreated(body as CourseSummary);
			if (picks.length > 0) setCreated(body as CourseSummary);
			else onClose();
		} catch (err) {
			setError(err instanceof TypeError ? "LearnHarness could not be reached. Check it is running, then try again." : (err as Error).message);
			setBusy(false);
		}
	};
	if (created) {
		return (
			<DialogContent aria-describedby={undefined} data-testid="new-course-dialog" className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
				<CourseMapStatus course={created} onClose={onClose} fetchLike={fetchLike} />
			</DialogContent>
		);
	}
	const field = "flex flex-col gap-2 text-row font-medium text-foreground";
	return (
		<DialogContent aria-describedby={undefined} data-testid="new-course-dialog" className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
			<form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
				<DialogHeader>
					<DialogTitle>New course</DialogTitle>
				</DialogHeader>
				<label className={field}>
					Title
					<Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required disabled={busy} placeholder="Group Theory" data-testid="new-course-title" className="font-normal" />
				</label>
				<div role="group" aria-labelledby="new-course-exam-label" className={field}>
					<span id="new-course-exam-label">Exam day</span>
					<ExamDayField value={exam} onChange={setExam} disabled={busy} />
				</div>
				<div role="group" aria-labelledby="new-course-material-label" className={field}>
					<span id="new-course-material-label">Course material</span>
					<span className="text-label font-normal text-muted-foreground">Slides, notes or past papers. They are copied into the course, so the tutor can read them.</span>
					<MaterialField picks={picks} onChange={setPicks} disabled={busy} />
				</div>
				{roots.length > 1 && (
					<label className={field}>
						Save in
						<RootSelect roots={roots} value={root} onChange={setRoot} />
					</label>
				)}
				{roots.length === 0 && (
					<p className="text-row text-muted-foreground">
						LearnHarness does not know your courses folder yet. Set up the first course from the Terminal with <code>study init</code>.
					</p>
				)}
				{error && <p role="alert" className="text-row text-danger">{error}</p>}
				<DialogFooter className="pt-2">
					<Button type="button" variant="quiet" onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" data-testid="new-course-create" disabled={!title.trim() || !root || busy}>
						{busy ? "Creating…" : "Create"}
					</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	);
}

export function NewCourseDialog({ roots, ...props }: {
	/** The folders a new course can go in; null = closed. */
	roots: readonly string[] | null;
	onClose: () => void;
	onCreated: (course: CourseSummary) => void;
	onCloseAutoFocus?: (e: Event) => void;
}) {
	const { open, shown, opening } = useDialogSubject(roots);
	return (
		shown && (
			<Dialog open={open} onOpenChange={(next) => !next && props.onClose()}>
				<NewCourseBody key={opening} roots={shown} {...props} />
			</Dialog>
		)
	);
}
