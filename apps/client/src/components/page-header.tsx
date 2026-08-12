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
				"page-header-material sticky top-0 z-20 flex shrink-0 items-center gap-2 px-4 py-3 backdrop-blur-md",
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
