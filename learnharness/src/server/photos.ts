import { detectSupportedImageMimeType, processImage } from "../agent/image-processing/index.ts";
import { ChatInputError, type ChatInput, type UserSteerInput } from "../core/input-events.ts";
import { PHOTO_MAX_UPLOAD_CHARS, type Photo } from "../core/photos.ts";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The words a refused photo gets, in the dock's error line. */
export const PHOTO_UNREADABLE = "This photo could not be read. Try a JPEG or PNG.";

/**
 * A photo from the browser, made safe for the record and the model: its
 * real type read from its bytes (never the claimed one), then resized under
 * the inline image limit (image-processing). The browser already resized
 * it; this is the trust boundary, so a refused photo is an honest 400.
 */
export async function preparePhoto(photo: Photo): Promise<Photo> {
	const bytes = Buffer.from(photo.data, "base64");
	const mimeType = detectSupportedImageMimeType(bytes);
	if (!mimeType) throw new ChatInputError(PHOTO_UNREADABLE);
	const processed = await processImage(bytes, mimeType);
	if (!processed.ok) throw new ChatInputError(PHOTO_UNREADABLE);
	return { type: "image", data: processed.data, mimeType: processed.mimeType };
}

/** The input with its photos prepared; inputs without photos pass as they are. */
export async function preparePhotos<T extends ChatInput | UserSteerInput>(input: T): Promise<T> {
	const photos = "photos" in input ? input.photos : undefined;
	if (!photos?.length) return input;
	return { ...input, photos: await Promise.all(photos.map(preparePhoto)) };
}

/** An iPhone photo's container (HEIC/HEIF), read from its first bytes:
 *  `ftyp` and a HEIF brand. Pure. */
export function isHeic(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false;
	const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
	return text(4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(text(8, 12));
}

/** The largest photo the conversion takes, in bytes: the upload ceiling's
 *  decoded size. */
const HEIC_MAX_BYTES = Math.floor((PHOTO_MAX_UPLOAD_CHARS * 3) / 4);

/**
 * A HEIC photo as JPEG (round 8: a photo AirDropped from his phone arrives
 * as HEIC, which the browser cannot open). macOS converts it with its own
 * `sips`; elsewhere, or for anything that is not HEIC, there is no JPEG
 * and the photo is refused in the usual words.
 */
export async function heicToJpeg(bytes: Uint8Array, sips = "/usr/bin/sips"): Promise<Buffer | null> {
	if (!isHeic(bytes) || bytes.length > HEIC_MAX_BYTES) return null;
	const dir = await mkdtemp(join(tmpdir(), "lh-heic-"));
	try {
		const from = join(dir, "photo.heic");
		const to = join(dir, "photo.jpg");
		await writeFile(from, bytes);
		const converted = await new Promise<boolean>((resolve) => {
			execFile(sips, ["-s", "format", "jpeg", from, "--out", to], (error) => resolve(!error));
		});
		return converted ? await readFile(to) : null;
	} catch {
		return null;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
