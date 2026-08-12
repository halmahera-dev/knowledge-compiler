"use client";

import { cn } from "@kc/ui/lib/utils";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

export function Response({
	className,
	isStreaming,
	...props
}: ComponentProps<typeof Streamdown> & { isStreaming?: boolean }) {
	return (
		<Streamdown
			components={{
				ul: ({ children }) => <ul className="list-disc">{children}</ul>,
			}}
			animated={{ animation: "blurIn" }}
			isAnimating={isStreaming}
			className={cn(
				"size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p+table]:mt-4 [&_table+p]:mt-4",
				"typeset typeset-chat",
				className,
			)}
			{...props}
		/>
	);
}
