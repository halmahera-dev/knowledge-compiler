import { PageHeader } from "@/components/page-header";
import { ExtensionPanel } from "@/features/settings/components/extension-panel";

/**
 * Everything that is configured once and then left alone.
 *
 * One card today, and that is the honest shape of it: workspaces are switched
 * from the sidebar, the theme from the footer, and model rates from `.env`
 * where they belong. A settings page padded out with rows that only restate
 * defaults would be harder to read than a short one.
 */
export function SettingsView() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="Settings">
				<span className="ml-auto hidden text-muted-foreground text-xs md:block">
					Set up once, per account
				</span>
			</PageHeader>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
				<div className="max-w-2xl">
					<ExtensionPanel />
				</div>
			</div>
		</div>
	);
}
