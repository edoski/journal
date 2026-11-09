"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, GraduationCapIcon } from "lucide-react";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import { useDesignVariant } from "@/components/design-variant";
import { MenuShell } from "@/components/menu-shell";
import { MENU_ITEM, MENU_ITEM_SELECTED, MENU_SURFACE } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { Input, inputVariants } from "@/components/ui/input";
import { DialogContent, DialogFooter, DialogHeader, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
export function CourseControl({ choice, variant = "current" }: {
	choice: CourseChoice;
	/** "proposed": the composer toolbar's chip only; the host shows the
	 *  unavailable line and the notice under the composer. */
	variant?: "current" | "proposed";
}) {
	const [creating, setCreating] = useState(false);
	const { state } = choice;
	if (state.status === "loading") return null;
	if (state.status === "unavailable") return variant === "proposed" ? null : <CoursesUnavailable reason={state.reason} />;
	return (
		<>
			<CoursePicker
				courses={state.courses}
				workspace={choice.workspace}
				onChange={choice.choose}
				onNew={() => setCreating(true)}
				variant={variant}
			/>
			{choice.notice && variant === "current" && (
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
export function CoursesUnavailable({ reason, variant = "current" }: { reason: string; variant?: "current" | "proposed" }) {
	if (variant === "proposed") {
		return (
			<p role="alert" data-testid="courses-unavailable" className="text-row text-muted-foreground">
				<span className="text-danger">{unavailableMessage(reason)}.</span> If the engine is not found, set
				LH_LEARNING_ENGINE to its folder and LH_LEARNING_PYTHON to its Python, then restart.
			</p>
		);
	}
	return (
		<p role="alert" data-testid="courses-unavailable" className="font-ui text-xs text-destructive">
			{unavailableMessage(reason)}.{" "}
			<span className="text-muted-foreground">
				If the engine is not found, set LH_LEARNING_ENGINE to its folder and LH_LEARNING_PYTHON to its Python, then restart.
			</span>
		</p>
	);
}

/** The course pill: which course record the session studies from and saves
 *  into. The last entry opens the New course dialog. */
export function CoursePicker({ courses, workspace, onChange, onNew, variant = "current" }: {
	courses: readonly CourseSummary[];
	workspace: string;
	onChange: (workspace: string) => void;
	onNew: () => void;
	/** "proposed": a quiet 32px pill for the composer toolbar. */
	variant?: "current" | "proposed";
}) {
	const picked = courses.find((c) => c.workspace === workspace);
	return (
		<label
			data-testid="course-picker"
			data-slot={variant === "proposed" ? "composer-chip" : undefined}
			className={
				variant === "proposed"
					? "relative flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-row transition-colors hover:bg-fill-hover hover:text-foreground has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-ring motion-reduce:transition-none " +
						(picked ? "text-foreground" : "text-muted-foreground")
					: "relative flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-ui text-xs transition-colors hover:bg-accent " +
						(picked ? "border-border bg-card text-foreground" : "border-dashed border-border/80 text-muted-foreground hover:text-foreground")
			}
		>
			<GraduationCapIcon aria-hidden="true" className={variant === "proposed" ? "size-4 shrink-0 text-muted-foreground" : "size-3.5 text-muted-foreground"} />
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

/** The New course dialog's study root under the Proposed design: a field
 *  that opens the shared menu (components/ui/menu.md) at its own width.
 *  An open menu takes the first Esc, so the dialog closes only on the next. */
function RootMenuField({ roots, value, onChange }: { roots: readonly string[]; value: string; onChange: (root: string) => void }) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const close = useCallback((refocus: boolean) => {
		setOpen(false);
		if (refocus) triggerRef.current?.focus();
	}, []);
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopPropagation();
			close(true);
		};
		const onPointerDown = (e: PointerEvent) => {
			const t = e.target;
			if (t instanceof Node && triggerRef.current?.contains(t)) return;
			if (t instanceof Element && t.closest("[data-lh-menu]")) return;
			close(false);
		};
		document.addEventListener("keydown", onKeyDown, true);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown, true);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [open, close]);
	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				disabled={roots.length === 0}
				title={value || undefined}
				data-testid="new-course-root"
				onClick={() => setOpen((o) => !o)}
				onKeyDown={(e) => {
					if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
					e.preventDefault();
					setOpen(true);
				}}
				className={cn(inputVariants(), "flex items-center gap-2 text-left font-normal hover:bg-fill-hover")}
			>
				<span className="min-w-0 flex-1 truncate">{value ? rootLabel(value) : "No study root"}</span>
				<ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
			</button>
			{open && (
				<MenuShell anchorRef={triggerRef} testid="new-course-root-menu" preferredSide="down" align="left" matchAnchorWidth menuClass={MENU_SURFACE}>
					{roots.map((r) => (
						<button
							key={r}
							type="button"
							title={r}
							data-testid="new-course-root-option"
							onClick={() => {
								onChange(r);
								close(true);
							}}
							className={cn(MENU_ITEM, "justify-between", r === value && MENU_ITEM_SELECTED)}
						>
							<span className="min-w-0 truncate">{rootLabel(r)}</span>
							{r === value && <CheckIcon aria-hidden className="size-3.5! text-muted-foreground" />}
						</button>
					))}
				</MenuShell>
			)}
		</>
	);
}

/** The New course form: a title and the study root it goes in. The server
 *  creates `<root>/<slug>` and has the engine make it a course. */
export function NewCourseBody({ roots, onClose, onCreated, fetchLike = fetch, variant = "current" }: {
	roots: readonly string[];
	onClose: () => void;
	onCreated: (course: CourseSummary) => void;
	fetchLike?: typeof fetch;
	/** "proposed": the shared dialog anatomy (components/ui/dialog.md). */
	variant?: "current" | "proposed";
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
	if (variant === "proposed") {
		return (
			<DialogOverlay {...backdropDismiss}>
				<DialogContent aria-label="New course" data-testid="new-course-dialog" className="max-w-md">
					<form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
						<DialogHeader>
							<DialogTitle>New course</DialogTitle>
						</DialogHeader>
						<label className="flex flex-col gap-2 text-row font-medium text-foreground">
							Title
							<Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required data-testid="new-course-title" className="font-normal" />
						</label>
						<label className="flex flex-col gap-2 text-row font-medium text-foreground">
							Study root
							<RootMenuField roots={roots} value={root} onChange={setRoot} />
						</label>
						{roots.length === 0 && (
							<p className="text-row text-muted-foreground">
								No study root is known yet: register a first course with the engine&apos;s <code>study init</code>.
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
			</DialogOverlay>
		);
	}
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

export function NewCourseDialog(props: { roots: readonly string[]; onClose: () => void; onCreated: (course: CourseSummary) => void }) {
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
	const variant = useDesignVariant();
	if (typeof document === "undefined") return null;
	return createPortal(<NewCourseBody {...props} variant={variant} />, document.body);
}
