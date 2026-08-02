/**
 * Workspace roles and permissions.
 *
 * Extends Better Auth's organization access control with the resources this app
 * actually has. The statements are deliberately about *product* verbs (compile a
 * source, revert a page) rather than CRUD on tables, because that is what a
 * permission check reads like at the call site.
 *
 * Kept small on purpose: four roles that a person can hold in their head beats a
 * matrix nobody can reason about. Both this file and the FastAPI enforcement in
 * `apps/api/app/deps.py` must agree — the API is the real boundary; this is what
 * the UI uses to decide what to show.
 */
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const;

export type WorkspaceRole = (typeof ROLES)[keyof typeof ROLES];

/**
 * `defaultStatements` carries the organization/member/invitation verbs Better
 * Auth enforces internally; dropping them would break invites and member
 * management, so they are spread in rather than replaced.
 */
export const statements = {
  ...defaultStatements,
  /** A wiki inside a workspace. */
  wiki: ["create", "update", "delete"],
  /** Saving a source and having it compiled. */
  source: ["create", "delete"],
  /** The compiled pages themselves — `revert` is the undo of a bad compile. */
  page: ["read", "revert", "delete"],
  /** Asking the copilot. Separate from `page:read` because it costs model spend. */
  copilot: ["ask"],
} as const;

export const ac = createAccessControl(statements);

/** Read-only. Can browse and query, cannot change anything or spend on compiles. */
export const viewer = ac.newRole({
  ...memberAc.statements,
  page: ["read"],
  copilot: ["ask"],
});

/** The default working role: can save, compile, and undo. Cannot manage people. */
export const member = ac.newRole({
  ...memberAc.statements,
  wiki: ["create"],
  source: ["create", "delete"],
  page: ["read", "revert"],
  copilot: ["ask"],
});

/** Everything a member can do, plus managing wikis and people. */
export const admin = ac.newRole({
  ...adminAc.statements,
  wiki: ["create", "update", "delete"],
  source: ["create", "delete"],
  page: ["read", "revert", "delete"],
  copilot: ["ask"],
});

/** Admin, plus deleting the workspace itself. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  wiki: ["create", "update", "delete"],
  source: ["create", "delete"],
  page: ["read", "revert", "delete"],
  copilot: ["ask"],
});

export const workspaceRoles = { owner, admin, member, viewer };

/** Roles ordered least to most privileged, for `atLeast` comparisons. */
export const ROLE_ORDER: WorkspaceRole[] = [
  ROLES.VIEWER,
  ROLES.MEMBER,
  ROLES.ADMIN,
  ROLES.OWNER,
];

export function atLeast(role: string | null | undefined, minimum: WorkspaceRole): boolean {
  if (!role) return false;
  const held = ROLE_ORDER.indexOf(role as WorkspaceRole);
  return held >= 0 && held >= ROLE_ORDER.indexOf(minimum);
}
