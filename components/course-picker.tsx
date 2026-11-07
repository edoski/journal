"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { GraduationCapIcon } from "lucide-react";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import { courseLabel, type CourseListing, type CourseSummary } from "@/src/core";

/** Where the last picked course is remembered (per device). */
const COURSE_CHOICE_KEY = "lh:course";
/** The picker's option value that opens the New course dialog. Workspaces
 *  are absolute paths, so it can never name a course. */
const NEW_COURSE = "new";

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
	choose: (workspace: string) => void;
	/** A course the New course dialog just created: listed and picked. */
	add: (course: CourseSummary) => void;
	/** The picked workspace, or null after showing why nothing can start. */
	requireCourse: () => string | null;
}

export function unavailableMessage(reason: string): string {
	return `Courses are unavailable: ${reason}`;
}

/** The engine's courses and the picked one. `remember` restores and stores
 *  the last pick; the link banner turns it off, because an old session's
 *  course is not the one last studied. */
export function useCourseChoice({ remember = true }: { remember?: boolean } = {}): CourseChoice {
	const [state, setState] = useState<CourseState>({ status: "loading" });
	const [workspace, setWorkspace] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		void fetch("/api/courses")
			.then((r) => r.json() as Promise<CourseListing>)
			.then((listing) => {
				if (!live) return;
				if (!listing.available) {
					setState({ status: "unavailable", reason: listing.reason });
					return;
				}
				setState({ status: "ready", courses: listing.courses, roots: listing.roots });
				const remembered = remember ? localStorage.getItem(COURSE_CHOICE_KEY) ?? "" : "";
				if (listing.courses.some((c) => c.workspace === remembered)) setWorkspace(remembered);
			})
			.catch(() => {
				if (live) setState({ status: "unavailable", reason: "the course list could not be loaded" });
			});
		return () => {
			live = false;
		};
	}, [remember]);
	const choose = (next: string) => {
		setWorkspace(next);
		setNotice(null);
		if (remember) localStorage.setItem(COURSE_CHOICE_KEY, next);
	};
	const add = (course: CourseSummary) => {
		setState((s) => (s.status === "ready" ? { ...s, courses: [...s.courses, course] } : s));
		choose(course.workspace);
	};
	const requireCourse = () => {
		if (state.status === "ready" && workspace) return workspace;
		setNotice(state.status === "unavailable" ? unavailableMessage(state.reason) : PICK_A_COURSE);
		return null;
	};
	return { state, workspace, notice, choose, add, requireCourse };
}

/** The composer row's course control: the picker, or one line saying why
 *  no course can be picked. Nothing while the engine is being asked. */
export function CourseControl({ choice }: { choice: CourseChoice }) {
	const [creating, setCreating] = useState(false);
	const { state } = choice;
	if (state.status === "loading") return null;
	if (state.status === "unavailable") return <CoursesUnavailable reason={state.reason} />;
	return (
		<>
			<CoursePicker
				courses={state.courses}
				workspace={choice.workspace}
				onChange={choice.choose}
				onNew={() => setCreating(true)}
			/>
			{choice.notice && (
				<span role="alert" data-testid="course-notice" className="font-ui text-xs text-destructive">
					{choice.notice}
				</span>
			)}
			{creating && (
				<NewCourseDialog
					roots={state.roots}
					onClose={() => setCreating(false)}
					onCreated={(course) => {
						setCreating(false);
						choice.add(course);
					}}
				/>
			)}
		</>
	);
}

/** No lesson exists outside a course, so this line replaces the picker and
 *  every send is blocked with the same words. */
export function CoursesUnavailable({ reason }: { reason: string }) {
	return (
		<p role="alert" data-testid="courses-unavailable" className="font-ui text-xs text-destructive">
			{unavailableMessage(reason)}.{" "}
			<span className="text-muted-foreground">
				Set LH_LEARNING_ENGINE to the learning engine&apos;s folder and LH_LEARNING_PYTHON to its Python, then restart.
			</span>
		</p>
	);
}

/** The course pill: which course record the session studies from and saves
 *  into. The last entry opens the New course dialog. */
export function CoursePicker({ courses, workspace, onChange, onNew }: {
	courses: readonly CourseSummary[];
	workspace: string;
	onChange: (workspace: string) => void;
	onNew: () => void;
}) {
	const picked = courses.find((c) => c.workspace === workspace);
	return (
		<label
			data-testid="course-picker"
			className={
				"relative flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-ui text-xs transition-colors hover:bg-accent " +
				(picked ? "border-border bg-card text-foreground" : "border-dashed border-border/80 text-muted-foreground hover:text-foreground")
			}
		>
			<GraduationCapIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
			<span className="max-w-[16rem] truncate">{picked ? courseLabel(picked) : "Pick a course"}</span>
			<select
				aria-label="Course"
				value={picked ? workspace : ""}
				onChange={(e) => (e.target.value === NEW_COURSE ? onNew() : onChange(e.target.value))}
				className="absolute inset-0 cursor-pointer opacity-0"
			>
				<option value="" disabled hidden>
					Pick a course
				</option>
				{courses.map((c) => (
					<option key={c.workspace} value={c.workspace}>
						{courseLabel(c)}
						{c.due > 0 ? ` (${c.due} due)` : ""}
					</option>
				))}
				<option value={NEW_COURSE}>New course…</option>
			</select>
		</label>
	);
}

/** A root as the dialog shows it: its last two folders. */
function rootLabel(root: string): string {
	return root.split("/").filter(Boolean).slice(-2).join("/");
}

/** The New course form: a title and the study root it goes in. The server
 *  creates `<root>/<slug>` and has the engine make it a course. */
export function NewCourseBody({ roots, onClose, onCreated, fetchLike = fetch }: {
	roots: readonly string[];
	onClose: () => void;
	onCreated: (course: CourseSummary) => void;
	fetchLike?: typeof fetch;
}) {
	const [title, setTitle] = useState("");
	const [root, setRoot] = useState(roots[0] ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const backdropDismiss = useBackdropDismiss(onClose);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		if (!title.trim() || !root || busy) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetchLike("/api/courses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ root, title: title.trim() }),
			});
			const body = (await res.json()) as CourseSummary | { error?: string };
			if (!res.ok) throw new Error("error" in body && body.error ? body.error : "The course could not be created");
			onCreated(body as CourseSummary);
		} catch (err) {
			setError((err as Error).message);
			setBusy(false);
		}
	};
	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="New course"
			data-testid="new-course-dialog"
			className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
			{...backdropDismiss}
		>
			<form
				onSubmit={(e) => void submit(e)}
				onClick={(e) => e.stopPropagation()}
				className="mx-4 w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg"
			>
				<h2 className="text-sm font-semibold text-card-foreground">New course</h2>
				<label className="mt-4 block font-ui text-xs text-muted-foreground">
					Title
					<input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						autoFocus
						required
						data-testid="new-course-title"
						className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
					/>
				</label>
				<label className="mt-3 block font-ui text-xs text-muted-foreground">
					Study root
					<select
						value={root}
						onChange={(e) => setRoot(e.target.value)}
						disabled={roots.length === 0}
						data-testid="new-course-root"
						className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none"
					>
						{roots.map((r) => (
							<option key={r} value={r} title={r}>
								{rootLabel(r)}
							</option>
						))}
					</select>
				</label>
				{roots.length === 0 && (
					<p className="mt-2 text-xs text-muted-foreground">
						No study root is known yet: register a first course with the engine&apos;s <code>study init</code>.
					</p>
				)}
				{error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
				<div className="mt-4 flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded-sm px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						Cancel
					</button>
					<button
						type="submit"
						data-testid="new-course-create"
						disabled={!title.trim() || !root || busy}
						className="rounded-sm border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-40"
					>
						{busy ? "Creating…" : "Create"}
					</button>
				</div>
			</form>
		</div>
	);
}

function NewCourseDialog(props: { roots: readonly string[]; onClose: () => void; onCreated: (course: CourseSummary) => void }) {
	const { onClose } = props;
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopPropagation();
			onClose();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);
	if (typeof document === "undefined") return null;
	return createPortal(<NewCourseBody {...props} />, document.body);
}
