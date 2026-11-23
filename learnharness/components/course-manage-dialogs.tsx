"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDialogSubject } from "@/components/ui/overlay";
import { CourseMapStatus } from "@/components/course-map-status";
import { MaterialField } from "@/components/material-field";
import { addMaterialForm, type MaterialPick } from "@/components/new-course-facts";
import { courseLabel, type CourseSummary } from "@/src/core";

type Course = Pick<CourseSummary, "workspace" | "title"> & Partial<Pick<CourseSummary, "exam">>;

interface CourseDialogProps {
	/** The course it acts on; null = closed. */
	course: Course | null;
	onClose: () => void;
	fetchLike?: typeof fetch;
}

/** One opening of a course dialog, with its own fields, busy and error, so
 *  the next opening starts clean. */
interface OneOpening {
	open: boolean;
	course: Course;
	onClose: () => void;
	fetchLike?: typeof fetch;
}

const UNREACHABLE = "Chiron could not be reached. Check it is running, then try again.";

/** Send one change to /api/courses; null when it landed, else the plain
 *  sentence to show. */
async function change(fetchLike: typeof fetch, method: "PATCH" | "DELETE", body: Record<string, string>): Promise<string | null> {
	try {
		const res = await fetchLike("/api/courses", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
		if (res.ok) return null;
		const answer = (await res.json().catch(() => ({}))) as { error?: string };
		return answer.error ?? "That did not work. Try again.";
	} catch {
		return UNREACHABLE;
	}
}

/** Rename: the title in a field, saved by the engine. The folder keeps its
 *  name, so the course's lessons stay linked. */
export function RenameCourseDialog({ course, ...props }: CourseDialogProps & { onRenamed: (title: string) => void }) {
	const { open, shown, opening } = useDialogSubject(course);
	return shown && <RenameCourse key={opening} open={open} course={shown} {...props} />;
}

function RenameCourse({ open, course, onClose, onRenamed, fetchLike = fetch }: OneOpening & { onRenamed: (title: string) => void }) {
	const [title, setTitle] = useState(courseLabel(course));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const name = title.trim();
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		if (!name || busy) return;
		if (name === courseLabel(course)) return onClose();
		setBusy(true);
		setError(null);
		const failure = await change(fetchLike, "PATCH", { workspace: course.workspace, title: name });
		if (failure === null) return onRenamed(name);
		setError(failure);
		setBusy(false);
	};
	return (
		<Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
			<DialogContent aria-describedby={undefined} data-testid="rename-course-dialog" className="max-w-md">
				<form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle>Rename course</DialogTitle>
					</DialogHeader>
					<label className="flex flex-col gap-2 text-body text-foreground">
						Title
						<Input
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							onFocus={(e) => e.currentTarget.select()}
							autoFocus
							disabled={busy}
							data-testid="rename-course-title"
							className="font-normal"
						/>
					</label>
					{error && <p role="alert" className="text-body text-danger">{error}</p>}
					<DialogFooter className="pt-2">
						<Button type="button" variant="quiet" onClick={onClose} disabled={busy}>
							Cancel
						</Button>
						<Button type="submit" disabled={!name || busy} data-testid="rename-course-save">
							{busy ? "Saving…" : "Rename"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** Delete, after asking: the engine forgets the course, so it leaves every
 *  list. What stays is said in the question, and its exam day only when it
 *  has one (round 17, m25: Calculus I, with no exam, read "exam day"). */
export function DeleteCourseDialog({ course, ...props }: CourseDialogProps & { onDeleted: () => void }) {
	const { open, shown, opening } = useDialogSubject(course);
	return shown && <DeleteCourse key={opening} open={open} course={shown} {...props} />;
}

function DeleteCourse({ open, course, onClose, onDeleted, fetchLike = fetch }: OneOpening & { onDeleted: () => void }) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const run = async () => {
		if (busy) return;
		setBusy(true);
		setError(null);
		const failure = await change(fetchLike, "DELETE", { workspace: course.workspace });
		if (failure === null) return onDeleted();
		setError(failure);
		setBusy(false);
	};
	return (
		<AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
			<AlertDialogContent data-testid="delete-course-dialog">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {courseLabel(course)}?</AlertDialogTitle>
					<AlertDialogDescription>
						{course.exam ? "Its topics, plan and exam day leave" : "Its topics and plan leave"} Home and the calendar. What you studied in it still counts toward your pace, its lessons
						stay in your history, and the files in its folder stay on your Mac.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{error && <p role="alert" className="text-body text-danger">{error}</p>}
				<AlertDialogFooter>
					<Button type="button" variant="quiet" onClick={onClose} disabled={busy}>
						Cancel
					</Button>
					<Button type="button" variant="destructive" onClick={() => void run()} disabled={busy} data-testid="delete-course-confirm">
						{busy ? "Deleting…" : "Delete course"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/** Send picked files to a course (POST /api/courses/material): the server
 *  copies them into its material folder, registers them and extends its
 *  map. Null when they landed, else the plain sentence to show. Add
 *  material and the course page's Context both add files through it. */
export async function sendMaterial(fetchLike: typeof fetch, workspace: string, picks: readonly MaterialPick[]): Promise<string | null> {
	try {
		const res = await fetchLike("/api/courses/material", { method: "POST", body: addMaterialForm({ workspace, picks }) });
		if (res.ok) return null;
		const answer = (await res.json().catch(() => ({}))) as { error?: string };
		return answer.error ?? "The material could not be added. Try again.";
	} catch {
		return UNREACHABLE;
	}
}

/** Add material: New course's material field for a course that exists. The
 *  server copies the files into the course and extends its topic map from
 *  them in the background, which the dialog then follows until Done. */
export function AddMaterialDialog({ course, ...props }: CourseDialogProps) {
	const { open, shown, opening } = useDialogSubject(course);
	return shown && <AddMaterial key={opening} open={open} course={shown} {...props} />;
}

function AddMaterial({ open, course, onClose, fetchLike = fetch }: OneOpening) {
	const [picks, setPicks] = useState<MaterialPick[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [added, setAdded] = useState(false);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		if (picks.length === 0 || busy) return;
		setBusy(true);
		setError(null);
		const failure = await sendMaterial(fetchLike, course.workspace, picks);
		if (failure === null) return setAdded(true);
		setError(failure);
		setBusy(false);
	};
	return (
		<Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
			<DialogContent aria-describedby={undefined} data-testid="add-material-dialog" className="max-w-md">
				{added ? (
					<CourseMapStatus course={course} title={`Material added to ${courseLabel(course)}`} onClose={onClose} fetchLike={fetchLike} />
				) : (
					<form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
						<DialogHeader>
							<DialogTitle>Add material to {courseLabel(course)}</DialogTitle>
						</DialogHeader>
						<div className="flex flex-col gap-2 text-body text-foreground">
							<span className="text-callout font-normal text-muted-foreground">
								Slides, notes or past papers. They are copied into the course, and its topic map grows to cover them.
							</span>
							<MaterialField picks={picks} onChange={setPicks} disabled={busy} />
						</div>
						{error && <p role="alert" className="text-body text-danger">{error}</p>}
						<DialogFooter className="pt-2">
							<Button type="button" variant="quiet" onClick={onClose} disabled={busy}>
								Cancel
							</Button>
							<Button type="submit" disabled={picks.length === 0 || busy} data-testid="add-material-add">
								{busy ? "Adding…" : "Add"}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
