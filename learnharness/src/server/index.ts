/**
 * THE SERVER-SIDE SURFACE — the only src module (besides the core barrel)
 * that app/ may import. Route handlers and server components come through
 * here; nothing under app/ touches src/store or src/agent directly.
 */

export * from "./chat-handler.ts";
export { heicToJpeg, preparePhotos, PHOTO_UNREADABLE } from "./photos.ts";
export * from "./events-stream.ts";
export * from "./chats.ts";
export * from "./courses.ts";
export { addMaterial, courseContexts, courseMapStatus, startCourseMap } from "./course-map.ts";
export * from "./study.ts";
export * from "./calendar.ts";
export * from "./topic.ts";
export { lessonPlace } from "./lesson-place.ts";
export * from "./course-standing.ts";
export { answerMarks } from "./marks.ts";
export { convertPdf } from "../agent/subagents/pdf-ops.ts";
export { joinPages } from "../agent/subagents/pdf-markdown.ts";
export * from "./jobs.ts";
export * from "./stores.ts";
// The settings record (settings-storage wave, 2026-09-19).
// The *Record aliases keep the app/api/settings routes explicit about which
// seam they touch (the raw record, not the chat-section convenience view).
export {
	readSettings as readSettingsRecord,
	writeSettings as writeSettingsRecord,
	settingsStore,
} from "../store/settings.ts";

export * from "./settings-body.ts";
export * from "./turn-liveness.ts";
export * from "./turn-runs.ts";
export * from "./dismissal-park.ts";
export { runPiTurn, piTurnResponse, type PiTurnHandle, type PiTurnSpec } from "./pi/ui-stream.ts";
export * from "./observability.ts";
export * from "./model-catalog.ts";
export { claudeConnectionResponse } from "./claude-connection-http.ts";
export { sessionCost } from "./pricing.ts";
