/**
 * The tour finds its targets by `data-tour`, and every target is set on a
 * wrapper rather than on a DOM element: `SidebarMenuButton` renders a `Link`,
 * and the workspace switcher is a `DropdownMenuTrigger` rendering a
 * `SidebarMenuButton` that itself renders through a `TooltipTrigger`.
 *
 * Base UI is supposed to merge arbitrary props down that chain onto the final
 * element. If it does not, `document.querySelector('[data-tour=…]')` returns
 * null, every step is filtered out as "absent", and the tour says there is
 * nothing to point at on a page covered in things to point at — a failure with
 * no error message anywhere.
 *
 * So this asserts the attribute actually reaches the rendered HTML. Static
 * markup rather than a DOM: the question is what React emits, and rendering to
 * a string needs no jsdom.
 */
import {
	DropdownMenu,
	DropdownMenuTrigger,
} from "@kc/ui/components/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@kc/ui/components/sidebar";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

describe("data-tour targets", () => {
	test("survives SidebarMenuButton rendering a link", () => {
		const html = renderToStaticMarkup(
			<SidebarProvider>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							data-tour="nav-agent"
							render={<a href="/agent">Agent</a>}
						/>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarProvider>,
		);

		expect(html).toContain('data-tour="nav-agent"');
		// On the anchor itself, not on some wrapper: the highlight is drawn around
		// the box the reader sees and clicks.
		expect(html).toMatch(/<a[^>]*data-tour="nav-agent"/);
	});

	test("survives a dropdown trigger rendering a tooltipped menu button", () => {
		const html = renderToStaticMarkup(
			<SidebarProvider>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger
								data-tour="workspace"
								render={<SidebarMenuButton size="lg" tooltip="Workspace" />}
							>
								Akmal's workspace
							</DropdownMenuTrigger>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarProvider>,
		);

		expect(html).toMatch(/<button[^>]*data-tour="workspace"/);
	});
});
