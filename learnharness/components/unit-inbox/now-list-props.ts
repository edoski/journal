import type { ChatListItem, StudyCourse } from "@/src/core";
import type { NeedsYou } from "@/components/study-home/needs-you";
import type { SessionsSidebar } from "@/components/unit-inbox/session-item";
import type { Folded } from "@/components/unit-inbox/use-unit-inbox";
import type { FoldedShelf, UnitInbox } from "@/components/unit-inbox/units";

/** What the Proposed sidebar hands an Inbox candidate (spec: unit-inbox.md,
 *  "Inbox switch"): Today's lines under the course filter, the inbox they
 *  sit over, and the sidebar's own state. */
export interface NowListProps {
	/** Today's lines for the sidebar (`nowFor`), under the course filter. */
	needs: NeedsYou;
	/** The classified topics under the course filter (`buildInbox`). */
	inbox: UnitInbox;
	courses: readonly StudyCourse[];
	/** Every session, each started on a topic's page linked to it. */
	chats: readonly ChatListItem[];
	/** The engine's study day, else the learner's date while it is down. */
	today: string;
	/** The courses could not be read. */
	unavailable: boolean;
	folded: Folded;
	fold: (shelf: FoldedShelf, next: boolean) => void;
	pathname: string;
	s: SessionsSidebar;
}
