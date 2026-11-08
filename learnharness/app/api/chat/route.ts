import { courseRequired, handleChatRequest } from "@/src/server";

export async function POST(req: Request) {
	const { chatId } = (await req.clone().json().catch(() => ({}))) as { chatId?: unknown };
	if (courseRequired(chatId)) {
		return Response.json({ error: "This session has no course yet", code: "course_required" }, { status: 409 });
	}
	return handleChatRequest(req);
}
