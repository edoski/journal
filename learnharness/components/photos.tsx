"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ImagePlusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { useSessionMermaid } from "@/components/session-overlay";
import { kbdEventForAction, MAX_PHOTOS_PER_ANSWER, PHOTO_MAX_EDGE, photoSrc, type Photo } from "@/src/core";
import { keepPhotos, keptPhotos } from "@/components/lesson/kept-drafts";

/**
 * Photos of his handwritten working (spec: photos.md): the attach control,
 * the thumbnails waiting to be sent, and the sent strip on his message and
 * answered card. A photo gets in by paste (an iPhone photo copied on the
 * phone pastes here too, through Universal Clipboard), by dropping it on
 * the answer surface, or by the attach button and its shortcut.
 */

/** A photo waiting in an answer field: its id for removal and the photo. */
export interface PendingPhoto {
	id: string;
	photo: Photo;
}

/** The words for a photo that will not open (a PDF, or a HEIC away from a Mac). */
export const PHOTO_UNREADABLE_TEXT = "This photo could not be read. Try a JPEG or PNG.";
/** Shown when a fifth photo would join an answer. */
export const PHOTO_LIMIT_TEXT = "Four photos at most for one answer.";

let nextId = 0;

/** A file as a sent photo: drawn upright on white (a transparent PNG would
 *  turn black in JPEG), its long edge at most PHOTO_MAX_EDGE, as JPEG. */
export async function photoFromFile(file: Blob): Promise<Photo> {
	const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
	try {
		const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error(PHOTO_UNREADABLE_TEXT);
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, width, height);
		ctx.drawImage(bitmap, 0, 0, width, height);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
		if (!blob) throw new Error(PHOTO_UNREADABLE_TEXT);
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error ?? new Error(PHOTO_UNREADABLE_TEXT));
			reader.readAsDataURL(blob);
		});
		return { type: "image", mimeType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
	} finally {
		bitmap.close();
	}
}

/** A file as a sent photo, an iPhone's HEIC included (round 8: a photo
 *  AirDropped from his phone arrives as HEIC, which the browser cannot
 *  open): one the browser cannot read goes to the app to become JPEG
 *  first (`/api/photos/heic`), then is resized like any other. */
export async function readablePhoto(file: Blob, read: (file: Blob) => Promise<Photo> = photoFromFile, convert: (file: Blob) => Promise<Response> = (body) => fetch("/api/photos/heic", { method: "POST", body })): Promise<Photo> {
	try {
		return await read(file);
	} catch (error) {
		const res = await convert(file).catch(() => null);
		if (!res?.ok) throw error;
		return read(await res.blob());
	}
}

/** The image files a paste or a drop carries. */
function imageFiles(list: FileList | null | undefined): File[] {
	return Array.from(list ?? []).filter((file) => file.type.startsWith("image/") || file.type === "");
}

/** One answer field's photos: add (resized), remove, restore after a
 *  refused send, and the paste and drop handlers for its surface. With
 *  `keepAs` (kept-drafts.ts) the waiting photos survive a reload: they
 *  are kept under that box's scope and come back when it mounts. */
export function usePhotoDraft(initial?: readonly PendingPhoto[], keepAs?: string) {
	const [photos, setPhotos] = useState<PendingPhoto[]>(() => [...(initial ?? [])]);
	const [error, setError] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const photosRef = useRef(photos);
	photosRef.current = photos;
	const countRef = useRef(photos.length);
	countRef.current = photos.length;
	// Kept photos join once read; nothing is written over them before then.
	const loadedRef = useRef(!keepAs || (initial?.length ?? 0) > 0);
	useEffect(() => {
		if (!keepAs || loadedRef.current) return;
		let live = true;
		void keptPhotos(keepAs).then((kept) => {
			if (!live) return;
			loadedRef.current = true;
			const back = kept.map((photo) => ({ id: `photo_${++nextId}`, photo }));
			if (back.length) setPhotos((prev) => [...back, ...prev].slice(0, MAX_PHOTOS_PER_ANSWER));
			else if (photosRef.current.length) void keepPhotos(keepAs, photosRef.current.map((p) => p.photo));
		});
		return () => {
			live = false;
		};
	}, [keepAs]);
	useEffect(() => {
		if (!keepAs || !loadedRef.current) return;
		void keepPhotos(keepAs, photos.map((p) => p.photo));
	}, [keepAs, photos]);

	const add = useCallback(async (files: readonly Blob[]) => {
		if (files.length === 0) return;
		setError(null);
		const room = MAX_PHOTOS_PER_ANSWER - countRef.current;
		if (room <= 0) {
			setError(PHOTO_LIMIT_TEXT);
			return;
		}
		if (files.length > room) setError(PHOTO_LIMIT_TEXT);
		const made: PendingPhoto[] = [];
		for (const file of files.slice(0, room)) {
			try {
				made.push({ id: `photo_${++nextId}`, photo: await readablePhoto(file) });
			} catch {
				setError(PHOTO_UNREADABLE_TEXT);
			}
		}
		if (made.length) setPhotos((prev) => [...prev, ...made].slice(0, MAX_PHOTOS_PER_ANSWER));
	}, []);

	const remove = useCallback((id: string) => {
		setError(null);
		setPhotos((prev) => prev.filter((p) => p.id !== id));
	}, []);

	/** Take the photos for a send: the list empties at once. */
	const take = useCallback((): PendingPhoto[] => {
		const taken = photosRef.current;
		photosRef.current = [];
		countRef.current = 0;
		setPhotos([]);
		setError(null);
		return taken;
	}, []);

	const sayLimit = useCallback(() => setError(PHOTO_LIMIT_TEXT), []);

	/** Put back the photos of a send the server refused. */
	const restore = useCallback((back: readonly PendingPhoto[]) => {
		if (back.length) setPhotos((prev) => [...back, ...prev].slice(0, MAX_PHOTOS_PER_ANSWER));
	}, []);

	const onPaste = useCallback((e: ClipboardEvent) => {
		const files = imageFiles(e.clipboardData?.files);
		if (files.length === 0) return;
		e.preventDefault();
		void add(files);
	}, [add]);

	const surface = {
		onPaste,
		onDragOver: (e: DragEvent) => {
			if (!Array.from(e.dataTransfer.types).includes("Files")) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "copy";
			setDragging(true);
		},
		onDragLeave: (e: DragEvent) => {
			if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
			setDragging(false);
		},
		onDrop: (e: DragEvent) => {
			const files = imageFiles(e.dataTransfer.files);
			setDragging(false);
			if (files.length === 0) return;
			e.preventDefault();
			void add(files);
		},
	};

	return { photos, error, dragging, add, remove, take, restore, sayLimit, surface };
}

export type PhotoDraft = ReturnType<typeof usePhotoDraft>;

/** The sent photos as plain photos (the input event's field). */
export function sentPhotos(pending: readonly PendingPhoto[]): Photo[] | undefined {
	return pending.length ? pending.map((p) => p.photo) : undefined;
}

/** The attach button and its hidden file picker. While `active`, the
 *  shortcut (attach-photo) opens the picker; one answer surface is active
 *  at a time. */
export function PhotoAttachButton({ draft, active = true, disabled = false }: { draft: PhotoDraft; active?: boolean; disabled?: boolean }) {
	const inputRef = useRef<HTMLInputElement>(null);
	const full = draft.photos.length >= MAX_PHOTOS_PER_ANSWER;
	const open = useCallback(() => {
		if (disabled) return;
		if (full) {
			draft.sayLimit();
			return;
		}
		inputRef.current?.click();
	}, [disabled, full, draft]);
	const openRef = useRef(open);
	openRef.current = open;
	useEffect(() => {
		if (!active) return;
		const listener = () => openRef.current();
		window.addEventListener(kbdEventForAction("attach-photo"), listener);
		return () => window.removeEventListener(kbdEventForAction("attach-photo"), listener);
	}, [active]);
	return (
		<>
			<Hint label={full ? PHOTO_LIMIT_TEXT : "Attach a photo of your working"} action="attach-photo">
				<Button
					type="button"
					variant="quiet"
					size="icon-row"
					data-testid="photo-attach"
					aria-label="Attach a photo of your working"
					disabled={disabled}
					onClick={open}
					className="rounded-full"
				>
					<ImagePlusIcon />
				</Button>
			</Hint>
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				multiple
				hidden
				data-testid="photo-input"
				onChange={(e) => {
					void draft.add(imageFiles(e.currentTarget.files));
					e.currentTarget.value = "";
				}}
			/>
		</>
	);
}

/** The photos waiting to be sent: a row of thumbnails, each removable, and
 *  the line that says why one did not join. Nothing while empty. */
export function PendingPhotos({ draft, className }: { draft: PhotoDraft; className?: string }) {
	if (draft.photos.length === 0 && !draft.error) return null;
	return (
		<div data-testid="pending-photos" className={cn("flex flex-col gap-1.5 px-4 pt-3", className)}>
			{draft.photos.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{draft.photos.map((p) => (
						<div key={p.id} data-testid="pending-photo" className="group relative">
							<PhotoThumb photo={p.photo} className="size-16" />
							<Hint label="Remove this photo">
								<Button
									type="button"
									variant="quiet"
									size="icon-inline"
									aria-label="Remove this photo"
									data-testid="pending-photo-remove"
									onClick={() => draft.remove(p.id)}
									className="absolute -top-1.5 -right-1.5 size-5 rounded-full border bg-popover hover:bg-accent"
								>
									<XIcon className="size-3" />
								</Button>
							</Hint>
						</div>
					))}
				</div>
			)}
			{draft.error && <p data-testid="photo-error" className="text-callout system-current:text-label text-muted-foreground">{draft.error}</p>}
		</div>
	);
}

/** One photo, cropped square; a click opens it large in the session. */
function PhotoThumb({ photo, className }: { photo: Photo; className?: string }) {
	const overlay = useSessionMermaid();
	const src = photoSrc(photo);
	// eslint-disable-next-line @next/next/no-img-element -- an in-memory photo; no Next image optimization
	const img = <img src={src} alt="Your working" draggable={false} className="size-full object-cover" />;
	const frame = cn("block shrink-0 overflow-hidden rounded-lg border bg-white", className);
	if (!overlay) return <span className={frame}>{img}</span>;
	return (
		<Hint label="Open the photo large">
			<button type="button" data-testid="photo-open" aria-label="Open the photo large" onClick={() => overlay.openPhoto(src)} className={cn(frame, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
				{img}
			</button>
		</Hint>
	);
}

/** The photos he sent, on his message or answered card. */
export function SentPhotos({ photos, className }: { photos: readonly Photo[]; className?: string }) {
	if (photos.length === 0) return null;
	return (
		<div data-testid="sent-photos" className={cn("flex flex-wrap gap-2", className)}>
			{photos.map((photo, i) => (
				<PhotoThumb key={i} photo={photo} className="size-24" />
			))}
		</div>
	);
}
