/**
 * Browser-side auth client.
 *
 * `inferAdditionalFields` and the organization client keep the same types the
 * server declares, so a role string typo is a compile error rather than a
 * silently failing permission check.
 */
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ac, workspaceRoles } from "./permissions";

export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      ac,
      roles: workspaceRoles,
    }),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  organization,
  useActiveOrganization,
  useListOrganizations,
} = authClient;
