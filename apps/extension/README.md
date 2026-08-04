# Browser extension

Saving what you're reading into the knowledge base, from the toolbar or the
right-click menu.

Thin by design (HLD §3.2): it extracts readable text and POSTs it. All
compilation happens server-side, so there is no build step and no bundler — the
directory loads as-is.

## Two ways to save

**Right-click** is the one that matters. You are reading a thread, one comment is
worth keeping, and opening a popup to paste it back in defeats the point:

| Right-click on | Saves |
| --- | --- |
| A **selection** | Just that passage, titled from its opening words |
| The **page** | The readable article, extracted in the browser |
| A **link** | The URL, fetched and extracted server-side |

**The toolbar button** opens the popup, which previews what it found — title,
length, author, whether the page looks paywalled — before you commit. Use it when
you want to check before saving a whole article.

Either way the clip lands in **the workspace currently open in the app**, under
the account signed in there. The extension holds no state about either, so there
is nothing to get out of sync: it asks the app for a token at the moment of
saving, and the workspace comes back inside it.

Results arrive as a badge on the icon and a notification — a save with no sign of
having happened is one people repeat.

## Install

1. Start the stack (`pnpm dev` from the repo root) — both the API and the web app
   must be running; see [Authentication](#authentication) for why.
2. Open `chrome://extensions` (or `about:debugging` in Firefox).
3. Enable **Developer mode**.
4. **Load unpacked** → select this directory.
5. Copy the extension **ID** Chrome now shows on that card, and add it to `.env`
   at the repo root:

   ```
   BETTER_AUTH_TRUSTED_ORIGINS="chrome-extension://<the id you just copied>"
   ```

6. Restart the web app so it picks the value up.

Skipping steps 5–6 leaves clipping broken: the app will not hand a token to an
origin it does not know, so every save fails at the mint.

The popup's two fields — **API** (`http://localhost:8000`) and **App**
(`http://localhost:3000`) — are remembered across sessions.

## Going to production

Four things change, and one of them fails silently if missed.

**1. The extension id changes.** Loaded unpacked, the id is derived from the
folder path; packed or published, it comes from a signing key. So the id you put
in `BETTER_AUTH_TRUSTED_ORIGINS` during development is *not* the production id,
and a mismatch means every save is refused at the token mint.

Pick one:

- **Pin it** — add a `"key"` field (base64 DER public key) to `manifest.json`.
  The id is then the same unpacked, packed, and self-hosted. Keep the private key
  somewhere safe and out of the repo; losing it changes the id again.
- **Publish first** — upload to the Chrome Web Store, take the id it assigns, and
  set the production env to that.

The extension now names the id in the error when this happens, so the fix is
visible rather than guessed at.

**2. `config.js`** — set `DEFAULT_API` and `DEFAULT_APP` to the deployed URLs, so
nobody has to type them into the popup on first use.

**3. `manifest.json` → `host_permissions`** — add the same two origins. The
manifest cannot read `config.js`, and without this Chrome blocks the request
before it is made. Drop the localhost entries unless you still develop against
them.

**4. Production environment** — on the server:

| Variable | Value |
| --- | --- |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `chrome-extension://<production id>` |
| `BETTER_AUTH_URL` | the deployed app URL; it becomes the token's `iss`, which the API verifies |
| `CORS_ORIGINS` | the deployed web origin |
| `INTERNAL_API_TOKEN` | a real secret, never the published default |

The API accepts any `chrome-extension://` origin by regex, which is safe on its
own: it authenticates by bearer token, and issuing that token is what the
allowlist above controls.

---

## Files

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3 declaration. |
| `config.js` | The two URLs this build points at — one file to edit per deployment. |
| `background.js` | Service worker: registers the context menus and handles their clicks. |
| `save.js` | Token minting and posting, shared by the popup and the menu — two copies of an auth path is one too many. |
| `extract.js` | Injected on demand; picks the densest article-like container and strips chrome. |
| `metadata.js` | Structured-data pass; see [Metadata](#metadata). |
| `popup.html` | Popup UI, styled to match the web app's paper/ink tokens. |
| `popup.js` | Preview → save → report. |

## Permissions

`activeTab` and `scripting` are granted only for the tab you act on, and only on
a click — opening the popup or choosing a context-menu item. The extension cannot
read pages in the background. `contextMenus` adds the right-click entries;
`notifications` is how a background save reports back, since there is no popup
open to report into.
`host_permissions` covers exactly two origins: the API it posts to, and the app it
borrows a session from.

To point at a deployed API or app, add those origins to `host_permissions` in
`manifest.json` and reload the extension.

## Icon

`icon-{16,32,48,128}.png` — three rules that shorten downward, for sources
converging into one compiled line. Drawn at 8× and downsampled, because at 16px
the difference between a mark and a smudge is entirely in the antialiasing.
Regenerate them by editing the generator in the commit that added them.

## Metadata

`metadata.js` runs alongside the readability pass and reads structured data in a
fixed precedence: JSON-LD → `citation_*` (Highwire, used by journals and arXiv) →
Dublin Core → OpenGraph/Twitter → DOM fallbacks. A later source never overwrites
an earlier one, so a publisher's own JSON-LD beats its share-card copy.

This is not decoration. Author and date let the compiler tell a contradiction
from a supersession, which it otherwise has to guess at. A paywall signal is also
recorded, because a clipped teaser compiles into a page that looks complete and
says nothing.

## Authentication

The extension has no login of its own, and deliberately stores no credential. It
borrows the app's session: before each save it calls `GET /api/auth/token` on the
web app with `credentials: "include"`, and Better Auth mints a 15-minute
workspace-scoped JWT from the session cookie. So the extension never sees a
password, holds nothing worth stealing, and always clips into whichever workspace
the app currently has open. If you are signed out, the popup says so and offers to
open the sign-in page.

Two things gate that mint, and both are deliberate:

- **`BETTER_AUTH_TRUSTED_ORIGINS`** must name this extension's origin. It defaults
  to empty rather than `chrome-extension://*`, because a wildcard would let *any*
  installed extension turn a signed-in session into a workspace token.
- **CORS** is emitted by the app only for origins on that list, so an unlisted
  extension is blocked by the browser before it reads the response.

The API (port 8000) accepts any `chrome-extension://` origin by regex, which is
fine on its own: it authenticates by bearer token, and the token is what the
allowlist above controls.

### Verified

A listed origin mints a token and clips successfully; an unlisted origin gets no
CORS header and is told so by id; a session with no active workspace gets a 409
rendered as "No workspace is selected".

Chrome does send the app's session cookie on the extension's cross-origin fetch —
confirmed by running it. The `SameSite=Lax` concern noted here previously does not
apply.
