import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "@xyflow/react/dist/base.css";
import "./globals.css";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import { PolishHost } from "@/components/dev/polish-host";

export const metadata: Metadata = {
	title: "Learning Harness",
	description: "A teacher agent with a memory — lessons, practice, and a course record of what you know.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body className="min-h-dvh antialiased">
			{/* The notification channel rides OUTSIDE everything: sidebar, dock,
				 and pages all subscribe as the polls retire (push S3, 2026-10-02). */}
			<ServerEventsProvider>
				<AppearanceProvider>
					<SidebarProvider>
						<ActivityProvider>
							<AppShell>{children}</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</ServerEventsProvider>
			{process.env.NODE_ENV === "development" && <PolishHost />}
		</body>
		</html>
	);
}
