/**
 * Photos of the learner's handwritten working (14 Nov 2026): he hands in
 * paper working as a photo with any answer (the composer, a check's
 * answer, the practice problem's thinking) and the tutor marks it.
 *
 * A photo rides the record as pi's own image part, so the model reads it
 * through the path images already take, and a reload, a resume and the
 * markdown export show it from the record alone. It is evidence for the
 * grade, never a field the engine records. Pure and browser-safe.
 */

import type { ImageContent } from "@earendil-works/pi-ai";

/** One photo: pi's image part (base64 bytes, no data: prefix). */
export type Photo = ImageContent;

/** The types the model reads inline. The browser resizes to JPEG before
 *  sending; PNG, WebP and GIF pass when already small. */
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Photos one answer may carry. A page of working is one photo; a
 *  derivation running over a few pages is a few. */
export const MAX_PHOTOS_PER_ANSWER = 4;

/** The browser's resize: the long edge of a sent photo, in pixels. The
 *  inline image limit (image-processing's 2000px) is the ceiling. */
export const PHOTO_MAX_EDGE = 2000;

/** The upload's ceiling per photo, in base64 characters: a resized photo
 *  is far under it; the server resizes again to the model's own limit. */
export const PHOTO_MAX_UPLOAD_CHARS = 12 * 1024 * 1024;

/** What the model reads beside a photo: what it is and how to treat it.
 *  The doctrine (shared/45-photos.md) carries the marking rules. */
export const WORKING_PHOTO_NOTE = "His handwritten working is attached as a photo: read it and mark it like a typed answer.";

/** The model's word for a photo-only practice submission. */
export const PHOTO_ONLY_TEXT = "(no typed work: the working is in the photo)";

/** The queued line for a photo sent while the tutor writes, with no words. */
export const PHOTO_STEER_LINE = "A photo of your working";

/** The image parts of a message's content, in order. */
export function photosOf(content: unknown): Photo[] {
	if (!Array.isArray(content)) return [];
	return content.filter((part): part is Photo =>
		!!part && typeof part === "object" && (part as { type?: unknown }).type === "image" &&
		typeof (part as { data?: unknown }).data === "string" && typeof (part as { mimeType?: unknown }).mimeType === "string");
}

/** A photo as an <img> source. */
export function photoSrc(photo: Pick<Photo, "data" | "mimeType">): string {
	return `data:${photo.mimeType};base64,${photo.data}`;
}

/** Validate photos off a request body: absent is none; anything else must
 *  be a short list of known image types with base64 bytes. Returns the
 *  photos, or the reason for the honest 400. */
export function parsePhotos(raw: unknown): Photo[] | string {
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) return "photos must be a list";
	if (raw.length > MAX_PHOTOS_PER_ANSWER) return `an answer carries at most ${MAX_PHOTOS_PER_ANSWER} photos`;
	const out: Photo[] = [];
	for (const item of raw) {
		const p = item as { data?: unknown; mimeType?: unknown } | null;
		if (!p || typeof p.data !== "string" || !p.data || typeof p.mimeType !== "string") return "each photo needs data and mimeType";
		if (!(PHOTO_MIME_TYPES as readonly string[]).includes(p.mimeType)) return `a photo must be one of ${PHOTO_MIME_TYPES.join(", ")}`;
		if (p.data.length > PHOTO_MAX_UPLOAD_CHARS) return "a photo is too large";
		if (!/^[A-Za-z0-9+/]+={0,2}$/.test(p.data)) return "a photo's data must be base64";
		out.push({ type: "image", data: p.data, mimeType: p.mimeType });
	}
	return out;
}
