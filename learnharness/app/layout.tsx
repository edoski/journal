import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "@xyflow/react/dist/base.css";
import "./globals.css";
import { cookies } from "next/headers";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { SIDEBAR_OPEN_COOKIE, SIDEBAR_WIDTH_COOKIE, sidebarFirstFrame } from "@/components/sidebar-cookies";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import { PolishHost } from "@/components/dev/polish-host";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
	title: "Learning Harness",
	description: "A teacher agent with a memory — lessons, practice, and a course record of what you know.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	// The sidebar's open state and width, as the learner left them, so the
	// first frame is the settled layout and nothing slides in on load.
	const jar = await cookies();
	const sidebar = sidebarFirstFrame(jar.get(SIDEBAR_OPEN_COOKIE)?.value, jar.get(SIDEBAR_WIDTH_COOKIE)?.value);
	return (
		<html lang="en" className="dark">
			<body className="min-h-dvh antialiased">
			{/* The notification channel rides OUTSIDE everything: sidebar, dock,
				 and pages all subscribe as the polls retire (push S3, 2026-10-02). */}
			<ServerEventsProvider>
				{/* One tooltip provider for the app, as shadcn sets it up: once a
				    hint has opened, the next opens without waiting again. */}
				<TooltipProvider>
				<AppearanceProvider>
					<SidebarProvider initial={sidebar}>
						<ActivityProvider>
							<AppShell>{children}</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
				</TooltipProvider>
			</ServerEventsProvider>
			{process.env.NODE_ENV === "development" && <PolishHost />}
		</body>
		</html>
	);
}
