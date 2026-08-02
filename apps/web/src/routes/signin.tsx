/**
 * Sign in / create account.
 *
 * One route with two modes rather than two routes: the forms differ by a single
 * field, and switching between them should not cost a navigation.
 */
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "~/lib/auth-client";
import { clearToken } from "~/lib/token";
import { titleHead } from "~/lib/head";
import { safeRedirect } from "~/lib/guards";

export const Route = createFileRoute("/signin")({
  head: titleHead("Sign in"),
  component: SignInPage,
  validateSearch: (search: Record<string, unknown>) => ({
    // Where to land after signing in, so a deep link survives the detour.
    // Validated to a path on this app: the value is attacker-controllable via the
    // query string and is navigated to right after a password is typed, which is
    // exactly the moment an open redirect is worth the most.
    redirect: safeRedirect(search.redirect),
    mode: search.mode === "signup" ? ("signup" as const) : ("signin" as const),
  }),
});

/**
 * Guarantees the session has an active workspace, creating the first one if the
 * account has none.
 *
 * Without this a freshly signed-in user hits 409 on every request: they have a
 * valid session but no `workspaceId` claim, and the API will not default one.
 */
async function ensureActiveWorkspace(displayName: string): Promise<void> {
  const { data: existing } = await authClient.organization.list();

  if (existing && existing.length > 0) {
    await authClient.organization.setActive({ organizationId: existing[0]!.id });
    return;
  }

  const created = await authClient.organization.create({
    name: `${displayName.split(" ")[0]}'s workspace`,
    // Slugs are unique across all organizations, so a name-derived slug would
    // collide between two people called Alex.
    slug: `ws-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`,
    keepCurrentActiveOrganization: false,
  });

  if (created.data?.id) {
    await authClient.organization.setActive({ organizationId: created.data.id });
  }
}

function SignInPage() {
  const { redirect, mode: initialMode } = Route.useSearch();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "signup";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const result = isSignUp
        ? await authClient.signUp.email({ email, password, name: name || email.split("@")[0]! })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message ?? "That did not work. Check your details and try again.");
        return;
      }

      // Every sign-in starts a fresh session with no active organization, and the
      // API refuses to guess one — it returns 409 rather than silently picking a
      // workspace, since picking the wrong one would show the wrong knowledge
      // base. So the active workspace is established here, on both paths.
      await ensureActiveWorkspace(name || email.split("@")[0]!);

      // The cached token predates the session, so it must go or the first API
      // call would be made as the previous user.
      clearToken();
      await router.navigate({ to: redirect });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-[26rem] place-items-center px-5">
      <div className="w-full">
        <p className="eyebrow">{isSignUp ? "Create an account" : "Welcome back"}</p>
        <h1 className="mt-2 font-read text-h1 font-semibold leading-tight tracking-[-0.02em]">
          {isSignUp ? "Start compiling." : "Sign in."}
        </h1>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {isSignUp && (
            <div>
              <label htmlFor="name" className="eyebrow">
                Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-rule bg-surface px-3.5 text-body transition-colors duration-fast hover:border-rule-strong focus:border-link"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="eyebrow">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-rule bg-surface px-3.5 text-body transition-colors duration-fast hover:border-rule-strong focus:border-link"
            />
          </div>

          <div>
            <label htmlFor="password" className="eyebrow">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-rule bg-surface px-3.5 text-body transition-colors duration-fast hover:border-rule-strong focus:border-link"
            />
            {isSignUp && (
              <p className="mt-1.5 text-micro text-ink-faint">At least 8 characters.</p>
            )}
          </div>

          {error && (
            // Announced politely so a screen reader hears it without losing the caret.
            <p role="alert" aria-live="polite" className="text-small text-disputed">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="h-11 w-full cursor-pointer rounded-md bg-ink text-small font-medium text-paper transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "…" : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-small text-ink-muted">
          {isSignUp ? "Already have an account? " : "No account yet? "}
          <button
            type="button"
            onClick={() => {
              setMode(isSignUp ? "signin" : "signup");
              setError(null);
            }}
            className="cursor-pointer text-link underline underline-offset-4 hover:text-link-hover"
          >
            {isSignUp ? "Sign in" : "Create one"}
          </button>
        </p>

        <p className="mt-2 text-micro text-ink-faint">
          <Link to="/" className="hover:text-ink">
            ← Back
          </Link>
        </p>
      </div>
    </div>
  );
}
