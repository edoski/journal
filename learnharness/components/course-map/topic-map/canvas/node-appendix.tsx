import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * React Flow UI's NodeAppendix (https://ui.reactflow.dev/node-appendix, MIT,
 * xyflow): a tab attached to a node's side. Adapted: it hugs its words
 * instead of the node's width, and sits flush on the node's edge.
 */
const appendixVariants = cva("absolute flex items-center rounded-t-md px-2 text-callout", {
	variants: {
		position: {
			top: "bottom-full left-3",
			bottom: "top-full left-3 rounded-t-none rounded-b-md",
		},
	},
	defaultVariants: { position: "top" },
});

export function NodeAppendix({ className, position, ...props }: ComponentProps<"div"> & VariantProps<typeof appendixVariants>) {
	return <div data-slot="node-appendix" className={cn(appendixVariants({ position }), className)} {...props} />;
}
