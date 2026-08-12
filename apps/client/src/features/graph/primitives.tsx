import { cn } from "@kc/ui/lib/utils";

export function IconButton({
	className,
	...props
}: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			className={cn(
				"inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

export function TextButton({
	className,
	...props
}: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			className={cn(
				"inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 font-medium text-xs shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-3.5",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * A legend pill. Node labels carry their palette colour; relationship types
 * are neutral, matching how Neo4j distinguishes the two in its legend.
 */
export function Chip({
	className,
	active,
	swatch,
	count,
	children,
	...props
}: React.ComponentProps<"button"> & {
	active: boolean;
	swatch?: string;
	count: number;
}) {
	return (
		<button
			type="button"
			className={cn(
				"inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
				active
					? "border-foreground/30 bg-muted text-foreground"
					: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
				className,
			)}
			{...props}
		>
			{swatch ? (
				<span
					aria-hidden="true"
					className="size-2.5 shrink-0 rounded-full"
					style={{ backgroundColor: swatch }}
				/>
			) : null}
			<span className="truncate">{children}</span>
			<span className="tabular-nums opacity-60">{count}</span>
		</button>
	);
}
