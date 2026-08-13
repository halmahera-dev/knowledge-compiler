import { SidebarTrigger } from "@kc/ui/components/sidebar";
import { cn } from "@kc/ui/lib/utils";

function PageHeader({
	className,
	title,
	children,
	...props
}: Omit<React.ComponentProps<"header">, "title"> & {
	title?: React.ReactNode;
}) {
	return (
		<header
			data-slot="page-header"
			className={cn(
				// The bottom margin is the page's first piece of rhythm, not padding
				// on the bar: padding would grow the blurred material itself, while
				// this leaves a gap the content scrolls up through. 16px matches the
				// gap cards keep from each other, so the first card is spaced from
				// the header exactly as it is from its neighbour.
				"page-header-material sticky top-0 z-20 mb-4 flex shrink-0 items-center gap-2 px-4 py-3 backdrop-blur-md",
				className,
			)}
			{...props}
		>
			<SidebarTrigger />

			{title === undefined ? null : (
				<span className="truncate font-medium text-sm">{title}</span>
			)}

			{children}
		</header>
	);
}

export { PageHeader };
