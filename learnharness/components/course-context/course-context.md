# Course context

What the tutor and the course map builder read about a course beyond its topics, opened from the course page head's Context (`ContextSheet`, `context-sheet.tsx`, `data-slot="context-sheet"`), the way a Claude project's knowledge, a Codex project's folders or NotebookLM's sources sit beside the work.

## Data

Everything lives in the engine's course record, the one place every tutor (this app's, Claude Code's, Claude Desktop's) and the map builder read. No app-side store.

| Item | In the record | Who reads it |
|---|---|---|
| About this course | `goal` | the tutor's course brief ("About the course, in his words"), the engine's `resume` for the other hosts, the map builder's prompt |
| A folder | a source whose `path` is the folder (absolute, links resolved), titled by its name; each readable file in it (the engine's material suffixes, hidden files and dependency trees left out, at most 200) is registered as its own source | the map builder reads the files; the folder itself is not a source to cite |
| A website | a source whose `path` is its http or https address, titled by its site name | the map builder fetches it as text (the web tool's reader) |
| A file | a source outside every linked folder: what Add files (Add material's upload, `sendMaterial`) copied into `material/`, or a lesson registered | the map builder |

`src/core/course-context.ts` sorts the sources (pure, tested); `src/server/course-context.ts` reads and writes through the CourseRecords port; `app/api/courses/context` (GET, PATCH description, POST folder or website, DELETE) and `app/api/courses/context/open` (Finder or the file's app, only for what the course links).

Linked folders are watched with `fs.watch` (an OS event, never a poll). Once a folder has been quiet for 1.5s (a debounce, as for typing, so a copied folder of slides is one save and one build) its new files are registered and the map is extended from them alone. The watched set follows the records: at the app's start (which also registers what arrived while it was closed), on a course's record changing and on the list changing.

Unlinking a folder removes it and its files, except those the map cites, which stay as files. A cited website or file cannot be unlinked: the sheet says topics on the map cite it. Unlinking never deletes a file.

## Anatomy

| Slot | Notes |
|---|---|
| header | "Context", then "What the tutor and the course map read about <course>." |
| `context-description` | About this course: a textarea saved when he leaves it or on ⌘↩, "Saving…" then "Saved" at the section's right |
| `context-folders` | Folders, with Link a folder: the system folder picker in the desktop app (`window.lh.pickFolder`), a path field in a browser |
| `context-websites` | Websites, with Add a website: an address field; a typed address without a scheme reads as https |
| `context-files` | Files, with Add files: the system file picker, sent at once |
| row | a 16px mark (folder, globe, file), the name in ink, where it is muted (`~` for his home folder, the address without its scheme); the row opens it; a cross on hover unlinks it |
| `context-map` | while the map reads new material, or when its last build failed: one line, with Try again after a failure |

Empty sections say what belongs there in one plain line. No counts or sizes.

## Sources

Claude Projects (knowledge and instructions beside the project), ChatGPT and Codex projects (linked folders), NotebookLM (sources panel: add, list, remove), VS Code multi-root workspaces (add and remove folder), Linear (resource links titled by site name), Apple HIG and NN/g (a nonmodal panel for supplementary work).
