"use server";

import {
	auth,
	extensionOriginsForUser,
	forgetExtensionOrigin,
	registerExtensionOrigin,
} from "@kc/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

/**
 * Vouching for a browser extension.
 *
 * A Server Action rather than an API route because there is nothing here the
 * browser needs to call directly — and because the session is the whole
 * authorisation: whoever is signed in is the only person who can add an origin
 * to their own account, which is what keeps this from being a wildcard.
 */

export interface OriginResult {
	ok: boolean;
	message: string;
}

/**
 * Chrome shows the id on chrome://extensions; people paste either that or the
 * whole origin. Both are accepted, because refusing one of them teaches nothing
 * — the id is the part they can see.
 */
function toOrigin(input: string): string | null {
	const trimmed = input.trim();

	if (/^[a-z]{16,32}$/.test(trimmed)) {
		return `chrome-extension://${trimmed}`;
	}

	return /^(chrome|moz)-extension:\/\/[a-zA-Z0-9-]+$/.test(trimmed)
		? trimmed
		: null;
}

async function currentUserId(): Promise<string | null> {
	const session = await auth.api.getSession({ headers: await headers() });
	return session?.user.id ?? null;
}

export async function listMyExtensionOrigins(): Promise<string[]> {
	const userId = await currentUserId();
	return userId ? extensionOriginsForUser(userId) : [];
}

export async function trustExtension(input: string): Promise<OriginResult> {
	const userId = await currentUserId();
	if (!userId) {
		return { ok: false, message: "Sign in again to trust an extension." };
	}

	const origin = toOrigin(input);
	if (!origin) {
		return {
			ok: false,
			message:
				"That does not look like an extension id. Copy the ID field from chrome://extensions.",
		};
	}

	await registerExtensionOrigin(userId, origin, "");
	revalidatePath("/capture");

	return { ok: true, message: `Trusted ${origin}` };
}

export async function untrustExtension(origin: string): Promise<OriginResult> {
	const userId = await currentUserId();
	if (!userId) {
		return { ok: false, message: "Sign in again to change this." };
	}

	await forgetExtensionOrigin(userId, origin);
	revalidatePath("/capture");

	return { ok: true, message: "Removed." };
}
