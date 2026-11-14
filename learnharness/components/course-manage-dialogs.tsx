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
import { CourseMapStatus } from "@/components/course-map-status";
import { MaterialField } from "@/components/new-course-fields";
import { addMaterialForm, type MaterialPick } from "@/components/new-course-facts";
import { courseLabel, type CourseSummary } from "@/src/core";

type Course = Pick<CourseSummary, "workspace" | "title">;

const UNREACHABLE = "LearnHarness could not be reached. Check it is running, then try again.";

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
export function RenameCourseDialog({ course, onClose, onRenamed, fetchLike = fetch }: {
	course: Course;
	onClose: () => void;
	onRenamed: (title: string) => void;
	fetchLike?: typeof fetch;
}) {
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
		<Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
			<DialogContent aria-describedby={undefined} data-testid="rename-course-dialog" className="max-w-md">
				<form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle>Rename course</DialogTitle>
					</DialogHeader>
					<label className="flex flex-col gap-2 text-row font-medium text-foreground">
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
					{error && <p role="alert" className="text-row text-danger">{error}</p>}
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
 *  list. What stays is said in the question. */
export function DeleteCourseDialog({ course, onClose, onDeleted, fetchLike = fetch }: {
	course: Course;
	onClose: () => void;
	onDeleted: () => void;
	fetchLike?: typeof fetch;
}) {
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
		<AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
			<AlertDialogContent data-testid="delete-course-dialog">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {courseLabel(course)}?</AlertDialogTitle>
					<AlertDialogDescription>
						Its topics, progress, plan and exam day are deleted, and it leaves Home and the calendar. Its lessons stay in your history,
						and the files in its folder stay on your Mac.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{error && <p role="alert" className="text-row text-danger">{error}</p>}
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

/** Add material: New course's material field for a course that exists. The
 *  server copies the files into the course and extends its topic map from
 *  them in the background, which the dialog then follows until Done. */
export function AddMaterialDialog({ course, onClose, fetchLike = fetch }: { course: Course; onClose: () => void; fetchLike?: typeof fetch }) {
	const [picks, setPicks] = useState<MaterialPick[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [added, setAdded] = useState(false);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		if (picks.length === 0 || busy) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetchLike("/api/courses/material", { method: "POST", body: addMaterialForm({ workspace: course.workspace, picks }) });
			if (res.ok) return setAdded(true);
			const answer = (await res.json().catch(() => ({}))) as { error?: string };
			setError(answer.error ?? "The material could not be added. Try again.");
		} catch {
			setError(UNREACHABLE);
		}
		setBusy(false);
	};
	return (
		<Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
			<DialogContent aria-describedby={undefined} data-testid="add-material-dialog" className="max-w-md">
				{added ? (
					<CourseMapStatus course={course} title={`Material added to ${courseLabel(course)}`} onClose={onClose} fetchLike={fetchLike} />
				) : (
					<form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
						<DialogHeader>
							<DialogTitle>Add material to {courseLabel(course)}</DialogTitle>
						</DialogHeader>
						<div className="flex flex-col gap-2 text-row font-medium text-foreground">
							<span className="text-label font-normal text-muted-foreground">
								Slides, notes or past papers. They are copied into the course, and its topic map grows to cover them.
							</span>
							<MaterialField picks={picks} onChange={setPicks} disabled={busy} />
						</div>
						{error && <p role="alert" className="text-row text-danger">{error}</p>}
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
