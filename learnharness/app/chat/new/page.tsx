import { StartScreen } from "@/components/start/start-screen";
import { readSettingsRecord } from "@/src/server";
import { slotsConfigured } from "@/src/core";

export const dynamic = "force-dynamic";

/**
 * New lesson: NO session is created until the first message is sent; on
 * send it creates the chat (title = that message) and redirects to the
 * real page, whose initialPrompt path delivers the message as turn 1.
 * Static segment beats the dynamic [id] route — "new" is never a chat id.
 */
export default function NewSessionPage() {
	return <StartScreen initialConfigured={slotsConfigured(readSettingsRecord()?.models)} />;
}
