/**
 * Where this extension can save to.
 *
 * There is no build step — the folder loads as-is — so the alternative to a list
 * was making every person edit a file before their first clip. That was the old
 * design, and it failed in the least helpful way available: a save against the
 * wrong base looked exactly like being signed out.
 *
 * So all the environments this project actually runs in are listed, and the
 * right one is worked out at save time (see `resolveTarget` in save.js). Nothing
 * to configure, and nothing to get wrong.
 *
 * `manifest.json` must list the same origins under `host_permissions`. The
 * manifest cannot read this file, so the two are kept in step by hand — a URL
 * added here and not there is blocked by Chrome before the request is made.
 */

export const ENVIRONMENTS = [
  { label: "Local", app: "http://localhost:3000", api: "http://localhost:8000" },
  { label: "Local (127.0.0.1)", app: "http://127.0.0.1:3000", api: "http://127.0.0.1:8000" },
  { label: "Server", app: "http://34.228.186.46:3000", api: "http://34.228.186.46:8000" },
];

/** Used only until a save has proved which environment is actually reachable. */
export const DEFAULT_APP = ENVIRONMENTS[0].app;
export const DEFAULT_API = ENVIRONMENTS[0].api;

/**
 * Adding a deployment
 *
 * Append an entry above, then add both origins to `host_permissions` in
 * manifest.json. Anything not on this list can still be reached by typing it
 * into the popup, which asks Chrome for permission at that point.
 */
