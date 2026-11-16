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
 * The folded rail's open button (spec: unit-inbox.md, "Folded"), where T3
 * Code's sidebar toggle stands: centred in the rail's head in a browser, and
 * in the Mac app beside the traffic lights, level with them
 * (`.lh-rail-toggle`). The app shell draws it after the page, so in the Mac
 * app the page's own drag band, which it stands over, cannot take its clicks
 * (Electron resolves drag regions in page order).
 */
export function RailOpenButton({ shown, onOpen }: { shown: boolean; onOpen: () => void }) {
	// Mounted open or folded; it shows once the panel's edge has swept past it, and goes as the edge comes back (`rail-toggle-motion`).
	return (
		<div inert={!shown} className={cn("lh-rail-toggle rail-toggle-motion", !shown && "invisible")}>
			<RailButton icon={PanelLeftOpenIcon} label="Open sidebar" action="toggle-sidebar" onClick={onOpen} testId="sidebar-open" />
		</div>
	);
}

/**
 * The folded sidebar (spec: unit-inbox.md, "Folded"), shadcn's icon rail:
 * a 48px column whose head is the window's 52px band, which holds the open
 * button (`RailOpenButton`), then Home, Calendar, Search (which opens the
 * sidebar on its field) and New lesson, and Settings at the foot, each named
 * in a tooltip with its shortcut.
 */
export function SidebarRail({ pathname, onNewLesson, onSettings }: { pathname: string; onNewLesson: () => void; onSettings: () => void }) {
	return (
		<nav aria-label="Sidebar" data-slot="sidebar-rail" className="flex h-full w-full flex-col items-center border-r bg-background pb-2">
			<div className="lh-drag lh-rail-head relative flex w-full shrink-0 items-center justify-center">
				<span aria-hidden data-slot="sidebar-rail-rule" className="absolute bottom-0 left-1/2 h-px w-5 -translate-x-1/2 bg-border" />
			</div>
			<div className="lh-drag flex w-full flex-1 flex-col items-center gap-1 pt-0.5">
				<RailButton icon={HouseIcon} label="Home" href="/" here={pathname === "/"} />
				<RailButton icon={CalendarDaysIcon} label="Calendar" href="/calendar" here={pathname === "/calendar"} />
				<RailButton icon={SearchIcon} label="Search" action="sessions-search" onClick={() => window.dispatchEvent(new Event(kbdEventForAction("sessions-search")))} />
				<RailButton icon={SquarePenIcon} label="New lesson" action="new-session" onClick={onNewLesson} />
			</div>
			<RailButton icon={SettingsIcon} label="Settings" action="open-settings" onClick={onSettings} />
		</nav>
	);
}
