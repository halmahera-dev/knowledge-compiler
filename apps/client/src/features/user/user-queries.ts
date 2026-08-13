import "server-only";

import { auth } from "@kc/auth";
import { headers } from "next/headers";

export async function getSession() {
	return auth.api.getSession({ headers: await headers() });
}

export async function listOrganizations() {
	const session = await getSession();
	if (!session) return [];
	return auth.api.listOrganizations({ headers: await headers() });
}

/** The workspace this session is scoped to, or null when none is chosen. */
export async function activeOrganizationId(): Promise<string | null> {
	const session = await getSession();
	const value = (
		session?.session as { activeOrganizationId?: string | null } | undefined
	)?.activeOrganizationId;
	return value ?? null;
}
