import { detectSupportedImageMimeType, processImage } from "../agent/image-processing/index.ts";
import { ChatInputError, type ChatInput, type UserSteerInput } from "../core/input-events.ts";
import type { Photo } from "../core/photos.ts";

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
