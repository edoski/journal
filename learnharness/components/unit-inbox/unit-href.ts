/** A course workspace as one URL-safe path segment (base64url), and back. */
export function courseSegment(workspace: string): string {
	return btoa(String.fromCharCode(...new TextEncoder().encode(workspace)))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

export function workspaceOf(segment: string): string | null {
	try {
		const bytes = Uint8Array.from(atob(segment.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

/** The unit page's address: `/unit/<course>/<topic>`. */
export function unitHref(workspace: string, handle: string): string {
	return `/unit/${courseSegment(workspace)}/${encodeURIComponent(handle)}`;
}

/** The course page's address: `/unit/<course>`, the parent of each of its
 *  topics' addresses. */
export function courseHref(workspace: string): string {
	return `/unit/${courseSegment(workspace)}`;
}

/** An arc's place on its course page: `/unit/<course>?arc=<handle>`,
 *  which opens the page with that arc unfolded. */
export function arcHref(workspace: string, arc: string): string {
	return `${courseHref(workspace)}?arc=${encodeURIComponent(arc)}`;
}
