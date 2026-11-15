/**
 * Round 8 (4 #14): a HEIC photo, as an AirDrop from his phone arrives, is
 * taken: the browser cannot open it, so the app turns it into JPEG on the
 * Mac and the photo box resizes it like any other.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { heicToJpeg, isHeic } from "../src/server/photos.ts";
import { readablePhoto } from "../components/photos.tsx";

const SIPS = "/usr/bin/sips";

test("a HEIC photo becomes a JPEG on the Mac", { skip: !existsSync(SIPS) && "macOS only" }, async () => {
	const dir = mkdtempSync(join(tmpdir(), "lh-heic-test-"));
	try {
		const heic = join(dir, "working.heic");
		execFileSync(SIPS, ["-s", "format", "heic", new URL("../build/icon.png", import.meta.url).pathname, "--out", heic], { stdio: "ignore" });
		const bytes = new Uint8Array(readFileSync(heic));
		assert.equal(isHeic(bytes), true);
		const jpeg = await heicToJpeg(bytes);
		assert.ok(jpeg, "converted");
		assert.equal(jpeg[0], 0xff);
		assert.equal(jpeg[1], 0xd8, "a JPEG's first bytes");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("anything that is not HEIC is not converted", async () => {
	assert.equal(await heicToJpeg(new Uint8Array(readFileSync(new URL("../build/icon.png", import.meta.url)))), null);
});

test("the photo box sends a photo the browser cannot open to be converted, then reads the JPEG", async () => {
	const jpeg = new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" });
	const read = async (file: Blob) => {
		if (file.type !== "image/jpeg") throw new Error("This photo could not be read.");
		return { type: "image" as const, mimeType: "image/jpeg", data: "/9g=" };
	};
	const photo = await readablePhoto(new Blob([new Uint8Array(12)], { type: "image/heic" }), read, async () => new Response(jpeg));
	assert.equal(photo.mimeType, "image/jpeg");
	await assert.rejects(readablePhoto(new Blob([], { type: "application/pdf" }), read, async () => new Response("no", { status: 415 })), /could not be read/);
});
