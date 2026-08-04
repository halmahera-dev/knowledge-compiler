/**
 * Ask — conversations with the workspace copilot.
 *
 * Answers come only from what this workspace has compiled, and every citation
 * opens the claim behind it. That constraint is the feature: a copilot that could
 * also invent would make the compiled wiki pointless, because you could no longer
 * tell which sentences were grounded.
 *
 * Threads belong to the workspace rather than to the person who opened them —
 * the same rule as the evidence they rest on.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { AlertIcon, PlusIcon, QuoteIcon } from "~/components/icons";
import {
  ApiError,
  api,
  type ChatMessage,
  type ChatSession,
  type ChatSessionDetail,
} from "~/lib/api";
import { askCopilot } from "~/lib/copilot";
import { renderMarkdown } from "~/lib/markdown";
import { requireSession } from "~/lib/guards";
import { titleHead } from "~/lib/head";

export const Route = createFileRoute("/ask")({
  beforeLoad: requireSession,
  component: AskPage,
  loader: async () => {
    try {
      return { sessions: await api.listConversations() };
    } catch {
      return { sessions: [] as ChatSession[] };
    }
  },
  head: titleHead("Ask"),
});

const EXAMPLES = [
  "What do my sources disagree about?",
  "What did I read about provenance?",
  "Summarise what I know about embeddings",
];

function AskPage() {
  const { sessions: initialSessions } = Route.useLoaderData();

  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [thread, setThread] = useState<ChatSessionDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held apart from the thread so the question appears the moment it is asked,
  // before there is anything stored to render it from.
  const [pending, setPending] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  async function openThread(id: string) {
    setError(null);
    try {
      setThread(await api.openConversation(id));
    } catch {
      setError("That conversation could not be opened.");
    }
  }

  function newThread() {
    setThread(null);
    setPending(null);
    setError(null);
    inputRef.current?.focus();
  }

  async function removeThread(id: string) {
    await api.deleteConversation(id).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (thread?.id === id) setThread(null);
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    setQuestion("");
    setPending(trimmed);

    try {
      // Created on the first question rather than on arrival, so opening Ask and
      // leaving does not litter the list with empty threads.
      const session = thread ?? (await api.startConversation());
      const history = (session.messages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const answer = await askCopilot(trimmed, history);
      const updated = await api.appendTurn(session.id, { question: trimmed, ...answer });

      setThread(updated);
      setSessions((prev) => [
        {
          id: updated.id,
          title: updated.title,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          messageCount: updated.messages.length,
        },
        ...prev.filter((s) => s.id !== updated.id),
      ]);
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Something went wrong.",
      );
    } finally {
      setPending(null);
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto grid max-w-[76rem] gap-8 px-5 py-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Conversations</h2>
          <button
            type="button"
            onClick={newThread}
            className="flex cursor-pointer items-center gap-1 rounded-sm px-1.5 py-1 text-micro text-ink-muted transition-colors duration-fast hover:bg-sunken hover:text-ink"
          >
            <PlusIcon width={12} height={12} />
            New
          </button>
        </div>

        <ul className="mt-3 space-y-0.5">
          {sessions.map((session) => {
            const active = thread?.id === session.id;
            return (
              <li key={session.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openThread(session.id)}
                  aria-current={active ? "true" : undefined}
                  className={`min-w-0 flex-1 cursor-pointer truncate rounded-sm px-2 py-1.5 text-left text-small transition-colors duration-fast ${
                    active
                      ? "bg-sunken font-medium text-ink"
                      : "text-ink-muted hover:bg-sunken hover:text-ink"
                  }`}
                >
                  {session.title}
                </button>
                <button
                  type="button"
                  onClick={() => removeThread(session.id)}
                  aria-label={`Delete ${session.title}`}
                  className="shrink-0 cursor-pointer rounded-sm px-1.5 py-1 text-small text-ink-faint opacity-0 transition-opacity duration-fast hover:text-disputed focus-visible:opacity-100 group-hover:opacity-100"
                >
                  ×
                </button>
              </li>
            );
          })}
          {sessions.length === 0 && (
            <li className="px-2 py-1.5 text-small text-ink-faint">None yet.</li>
          )}
        </ul>
      </aside>

      <section className="min-w-0">
        <header className="border-b border-rule pb-5">
          <h1 className="font-read text-h1 font-semibold tracking-[-0.02em]">
            {thread?.title ?? "Ask"}
          </h1>
          <p className="mt-2 max-w-[58ch] text-small leading-relaxed text-ink-muted">
            Answered from this workspace&rsquo;s pages, with the claim behind every
            sentence. If your notes don&rsquo;t cover it, it says so.
          </p>
        </header>

        <div className="mt-7 space-y-8">
          {(thread?.messages ?? []).map((message) => (
            <Turn key={message.id} message={message} />
          ))}

          {pending && (
            <article>
              <h2 className="font-read text-h3 font-semibold leading-snug">{pending}</h2>
              <p className="mt-2 flex items-center gap-2 text-small text-ink-faint">
                <span className="size-1.5 animate-pulse rounded-full bg-ink-faint" />
                Reading your pages…
              </p>
            </article>
          )}

          {!thread && !pending && (
            <ul className="space-y-2">
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => ask(example)}
                    className="cursor-pointer text-left font-read text-body text-ink-muted decoration-rule-strong underline-offset-4 transition-colors duration-fast hover:text-link hover:underline"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="sticky bottom-0 mt-8 bg-paper pb-2 pt-4"
        >
          <label htmlFor="question" className="sr-only">
            Your question
          </label>
          <textarea
            id="question"
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ask(question);
            }}
            rows={2}
            placeholder={thread ? "Ask a follow-up…" : "Ask about anything you've saved…"}
            className="w-full resize-y rounded-md border border-rule bg-surface px-4 py-3 font-read text-body leading-relaxed transition-colors duration-fast placeholder:text-ink-faint hover:border-rule-strong focus:border-link"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="h-10 cursor-pointer rounded-md bg-ink px-5 text-small font-medium text-paper transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Thinking…" : "Ask"}
            </button>
            <kbd className="hidden font-mono text-micro text-ink-faint sm:inline">
              Ctrl/Cmd + Enter
            </kbd>
            {error && (
              <span role="alert" className="text-small text-disputed">
                {error}
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function Turn({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return <h2 className="font-read text-h3 font-semibold leading-snug">{message.content}</h2>;
  }

  return (
    <article className="rise-in">
      {message.refused && (
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-sm bg-merged-bg px-2 py-1 text-merged">
          <AlertIcon width={13} height={13} />
          <span className="font-mono text-micro uppercase tracking-wider">
            not in your notes
          </span>
        </p>
      )}

      {/* Markdown, with the citation markers inside it turned into links. Plain
          paragraphs left `**bold**` as literal asterisks and ran a whole list
          together on one line. */}
      <div className="prose-read text-ink">
        {renderMarkdown(message.content, message.citations)}
      </div>

      {message.claims.length > 0 && (
        <details className="mt-4 border-t border-rule pt-3">
          <summary className="eyebrow cursor-pointer hover:text-link">
            {message.citations.length} cited &middot; {message.claims.length} consulted
          </summary>
          <ul className="mt-3 space-y-3">
            {message.claims.map((claim) => (
              <li key={claim.claimId} className="border-l-2 border-rule pl-3">
                <p className="font-read text-small leading-relaxed">{claim.text}</p>
                {claim.quote && (
                  <blockquote className="mt-1 flex gap-1.5 font-read text-small italic leading-relaxed text-ink-muted">
                    <QuoteIcon width={12} height={12} className="mt-1 shrink-0" />
                    <span>&ldquo;{claim.quote}&rdquo;</span>
                  </blockquote>
                )}
                <p className="mt-1 font-mono text-micro text-ink-faint">
                  <Link
                    to="/wiki/$slug"
                    params={{ slug: claim.pageSlug }}
                    className="text-link hover:text-link-hover"
                  >
                    {claim.pageTitle}
                  </Link>
                  {claim.status === "disputed" && (
                    <span className="ml-2 text-disputed">disputed</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
