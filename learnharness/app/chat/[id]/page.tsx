import { notFound } from "next/navigation";
import { Chat } from "@/components/chat";
import { openedByApp, resumedOn, sessionTitleOf, studyDay } from "@/src/core";
import { courseDeleted, getChat, isTurnRunning, lessonPlace, reposeLeftQuestions, turnFailure } from "@/src/server";

export const dynamic = "force-dynamic";

export default async function ChatPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ prompt?: string; continue?: string }>;
}) {
	const [{ id }, { prompt, continue: go }] = await Promise.all([params, searchParams]);
	// Back in a session he left for today: its left question is asked again.
	reposeLeftQuestions(id);
	const chat = getChat(id);
	if (!chat) notFound();
	// Where the lesson sits in its course, for the top bar's links.
	const place = await lessonPlace(chat);
	return (
		<Chat
			key={chat.id}
			chatId={chat.id}
			title={sessionTitleOf(chat)}
			startedIn={chat.kind}
			topics={chat.topics}
			appOpening={openedByApp(chat)}
			course={chat.course}
			place={place ?? undefined}
			// A deleted course's lesson is history (courses.ts courseDeleted).
			initiallyCourseDeleted={courseDeleted(chat.id)}
			// Wave D: the record IS native agent history — the client view is
				// derived app-side (core/view.ts projectView; GET serves the same
				// native messages).
				initialMessages={chat.messages}
			initialError={turnFailure(chat.id)}
			// Back on a later study day: the date divider where it picks up.
			resumed={resumedOn(chat.messages, chat.updatedAt, studyDay()) ?? undefined}
			initialPrompt={prompt}
			// Continue on the open task it holds (continueHref).
			continueTask={go === "task"}
			// A teacher turn that outlived its client: the remounted view must
			// attach (busy shimmer + poll), never resurrect the stale record.
			initiallyInFlight={isTurnRunning(chat.id)}
		/>
	);
}
