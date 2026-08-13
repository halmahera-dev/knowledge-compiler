"use server";

import { auth } from "@kc/auth";
import { headers } from "next/headers";

/**
 * Point a session at a workspace when it has none.
 *
 * New sessions get one from `databaseHooks.session.create.before` in
 * `packages/auth`. This exists for the ones minted before that hook did, which
 * carry `activeOrganizationId: null` and therefore mint tokens with no
 * `workspaceId` — making every scoped API call answer 409, which reads as the
 * whole app being broken rather than as a workspace never having been chosen.
 *
 * A Server Action rather than a call during render: this writes a session
 * cookie, and cookies may only be set from an action or a route handler. Doing
 * it in a Server Component happened to work until it did not.
 */
export async function ensureActiveWorkspace(): Promise<boolean> {
	const requestHeaders = await headers();

	const session = await auth.api.getSession({ headers: requestHeaders });
	if (!session) return false;

	const active = (
		session.session as { activeOrganizationId?: string | null }
	).activeOrganizationId;
	if (active) return false;

	const organizations = await auth.api.listOrganizations({
		headers: requestHeaders,
	});
	const first = organizations?.[0];
	if (!first) return false;

	await auth.api.setActiveOrganization({
		body: { organizationId: first.id },
		headers: requestHeaders,
	});
	return true;
}
