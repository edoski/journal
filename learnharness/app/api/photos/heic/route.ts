import { heicToJpeg, PHOTO_UNREADABLE } from "@/src/server";

/** A HEIC photo's bytes in, the same photo as JPEG out (round 8): the
 *  browser cannot open an iPhone's HEIC, so the photo box sends it here
 *  before resizing it like any other photo. 415 when it cannot be
 *  converted. */
export async function POST(req: Request) {
	const jpeg = await heicToJpeg(new Uint8Array(await req.arrayBuffer()));
	if (!jpeg) return Response.json({ error: PHOTO_UNREADABLE }, { status: 415 });
	return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}
