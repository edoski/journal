import { notFound } from "next/navigation";
import { Chat } from "@/components/chat";
import { courseDeleted, getChat, isTurnRunning, lessonPlace, turnFailure } from "@/src/server";

export const dynamic = "force-dynamic";

export default async function ChatPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ prompt?: string }>;
}) {
	const [{ id }, { prompt }] = await Promise.all([params, searchParams]);
	const chat = getChat(id);
	if (!chat) notFound();
	// Where the lesson sits in its course, for the top bar's links.
	const place = await lessonPlace(chat);
	return (
		<Chat
			key={chat.id}
			chatId={chat.id}
			title={chat.title}
			startedIn={chat.kind}
			course={chat.course}
			place={place ?? undefined}
			// A deleted course's lesson is history (courses.ts courseDeleted).
			initiallyCourseDeleted={courseDeleted(chat.id)}
			// Wave D: the record IS native agent history — the client view is
				// derived app-side (core/view.ts projectView; GET serves the same
				// native messages).
				initialMessages={chat.messages}
			initialError={turnFailure(chat.id)}
			initialPrompt={prompt}
			// A teacher turn that outlived its client: the remounted view must
			// attach (busy shimmer + poll), never resurrect the stale record.
			initiallyInFlight={isTurnRunning(chat.id)}
		/>
	);
}
