"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FileTextIcon, FolderIcon, GlobeIcon, LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react";
import type { ContextFile, ContextFolder, ContextWebsite, CourseContext } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { mapStatusWords, useMapStatus } from "@/components/course-map-status";
import { sendMaterial } from "@/components/course-manage-dialogs";
import { useCourseContext, type CourseContextApi } from "@/components/course-context/use-course-context";
import { cn } from "@/lib/utils";

/** The Electron shell's folder picker (electron/preload.cjs); absent in a
 *  browser, where the folder's path is typed instead. */
function folderPicker(): (() => Promise<string | null>) | undefined {
	return typeof window === "undefined" ? undefined : (window as unknown as { lh?: { pickFolder?: () => Promise<string | null> } }).lh?.pickFolder;
}

/** A path as he would say it: his home folder as ~. */
export const homePath = (p: string): string => p.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");

/**
 * Context (spec: course-context.md): a sheet at the window's right edge
 * with what the tutor and the course map read about the course: a
 * description in his words, the folders on his Mac linked to it, websites,
 * and the files added to it. Opening a row opens the folder in Finder, the
 * file in its app or the website in the browser; the cross unlinks it.
 */
export function ContextSheet({ course, open, onOpenChange }: { course: { workspace: string; title: string }; open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent data-slot="context-sheet" className="max-w-[26rem]">
				<SheetHeader>
					<SheetTitle>Context</SheetTitle>
					<SheetDescription>What the tutor and the course map read about {course.title}.</SheetDescription>
				</SheetHeader>
				{open && <ContextBody workspace={course.workspace} />}
			</SheetContent>
		</Sheet>
	);
}

function ContextBody({ workspace }: { workspace: string }) {
	const api = useCourseContext(workspace);
	const { read } = api;
	return (
		<div data-slot="context-body" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6 [scrollbar-width:none]">
			{read.status === "loading" && <p className="text-row text-muted-foreground">Reading the course…</p>}
			{read.status === "failed" && <p className="text-row text-danger">The course’s context could not be read. Close and open it again.</p>}
			{read.status === "ready" && (
				<>
					<Description key={read.context.description} context={read.context} api={api} />
					<Folders folders={read.context.folders} api={api} />
					<Websites websites={read.context.websites} api={api} />
					<Files workspace={workspace} files={read.context.files} api={api} />
					<MapLine workspace={workspace} />
				</>
			)}
		</div>
	);
}

function Section({ title, hint, action, children, slot }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; slot: string }) {
	return (
		<section data-slot={slot} className="flex flex-col gap-2">
			<div className="flex min-h-6 items-center justify-between gap-2">
				<h3 className="text-label font-medium text-muted-foreground">{title}</h3>
				{action}
			</div>
			{hint && <p className="text-label text-muted-foreground">{hint}</p>}
			{children}
		</section>
	);
}

function Problem({ error }: { error: string | null }) {
	return error ? (
		<p role="alert" className="text-label text-danger">
			{error}
		</p>
	) : null;
}

/** The description: saved when he leaves the field, and on ⌘↩. */
function Description({ context, api }: { context: CourseContext; api: CourseContextApi }) {
	const [text, setText] = useState(context.description);
	const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
	const [error, setError] = useState<string | null>(null);
	const save = async () => {
		if (text.trim() === context.description.trim()) return;
		setState("saving");
		const failure = await api.describe(text);
		setError(failure);
		setState(failure ? "idle" : "saved");
	};
	return (
		<Section slot="context-description" title="About this course" action={state !== "idle" && <span className="text-label text-muted-foreground">{state === "saving" ? "Saving…" : "Saved"}</span>}>
			<Textarea
				value={text}
				onChange={(e) => {
					setText(e.target.value);
					setState("idle");
				}}
				onBlur={() => void save()}
				onKeyDown={(e) => {
					if (e.key === "Enter" && e.metaKey) void save();
				}}
				placeholder="What the course is, how the exam works, what to focus on."
				aria-label="About this course"
				className="max-h-48 min-h-20 resize-none"
			/>
			<Problem error={error} />
		</Section>
	);
}

/** One linked thing: its mark, its name and where it is, the whole row
 *  opening it; the cross, shown on hover or focus, unlinks it. */
function Row({ icon, title, where, href, onOpen, onRemove, slot }: { icon: ReactNode; title: string; where: string; href?: string; onOpen?: () => void; onRemove: () => void; slot: string }) {
	const face = (
		<>
			{icon}
			<span className="min-w-0 truncate text-row text-foreground">{title}</span>
			<span className="min-w-0 flex-1 truncate text-label text-muted-foreground">{where}</span>
		</>
	);
	const press = "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring";
	return (
		<li data-slot={slot} className="group/row flex min-w-0 items-center gap-1">
			{href ? (
				<a href={href} target="_blank" rel="noreferrer" className={press}>
					{face}
				</a>
			) : (
				<button type="button" onClick={onOpen} className={press}>
					{face}
				</button>
			)}
			<Button type="button" variant="quiet" size="icon-inline" aria-label={`Unlink ${title}`} onClick={onRemove} className="opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100">
				<XIcon aria-hidden />
			</Button>
		</li>
	);
}

const MARK = "size-4 shrink-0 text-muted-foreground";

/** A small field and its button, on one line: a folder's path in a
 *  browser, a website's address. */
function AddField({ placeholder, label, onAdd, slot, onDone }: { placeholder: string; label: string; onAdd: (value: string) => Promise<string | null>; slot: string; onDone: () => void }) {
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		if (!value.trim() || busy) return;
		setBusy(true);
		const failure = await onAdd(value);
		setBusy(false);
		setError(failure);
		if (!failure) onDone();
	};
	return (
		<form onSubmit={(e) => void submit(e)} data-slot={slot} className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2">
				<Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus disabled={busy} className="h-8 flex-1" />
				<Button type="submit" size="sm" disabled={!value.trim() || busy}>
					{busy ? "Adding…" : label}
				</Button>
			</div>
			<Problem error={error} />
		</form>
	);
}

function AddButton({ children, onClick, slot, disabled }: { children: ReactNode; onClick: () => void; slot: string; disabled?: boolean }) {
	return (
		<Button type="button" variant="quiet" size="xs" data-slot={slot} onClick={onClick} disabled={disabled} className="text-muted-foreground">
			<PlusIcon aria-hidden />
			{children}
		</Button>
	);
}

function useRemove(api: CourseContextApi) {
	const [error, setError] = useState<string | null>(null);
	return { error, setError, remove: async (handle: string) => setError(await api.remove(handle)), open: async (handle: string) => setError(await api.open(handle)) };
}

function Folders({ folders, api }: { folders: readonly ContextFolder[]; api: CourseContextApi }) {
	const [typing, setTyping] = useState(false);
	const [busy, setBusy] = useState(false);
	const rows = useRemove(api);
	const pick = folderPicker();
	const link = async () => {
		if (!pick) return setTyping(true);
		const folder = await pick();
		if (!folder) return;
		setBusy(true);
		rows.setError(await api.linkFolder(folder));
		setBusy(false);
	};
	return (
		<Section
			slot="context-folders"
			title="Folders"
			hint={folders.length === 0 && !typing ? "Link the folders on your Mac where you keep this course’s notes and slides. New files in them are read as you add them." : undefined}
			action={<AddButton slot="context-link-folder" onClick={() => void link()} disabled={busy}>{busy ? "Linking…" : "Link a folder"}</AddButton>}
		>
			{folders.length > 0 && (
				<ul className="-mx-2 flex flex-col">
					{folders.map((f) => (
						<Row key={f.handle} slot="context-folder" icon={<FolderIcon aria-hidden className={MARK} />} title={f.title} where={homePath(f.path.slice(0, -f.title.length - 1)) || "/"} onOpen={() => void rows.open(f.handle)} onRemove={() => void rows.remove(f.handle)} />
					))}
				</ul>
			)}
			{typing && <AddField slot="context-folder-path" placeholder="The folder’s path, such as ~/Uni/Probability" label="Link" onAdd={api.linkFolder} onDone={() => setTyping(false)} />}
			<Problem error={rows.error} />
		</Section>
	);
}

function Websites({ websites, api }: { websites: readonly ContextWebsite[]; api: CourseContextApi }) {
	const [typing, setTyping] = useState(false);
	const rows = useRemove(api);
	return (
		<Section
			slot="context-websites"
			title="Websites"
			hint={websites.length === 0 && !typing ? "The course’s page, lecture notes online, a textbook’s site." : undefined}
			action={<AddButton slot="context-add-website" onClick={() => setTyping(true)}>Add a website</AddButton>}
		>
			{websites.length > 0 && (
				<ul className="-mx-2 flex flex-col">
					{websites.map((w) => (
						<Row key={w.handle} slot="context-website" icon={<GlobeIcon aria-hidden className={MARK} />} title={w.title} where={w.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} href={w.url} onRemove={() => void rows.remove(w.handle)} />
					))}
				</ul>
			)}
			{typing && <AddField slot="context-website-address" placeholder="Web address" label="Add" onAdd={api.addWebsite} onDone={() => setTyping(false)} />}
			<Problem error={rows.error} />
		</Section>
	);
}

/** The files added to the course one by one (Add material's), copied into
 *  its folder; Add files sends more the same way. */
function Files({ workspace, files, api }: { workspace: string; files: readonly ContextFile[]; api: CourseContextApi }) {
	const input = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const rows = useRemove(api);
	const add = async (list: FileList | null) => {
		const chosen = Array.from(list ?? []).filter((f) => !f.name.startsWith("."));
		if (chosen.length === 0) return;
		setBusy(true);
		rows.setError(await sendMaterial(fetch, workspace, [{ kind: "files", files: chosen }]));
		setBusy(false);
		if (input.current) input.current.value = "";
	};
	return (
		<Section
			slot="context-files"
			title="Files"
			hint={files.length === 0 ? "Slides, notes or past papers. They are copied into the course." : undefined}
			action={
				<AddButton slot="context-add-files" onClick={() => input.current?.click()} disabled={busy}>
					{busy ? "Adding…" : "Add files"}
				</AddButton>
			}
		>
			<input ref={input} type="file" multiple hidden onChange={(e) => void add(e.target.files)} data-slot="context-file-input" />
			{files.length > 0 && (
				<ul className="-mx-2 flex flex-col">
					{files.map((f) => (
						<Row key={f.handle} slot="context-file" icon={<FileTextIcon aria-hidden className={MARK} />} title={f.title} where={homePath(f.path)} onOpen={() => void rows.open(f.handle)} onRemove={() => void rows.remove(f.handle)} />
					))}
				</ul>
			)}
			<Problem error={rows.error} />
		</Section>
	);
}

/** While the map reads new material, or when its last build failed: one
 *  line saying so, with Try again after a failure. */
function MapLine({ workspace }: { workspace: string }) {
	const { status, retry } = useMapStatus(workspace);
	const [shown, setShown] = useState(false);
	useEffect(() => {
		if (status?.state === "building") setShown(true);
	}, [status?.state]);
	if (!status || (status.state !== "building" && status.state !== "failed" && !shown)) return null;
	const words = mapStatusWords(status);
	return (
		<p role="status" data-slot="context-map" className={cn("flex items-start gap-2 text-label", status.state === "failed" ? "text-danger" : "text-muted-foreground")}>
			{status.state === "building" && <LoaderCircleIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />}
			<span>
				{words.text}
				{words.retry && status.state === "failed" && (
					<Button type="button" variant="quiet" size="xs" onClick={retry} className="ml-1 text-link hover:text-link">
						Try again
					</Button>
				)}
			</span>
		</p>
	);
}
