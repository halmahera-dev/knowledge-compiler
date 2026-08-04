/**
 * Where this build points.
 *
 * The extension has no bundler — it loads as-is — so there is no build step to
 * substitute an environment into. These two constants are that substitution:
 * one file to edit per deployment, rather than four places to hunt for
 * "localhost".
 *
 * Both are only defaults. The popup's API and App fields override them and are
 * remembered, so a single build can be pointed anywhere at runtime.
 *
 * Changing these is not enough on its own. `host_permissions` in manifest.json
 * must list the same origins, or Chrome blocks the request before it is made —
 * the manifest cannot read this file.
 */

export const DEFAULT_API = "http://localhost:8000";
export const DEFAULT_APP = "http://localhost:3000";

// For a deployment, the pair becomes something like:
//   export const DEFAULT_API = "https://api.example.com";
//   export const DEFAULT_APP = "https://app.example.com";
// and manifest.json gains "https://api.example.com/*" and
// "https://app.example.com/*" under host_permissions.
