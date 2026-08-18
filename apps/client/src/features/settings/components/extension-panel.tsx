"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@kc/ui/components/card";
import { ExtensionGuide } from "@/features/settings/components/extension-guide";

/**
 * Saving from the page you are reading.
 *
 * Clipping happens in the browser, on a page this app never sees, so there is
 * nothing here to fill in — only something to install and something to trust.
 *
 * The same guide is reachable from the composer, which is where people actually
 * are when they think of it. This page keeps a copy because a settings page
 * that cannot be linked to is a settings page nobody can be sent to.
 */
export function ExtensionPanel() {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Clip from the browser</CardTitle>
				<CardDescription>
					Save what you are reading — no copying, no switching tabs.
				</CardDescription>
			</CardHeader>

			<CardContent>
				<ExtensionGuide />
			</CardContent>
		</Card>
	);
}
