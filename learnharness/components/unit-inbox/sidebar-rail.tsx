"use client";

import Link from "next/link";
import { CalendarDaysIcon, HouseIcon, PanelLeftOpenIcon, SearchIcon, SettingsIcon, SquarePenIcon, type LucideIcon } from "lucide-react";
import { kbdEventForAction, type KeyAction } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/** One of the rail's buttons: its icon, its name as a tooltip on the right
 *  with its shortcut, the selected fill on its own page. */
function RailButton({
	icon: Icon,
	label,
	action,
	here = false,
	href,
	onClick,
	testId,
}: {
	icon: LucideIcon;
	label: string;
	action?: KeyAction;
	here?: boolean;
	href?: string;
	onClick?: () => void;
	testId?: string;
}) {
	const className = cn("lh-no-drag", here && "bg-fill-selected text-foreground");
	return (
		<Hint label={label} action={action} side="right">
			{href ? (
				<Button asChild variant="quiet" size="icon-bar" aria-label={label} aria-current={here ? "page" : undefined} data-testid={testId} className={className}>
					<Link href={href} onClick={blurAfterPointerClick}>
						<Icon />
					</Link>
				</Button>
			) : (
				<Button
					variant="quiet"
					size="icon-bar"
					aria-label={label}
					data-testid={testId}
					className={className}
					onClick={(e) => {
						onClick?.();
						blurAfterPointerClick(e);
					}}
				>
					<Icon />
				</Button>
			)}
		</Hint>
	);
}

/**
 * The folded sidebar (spec: unit-inbox.md, "Folded"), T3 Code's and
 * shadcn's icon rail: a 48px column with the open button on top, then
 * Home, Calendar, Search (which opens the sidebar on its field) and New
 * lesson, and Settings at the foot, each named in a tooltip with its
 * shortcut. In the Mac app it starts below the traffic lights' band and
 * is as wide as they are (`.lh-rail`), so the page starts clear of them.
 */
export function SidebarRail({ pathname, onOpen, onNewLesson, onSettings }: { pathname: string; onOpen: () => void; onNewLesson: () => void; onSettings: () => void }) {
	return (
		<nav aria-label="Sidebar" data-slot="sidebar-rail" className="flex h-full w-full flex-col items-center border-r bg-background pb-2">
			<div className="lh-drag lh-lights-band w-full shrink-0" />
			<div className="lh-drag flex w-full flex-1 flex-col items-center gap-1 pt-2">
				<RailButton icon={PanelLeftOpenIcon} label="Open sidebar" action="toggle-sidebar" onClick={onOpen} testId="sidebar-open" />
				<span aria-hidden className="my-1 h-px w-5 bg-border" />
				<RailButton icon={HouseIcon} label="Home" href="/" here={pathname === "/"} />
				<RailButton icon={CalendarDaysIcon} label="Calendar" href="/calendar" here={pathname === "/calendar"} />
				<RailButton icon={SearchIcon} label="Search" action="sessions-search" onClick={() => window.dispatchEvent(new Event(kbdEventForAction("sessions-search")))} />
				<RailButton icon={SquarePenIcon} label="New lesson" action="new-session" onClick={onNewLesson} />
			</div>
			<RailButton icon={SettingsIcon} label="Settings" action="open-settings" onClick={onSettings} />
		</nav>
	);
}
