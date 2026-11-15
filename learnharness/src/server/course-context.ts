/**
 * A course's context on the server (spec:
 * components/course-context/course-context.md): reads and writes it in the
 * engine's course record, the one place the tutor and the course map
 * builder read. The description is the record's `goal`; a linked folder,
 * a website and each file are registered `sources`. Linking a folder
 * registers every readable file in it, and the builder reads them; a
 * watch on the folder (an OS event, never a poll) registers the files
 * added later.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CourseRecords } from "../core/ports.ts";
import type { CourseContext } from "../core/contracts/course-context.ts";
import { baseName, citedSources, contextOf, freeHandle, isInside, isWebAddress, siteName, takenHandles, webAddress } from "../core/course-context.ts";
import { subscribe } from "../core/events.ts";

export type ContextResult<T = CourseContext> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409 | 502; error: string };

const UNREACHABLE = "The course record could not be read. Try again.";
const fail = (status: 400 | 404 | 409 | 502, error: string): ContextResult<never> => ({ ok: false, status, error });

const isFolder = (absolute: string): boolean => {
	try {
		return fs.statSync(absolute).isDirectory();
	} catch {
		return false;
	}
};

/** Open a file in its app or a folder in Finder. */
function openOnMac(absolute: string): Promise<void> {
	return new Promise((resolve, reject) => execFile("open", [absolute], (err) => (err ? reject(err) : resolve())));
}

export interface CourseContextDeps {
	courseRecords: CourseRecords;
	/** The course map builder's first-meeting step (`adopt`): run before
	 *  new material is registered, so a course it never met reads only
	 *  the new material. */
	adopt: (workspace: string, except: readonly string[]) => Promise<void>;
	/** Build or extend the course's map from the material no build read. */
	startMap: (workspace: string) => void;
	open?: (absolute: string) => Promise<void>;
}

export interface CourseContexts {
	read(workspace: string): Promise<ContextResult>;
	/** Write the description; an empty one clears it. */
	describe(workspace: string, description: string): Promise<ContextResult>;
	/** Link a folder on his Mac and register the material in it. */
	linkFolder(workspace: string, folder: string): Promise<ContextResult>;
	/** Link a website; `title` is optional. */
	addWebsite(workspace: string, address: string, title?: string): Promise<ContextResult>;
	/** Unlink one item. A folder takes its files with it, except those the
	 *  map cites, which stay registered as files. */
	remove(workspace: string, handle: string): Promise<ContextResult>;
	/** Open a folder in Finder or a file in its app. */
	open(workspace: string, handle: string): Promise<ContextResult<null>>;
	/** Register the files added to the course's linked folders since they
	 *  were last read, and extend the map from them. Returns their paths. */
	syncFolders(workspace: string): Promise<string[]>;
	/** The course's linked folders, absolute. */
	linkedFolders(workspace: string): Promise<string[]>;
}

export function createCourseContexts(deps: CourseContextDeps): CourseContexts {
	const { courseRecords } = deps;
	const open = deps.open ?? openOnMac;

	/** The whole record and the folder relative sources sit in. */
	async function load(workspace: string): Promise<{ record: unknown; directory: string } | null> {
		const [shown, scanned] = await Promise.all([courseRecords.run(workspace, { verb: "show", handles: "all" }), courseRecords.run(workspace, { verb: "sources", scan: true })]);
		if (!shown.ok) return null;
		const directory = scanned.ok && typeof (scanned.json as { directory?: unknown }).directory === "string" ? (scanned.json as { directory: string }).directory : workspace;
		return { record: shown.json, directory };
	}
	const locate = (directory: string) => (registered: string) => (path.isAbsolute(registered) ? registered : path.join(directory, registered));
	const contextFrom = (workspace: string, loaded: { record: unknown; directory: string }) => contextOf(workspace, loaded.record, locate(loaded.directory), isFolder);

	async function read(workspace: string): Promise<ContextResult> {
		const loaded = await load(workspace);
		return loaded ? { ok: true, value: contextFrom(workspace, loaded) } : fail(502, UNREACHABLE);
	}

	async function save(workspace: string, changes: unknown, refused: string): Promise<ContextResult> {
		const saved = await courseRecords.run(workspace, { verb: "save", changes });
		if (!saved.ok) {
			console.error(`[course-context ${workspace}] save refused: ${saved.message}`);
			return fail(saved.kind === "validation" ? 409 : 502, refused);
		}
		return read(workspace);
	}

	/** Register the linked folders' files no source names yet, as the
	 *  engine's own scan lists them; the paths added. */
	async function registerNew(workspace: string, folders: readonly string[]): Promise<string[]> {
		const fresh: string[] = [];
		for (const folder of folders) {
			const scanned = await courseRecords.run(workspace, { verb: "sources", scan: folder });
			if (!scanned.ok) {
				console.error(`[course-context ${workspace}] sources --scan ${folder}: ${scanned.message}`);
				continue;
			}
			const { directory, files } = scanned.json as { directory: string; files: { path: string; handle?: string }[] };
			fresh.push(...files.filter((file) => file.handle === undefined).map((file) => path.join(directory, file.path)));
		}
		if (fresh.length === 0) return [];
		await deps.adopt(workspace, fresh);
		const added = await courseRecords.run(workspace, { verb: "sources", add: fresh });
		if (!added.ok) {
			console.error(`[course-context ${workspace}] sources --add: ${added.message}`);
			return [];
		}
		console.info(`[course-context ${workspace}] registered from linked folders: ${fresh.map((f) => path.basename(f)).join(", ")}`);
		deps.startMap(workspace);
		return fresh;
	}

	async function linkedFolders(workspace: string): Promise<string[]> {
		const loaded = await load(workspace);
		return loaded ? contextFrom(workspace, loaded).folders.map((f) => f.path) : [];
	}

	return {
		read,
		linkedFolders,

		async describe(workspace, description) {
			const words = description.trim();
			return save(workspace, { goal: words || null }, "The description could not be saved. Try again.");
		},

		async linkFolder(workspace, folder) {
			const absolute = path.resolve(folder.trim().replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
			if (!folder.trim() || !path.isAbsolute(absolute)) return fail(400, "Pick a folder on your Mac.");
			if (!isFolder(absolute)) return fail(400, "That folder is not there. Check the path, then try again.");
			// The engine keeps a file's path with links resolved, so the folder is kept the same way.
			const real = fs.realpathSync(absolute);
			const loaded = await load(workspace);
			if (!loaded) return fail(502, UNREACHABLE);
			const now = contextFrom(workspace, loaded);
			if (now.folders.some((f) => path.resolve(f.path) === real)) return fail(409, "That folder is already linked.");
			const handle = freeHandle("folder", baseName(real), takenHandles(loaded.record));
			const saved = await save(workspace, { sources: { [handle]: { path: real, title: baseName(real) } } }, "The folder could not be linked. Try again.");
			if (!saved.ok) return saved;
			if ((await registerNew(workspace, [real])).length > 0) return read(workspace);
			return saved;
		},

		async addWebsite(workspace, address, title) {
			const url = webAddress(address);
			if (!url) return fail(400, "Type a web address, such as probabilitycourse.com.");
			const loaded = await load(workspace);
			if (!loaded) return fail(502, UNREACHABLE);
			if (contextFrom(workspace, loaded).websites.some((w) => w.url === url)) return fail(409, "That website is already linked.");
			const name = title?.trim() || siteName(url);
			const handle = freeHandle("site", name, takenHandles(loaded.record));
			await deps.adopt(workspace, [url]);
			const saved = await save(workspace, { sources: { [handle]: { path: url, title: name } } }, "The website could not be linked. Try again.");
			if (saved.ok) deps.startMap(workspace);
			return saved;
		},

		async remove(workspace, handle) {
			const loaded = await load(workspace);
			if (!loaded) return fail(502, UNREACHABLE);
			const context = contextFrom(workspace, loaded);
			const cited = citedSources(loaded.record);
			const folder = context.folders.find((f) => f.handle === handle);
			const item = folder ?? context.websites.find((w) => w.handle === handle) ?? context.files.find((f) => f.handle === handle);
			if (!item) return fail(404, "That is no longer linked.");
			if (!folder && cited.has(handle)) return fail(409, `Topics on the map cite ${item.title}, so it stays linked.`);
			const where = locate(loaded.directory);
			const inside = folder
				? Object.entries((loaded.record as { sources?: Record<string, { path?: unknown }> }).sources ?? {}).flatMap(([h, s]) =>
						h !== handle && typeof s.path === "string" && !isWebAddress(s.path) && isInside(where(s.path), folder.path) && !cited.has(h) ? [h] : [],
					)
				: [];
			const gone = Object.fromEntries([handle, ...inside].map((h) => [h, null]));
			return save(workspace, { sources: gone }, "That could not be removed. Try again.");
		},

		async open(workspace, handle) {
			const loaded = await load(workspace);
			if (!loaded) return fail(502, UNREACHABLE);
			const context = contextFrom(workspace, loaded);
			const folder = context.folders.find((f) => f.handle === handle);
			const file = context.files.find((f) => f.handle === handle);
			const target = folder?.path ?? (file ? locate(loaded.directory)(file.path) : null);
			if (!target) return fail(404, "That is no longer linked.");
			try {
				await open(target);
				return { ok: true, value: null };
			} catch {
				return fail(404, `${folder?.title ?? file?.title} could not be opened. It may have moved.`);
			}
		},

		async syncFolders(workspace) {
			const loaded = await load(workspace);
			if (!loaded) return [];
			return registerNew(workspace, contextFrom(workspace, loaded).folders.map((f) => f.path));
		},
	};
}

export interface FolderWatchDeps {
	contexts: Pick<CourseContexts, "linkedFolders" | "syncFolders">;
	courseRecords: Pick<CourseRecords, "list">;
	/** Watch a folder and everything under it; returns the stop. */
	watch?: (folder: string, onChange: () => void) => () => void;
	/** How long the folder stays quiet before its new files are read. */
	settleMs?: number;
}

function watchFolder(folder: string, onChange: () => void): () => void {
	try {
		const watcher = fs.watch(folder, { recursive: true }, (_event, file) => {
			if (file === null || !String(file).split(path.sep).some((part) => part.startsWith("."))) onChange();
		});
		watcher.on("error", () => watcher.close());
		return () => watcher.close();
	} catch {
		return () => {};
	}
}

/**
 * Watch every course's linked folders (an OS event, never a poll). When
 * one changes and has stayed quiet for `settleMs`, its course registers
 * the new files and its map is extended from them. The quiet wait is a
 * debounce, as for typing: copying a folder of slides fires one event per
 * file, and they are read together in one save and one build. The watched
 * set follows the records: read at the app's start (which also reads what
 * arrived while the app was closed), on a course's record changing, and
 * on the course list changing. Returns the stop.
 */
export function watchLinkedFolders({ contexts, courseRecords, watch = watchFolder, settleMs = 1500 }: FolderWatchDeps): () => void {
	const watched = new Map<string, Map<string, () => void>>();
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	let stopped = false;
	const settle = (workspace: string) => {
		clearTimeout(timers.get(workspace));
		timers.set(
			workspace,
			setTimeout(() => {
				timers.delete(workspace);
				void contexts.syncFolders(workspace).catch(() => {});
			}, settleMs),
		);
	};
	const follow = async (workspace: string, readNow: boolean) => {
		const folders = new Set(await contexts.linkedFolders(workspace).catch(() => [] as string[]));
		if (stopped) return;
		const mine = watched.get(workspace) ?? new Map<string, () => void>();
		for (const [folder, unwatch] of mine) {
			if (folders.has(folder)) continue;
			unwatch();
			mine.delete(folder);
		}
		for (const folder of folders) if (!mine.has(folder)) mine.set(folder, watch(folder, () => settle(workspace)));
		watched.set(workspace, mine);
		if (readNow && folders.size > 0) void contexts.syncFolders(workspace).catch(() => {});
	};
	const followAll = async (readNow: boolean) => {
		const listing = await courseRecords.list().catch(() => null);
		if (stopped || !listing?.available) return;
		const now = new Set(listing.courses.map((c) => c.workspace));
		for (const [workspace, mine] of watched) {
			if (now.has(workspace)) continue;
			for (const unwatch of mine.values()) unwatch();
			watched.delete(workspace);
		}
		await Promise.all([...now].map((workspace) => follow(workspace, readNow)));
	};
	const unsubscribe = subscribe((event) => {
		if (event.type === "courses-changed") void followAll(false);
		else if (event.type === "course-changed") void follow(event.workspace, false);
	});
	void followAll(true);
	return () => {
		stopped = true;
		unsubscribe();
		for (const timer of timers.values()) clearTimeout(timer);
		for (const mine of watched.values()) for (const unwatch of mine.values()) unwatch();
		watched.clear();
	};
}
