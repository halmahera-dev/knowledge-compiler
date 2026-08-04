/**
 * Capture — the four save modes (PRD §6.1) beside the live compile feed.
 *
 * The two are side by side on purpose: the payoff for saving something is
 * watching it land in the knowledge base, and that only reads as a payoff if you
 * can see it happen from where you saved.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { DiffCard, FailedCard, PendingCard, RunCard } from "~/components/compile-diff";
import { BookIcon, LinkIcon, PlusIcon, QuoteIcon } from "~/components/icons";
import { useTablist } from "~/hooks/use-tablist";
import {
  ApiError,
  api,
  subscribeToCompileEvents,
  type CaptureType,
  type CompileDiff,
  type Run,
} from "~/lib/api";
import { getToken } from "~/lib/token";
import { titleHead } from "~/lib/head";
import { requireSession } from "~/lib/guards";
import { announce, formatSize, sentence, spokenTitle } from "~/lib/format";

export const Route = createFileRoute("/capture")({
  beforeLoad: requireSession,
  head: titleHead("Capture"),
  component: CapturePage,
  loader: async () => {
    // The feed is prior state; a cold API should still render the capture form.
    try {
      return { runs: await api.listRuns() };
    } catch {
      return { runs: [] as Run[] };
    }
  },
});

const MODES = [
  {
    id: "paste" as const,
    label: "Paste excerpt",
    Icon: QuoteIcon,
    hint: "No source page needed.",
    placeholder: "Paste the part that mattered…",
  },
  {
    id: "link" as const,
    label: "Save a link",
    Icon: LinkIcon,
    hint: "Fetched and extracted server-side.",
    placeholder: "https://…",
  },
  {
    id: "extension" as const,
    label: "Browser extension",
    Icon: PlusIcon,
    hint: "",
    placeholder: "",
  },
  {
    id: "pdf" as const,
    label: "Upload PDF",
    Icon: BookIcon,
    hint: "Needs a text layer; a scan without OCR has nothing to read.",
    placeholder: "",
  },
];

/**
 * Which tab is showing.
 *
 * Wider than `CaptureType` on purpose: "extension" is a tab, not a way of
 * capturing. Nothing is submitted from it, so it has no server-side counterpart
 * — and typing it as a CaptureType would let it be posted as one.
 */
type Mode = (typeof MODES)[number]["id"];

/**
 * Mirrors `max_pdf_bytes` in the API settings.
 *
 * Checked here as well as there so a 200MB file is refused instantly instead of
 * being uploaded in full only to be rejected.
 */
const MAX_PDF_BYTES = 40 * 1024 * 1024;

/** A run that is mid-flight, tracked from SSE rather than from the loader. */
interface LiveRun {
  runId: string;
  title: string | null;
  step: string;
  detail: string;
}

function CapturePage() {
  const { runs: initialRuns } = Route.useLoaderData();

  const [mode, setMode] = useState<Mode>("paste");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "info" | "error";
    text: string;
    /** A compiled page worth opening, when the notice refers to one. */
    pageSlug?: string | null;
  } | null>(null);

  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [live, setLive] = useState<Record<string, LiveRun>>({});
  const [completed, setCompleted] = useState<CompileDiff[]>([]);
  const [failed, setFailed] = useState<{ runId: string; title: string | null; error: string }[]>([]);
  const [streamDown, setStreamDown] = useState(false);
  // Spoken, not shown. Kept separate from `notice`, which is about the save.
  const [spoken, setSpoken] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0]!;
  const canSubmit = mode === "pdf" ? file !== null : value.trim().length > 0;
  const tabs = useTablist({
    ids: MODES.map((m) => m.id),
    active: mode,
    onChange: setMode,
    name: "capture",
  });

  /** Shared by the picker and the drop target, so both reject the same things. */
  function chooseFile(candidate: File | undefined) {
    if (!candidate) return;

    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      setNotice({ kind: "error", text: "That is not a PDF." });
      return;
    }
    if (candidate.size > MAX_PDF_BYTES) {
      setNotice({
        kind: "error",
        text: `That PDF is ${Math.round(candidate.size / 1024 / 1024)}MB — the limit is ${MAX_PDF_BYTES / 1024 / 1024}MB.`,
      });
      return;
    }

    setNotice(null);
    setFile(candidate);
  }

  useEffect(() => {
    let unsubscribe = () => {};
    // Guards the gap between mount and the token arriving: without it, a page
    // left before `getToken` resolves still opens a stream, and the cleanup that
    // already ran can no longer close it. Every such navigation leaks one
    // EventSource for the life of the tab.
    let cancelled = false;

    // The stream is scoped by the same token as every other call, so it is
    // opened only once one exists.
    getToken().then((token) => {
      if (cancelled) return;
      unsubscribe = subscribeToCompileEvents(
      (event) => {
        setStreamDown(false);
        switch (event.type) {
          case "run.started":
            setLive((prev) => ({
              ...prev,
              [event.runId]: {
                runId: event.runId,
                title: event.title,
                step: "extract",
                detail: "Starting",
              },
            }));
            setSpoken(sentence(`Compiling ${spokenTitle(event.title)}`));
            break;
          case "run.step":
            setLive((prev) => {
              const existing = prev[event.runId];
              if (!existing) return prev;
              return {
                ...prev,
                [event.runId]: { ...existing, step: event.step, detail: event.detail },
              };
            });
            break;
          case "run.succeeded":
            // Promote out of `live` so the card swaps from progress to diff.
            setLive(({ [event.runId]: _done, ...rest }) => rest);
            setCompleted((prev) => [event.diff, ...prev]);
            setSpoken(announce(event.diff));
            break;
          case "run.failed":
            setLive(({ [event.runId]: done, ...rest }) => {
              setFailed((prev) => [
                { runId: event.runId, title: done?.title ?? null, error: event.error },
                ...prev,
              ]);
              return rest;
            });
            setSpoken(`Compile failed: ${event.error}`);
            break;
        }
      },
        () => setStreamDown(true),
        token,
      );
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const submit = useCallback(async () => {
    const trimmed = value.trim();
    if (submitting) return;
    // The extension tab has no form; saving happens in the page you are reading.
    if (mode === "extension") return;
    if (mode === "pdf" ? !file : !trimmed) return;

    setSubmitting(true);
    setNotice(null);
    try {
      let result;
      if (mode === "pdf") {
        result = await api.uploadPdf(file!);
      } else if (mode === "link") {
        result = await api.createItem({ captureType: "link", sourceUrl: trimmed });
      } else {
        result = await api.createItem({ captureType: mode, content: trimmed });
      }

      if (result.duplicate) {
        // Naming the match matters: told only "already saved", there is no way to
        // tell whether the right thing was matched or something went wrong.
        const matched = result.duplicateOf?.title;
        setNotice({
          kind: "info",
          text: matched
            ? `Already saved as “${matched}” — nothing to recompile.`
            : "Already saved — nothing to recompile.",
          pageSlug: result.duplicateOf?.pageSlug ?? null,
        });
      } else {
        setValue("");
        setFile(null);
        setNotice({
          kind: "info",
          // A long PDF becomes several compiles, so the feed is about to show
          // more cards than things saved. Said up front, that reads as intended.
          text:
            result.partsQueued > 1
              ? `Saved. Too long for one pass, so it is compiling in ${result.partsQueued} parts…`
              : "Saved. Compiling…",
        });
      }
      setRuns(await api.listRuns().catch(() => runs));
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof ApiError ? error.message : "Could not reach the API.",
      });
    } finally {
      setSubmitting(false);
      if (mode !== "pdf") textareaRef.current?.focus();
    }
  }, [mode, value, file, submitting, runs]);

  const retryRun = useCallback(async (runId: string) => {
    try {
      await api.retryRun(runId);
      // Refetched rather than patched locally: the run comes back as queued, and
      // the SSE stream takes it from there.
      setRuns(await api.listRuns());
      setNotice({ kind: "info", text: "Queued again. Compiling…" });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof ApiError ? error.message : "Could not queue it again.",
      });
    }
  }, []);

  // Runs already represented by a live card or a fresh diff would otherwise
  // appear twice once the loader data and the stream overlap.
  const shownIds = new Set([
    ...Object.keys(live),
    ...completed.map((d) => d.runId),
    ...failed.map((f) => f.runId),
  ]);
  const history = runs.filter((run) => !shownIds.has(run.id));

  return (
    <div className="mx-auto grid max-w-[76rem] gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
      {/* ── capture ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="capture-heading" className="lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow">Capture</p>
        <h1
          id="capture-heading"
          className="mt-2 font-read text-h1 font-semibold leading-[1.08] tracking-[-0.02em]"
        >
          Everything you read,
          <br />
          <span className="italic text-ink-muted">compiled</span> into one wiki.
        </h1>
        <p className="mt-4 max-w-[46ch] text-small leading-relaxed text-ink-muted">
          An agent reads it, works out where it belongs, and shows you what changed.
        </p>

        <div
          role="tablist"
          aria-label="Capture mode"
          data-tour="capture-modes"
          className="mt-8 flex gap-1 rounded-md bg-sunken p-1"
        >
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              {...tabs.tabProps(id)}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-sm px-3 py-2.5 text-small transition-all duration-fast ${
                mode === id
                  ? "bg-surface font-medium text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              <Icon width={15} height={15} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4" {...tabs.panelProps}>
          <label htmlFor="capture-input" className="eyebrow">
            {activeMode.label}
          </label>
          {mode === "pdf" ? (
            <div
              // Drop target as well as a picker: dragging a paper in from a
              // downloads folder is how this actually gets used.
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                chooseFile(e.dataTransfer.files[0]);
              }}
              className={`mt-2 rounded-md border border-dashed p-8 text-center transition-colors duration-fast ${
                dragging ? "border-link bg-sunken" : "border-rule hover:border-rule-strong"
              }`}
            >
              <input
                id="capture-input"
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => chooseFile(e.target.files?.[0])}
                className="sr-only"
              />

              {file ? (
                <>
                  <p className="font-read text-body">{file.name}</p>
                  <p className="mt-1 font-mono text-micro text-ink-faint">
                    {formatSize(file.size)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="mt-3 cursor-pointer text-small text-ink-muted underline decoration-rule-strong underline-offset-4 transition-colors duration-fast hover:text-link"
                  >
                    Choose a different one
                  </button>
                </>
              ) : (
                <>
                  <p className="font-read text-body text-ink-muted">
                    Drop a PDF here, or{" "}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer text-link underline decoration-rule-strong underline-offset-4 hover:text-link-hover"
                    >
                      browse
                    </button>
                  </p>
                  <p className="mt-1 font-mono text-micro text-ink-faint">
                    up to {MAX_PDF_BYTES / 1024 / 1024}MB
                  </p>
                </>
              )}
            </div>
          ) : mode === "link" ? (
            <input
              id="capture-input"
              type="url"
              inputMode="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={activeMode.placeholder}
              className="mt-2 w-full rounded-md border border-rule bg-surface px-4 py-3.5 font-mono text-small text-ink transition-colors duration-fast placeholder:text-ink-faint hover:border-rule-strong focus:border-link"
            />
          ) : mode === "extension" ? (
            <ExtensionPanel />
          ) : (
            <textarea
              id="capture-input"
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
              placeholder={activeMode.placeholder}
              rows={9}
              className="mt-2 w-full resize-y rounded-md border border-rule bg-surface px-4 py-3.5 font-read text-body leading-relaxed text-ink transition-colors duration-fast placeholder:text-ink-faint hover:border-rule-strong focus:border-link"
            />
          )}
          {activeMode.hint && <p className="mt-2 text-micro text-ink-faint">{activeMode.hint}</p>}
        </div>

        {/* Nothing to submit from the extension tab — the saving happens in the
            page you are reading, not here. */}
        {mode !== "extension" && (
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !canSubmit}
              className="h-11 cursor-pointer rounded-md bg-ink px-6 text-small font-medium text-paper transition-all duration-fast hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (mode === "pdf" ? "Uploading…" : "Saving…") : "Save and compile"}
            </button>
            {mode !== "pdf" && (
              <kbd className="hidden font-mono text-micro text-ink-faint sm:inline">
                {mode === "link" ? "Enter" : "Ctrl/Cmd + Enter"}
              </kbd>
            )}
          </div>
        )}

        {notice && (
          // Announced politely so a screen reader hears the result without
          // losing the caret in the textarea.
          <p
            role="status"
            aria-live="polite"
            className={`mt-3 text-small ${
              notice.kind === "error" ? "text-disputed" : "text-ink-muted"
            }`}
          >
            {notice.text}
            {notice.pageSlug && (
              <>
                {" "}
                <Link
                  to="/wiki/$slug"
                  params={{ slug: notice.pageSlug }}
                  className="text-link underline underline-offset-4 hover:text-link-hover"
                >
                  Open the page
                </Link>
              </>
            )}
          </p>
        )}
      </section>

      {/* ── feed ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="feed-heading" data-tour="compile-feed" className="min-w-0">
        {/* Announcements only — the cards below carry the same information
            visually, and duplicating them into the live region would read the
            whole diff aloud on every event. */}
        <p role="status" aria-live="polite" className="sr-only">
          {spoken}
        </p>

        <div className="flex items-baseline justify-between">
          <h2 id="feed-heading" className="eyebrow">
            Compile activity
          </h2>
          {streamDown && (
            <span className="text-micro text-ink-faint">
              live feed disconnected
            </span>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {Object.values(live).map((run) => (
            <PendingCard
              key={run.runId}
              title={run.title}
              step={run.step}
              detail={run.detail}
            />
          ))}
          {failed.map((f) => (
            <FailedCard key={f.runId} title={f.title} error={f.error} />
          ))}
          {completed.map((diff) => (
            <DiffCard key={diff.runId} diff={diff} />
          ))}
          {history.map((run) => (
            <RunCard key={run.id} run={run} onRetry={retryRun} />
          ))}

          {history.length === 0 &&
            completed.length === 0 &&
            failed.length === 0 &&
            Object.keys(live).length === 0 && (
              <div className="rounded-lg border border-dashed border-rule p-10 text-center">
                <p className="font-read text-lead text-ink-muted">
                  Nothing compiled yet.
                </p>
                <p className="mt-2 text-small text-ink-faint">
                  Save something to begin.
                </p>
              </div>
            )}
        </div>
      </section>
    </div>
  );
}

/** Where the packed extension lives. Empty until it is published. */
const STORE_URL = "";

/**
 * The extension tab.
 *
 * This used to be a textarea for pasting a whole article, which asked you to do
 * by hand exactly what the extension exists to do: select everything, copy,
 * switch tabs, paste. The paste tab already covers pasting; this one now sends
 * you to the tool instead.
 *
 * There is no install button when the extension is unpublished, and that is not
 * an omission. Chrome removed inline installation in version 71 — a page cannot
 * install an extension, and no amount of scripting brings it back. Pretending
 * otherwise with a button that opens instructions would be a button that lies
 * about what it does.
 */
function ExtensionPanel() {
  return (
    <div className="mt-2 rounded-md border border-rule bg-surface px-5 py-5">
      <p className="font-read text-body leading-relaxed text-ink">
        Save from the page you are reading — no copying, no switching tabs.
      </p>
      <ul className="mt-3 space-y-1.5 text-small leading-relaxed text-ink-muted">
        <li>Click the toolbar icon to clip the readable article.</li>
        <li>Or right-click a selection, the page, or a link.</li>
        <li>It lands in whichever workspace is open here, under this account.</li>
      </ul>

      {STORE_URL ? (
        <a
          href={STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex h-11 items-center rounded-md bg-ink px-5 text-small font-medium text-paper transition-opacity duration-fast hover:opacity-90"
        >
          Add to Chrome
        </a>
      ) : (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="eyebrow">Not published yet — load it unpacked</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-small leading-relaxed text-ink-muted">
            <li>
              Open{" "}
              <code className="rounded-sm bg-sunken px-1 font-mono text-micro">
                chrome://extensions
              </code>{" "}
              and turn on Developer mode.
            </li>
            <li>
              Choose <span className="text-ink">Load unpacked</span>, then the{" "}
              <code className="rounded-sm bg-sunken px-1 font-mono text-micro">apps/extension</code>{" "}
              folder.
            </li>
            <li>
              Copy the extension id onto{" "}
              <code className="rounded-sm bg-sunken px-1 font-mono text-micro">
                BETTER_AUTH_TRUSTED_ORIGINS
              </code>{" "}
              and restart the app, or every save is refused.
            </li>
          </ol>
          {/* chrome:// cannot be linked from a page either — Chrome blocks the
              navigation — so the address is given as text to copy. */}
          <p className="mt-3 text-micro leading-relaxed text-ink-faint">
            Chrome does not allow a website to install an extension, or even to
            open its own settings page. Both steps have to be yours.
          </p>
        </div>
      )}
    </div>
  );
}
