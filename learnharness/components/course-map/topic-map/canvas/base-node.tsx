import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * React Flow UI's BaseNode (https://ui.reactflow.dev/base-node, MIT, xyflow),
 * copied as its registry intends and adapted to the app: the card is the
 * app's surface and radius, and it holds no tab stop of its own, since the
 * topic's link inside it is the one stop.
 */

export function BaseNode({ className, ...props }: ComponentProps<"div">) {
	return <div data-slot="base-node" className={cn("relative rounded-lg border bg-card text-card-foreground", className)} {...props} />;
}

/** A node's header strip, above its content. */
export function BaseNodeHeader({ className, ...props }: ComponentProps<"header">) {
	return <header data-slot="base-node-header" className={cn("flex flex-row items-center gap-1.5 px-3", className)} {...props} />;
}

export function BaseNodeContent({ className, ...props }: ComponentProps<"div">) {
	return <div data-slot="base-node-content" className={cn("flex flex-row items-center gap-2.5 px-3", className)} {...props} />;
}
