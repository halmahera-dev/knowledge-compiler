---
status: accepted
supersedes: ADR 0002
---

# Capture returns to the conversation

[ADR 0002](0002-capture-is-its-own-page.md) gave capture its own page and argued
against folding it into the copilot. That page is now deleted and saving happens
in the chat at `/agent`, so 0002 is superseded rather than left contradicting the
code.

This is the second reversal of the same decision, which is worth saying plainly:
the question is genuinely close, and what settled it was not a new argument but a
product call — one surface to bring things to, rather than two.

## The objections in 0002, and what answers them

0002 raised two substantive objections. They were right, and neither is waved
away here.

**"The copilot is read-only, and that is the product."** This is the real cost,
and it is paid rather than argued away. The mitigation is that saving is the
*only* thing the copilot can change: it cannot edit a page, rename anything,
delete anything, or undo a save, and it is told to say so when asked. It also
cannot save without being told to in that turn — it offers, and waits. So the
boundary that matters is not "can this agent write", it is "can this agent
change what it already told you", and that answer is still no.

The answer path is untouched. Answers still come from the compiled briefing, the
only evidence is still a retrieved claim with its verbatim quote, and the refusal
still fires on the same rule it always did.

**"A compile is not a message."** Correct, and it is not rendered as one. The
five-stage feed was not dissolved into the transcript — it moved whole, with its
retry and its history, to the home page, where it sits beside the pages it
changes. You can still save three things and watch all three land on one screen
that stays put. What the conversation reports is the outcome of the *save* — a
title and that it is compiling — which is one fact, and fits in a sentence.

0002's third point stands unchanged: the extension still needs a panel rather
than a conversation. It moved to `/settings`, which is where installing-once
things belong.

## What the reversal buys

**One place to bring things to.** The gap 0002 accepted was that a reader
holding a link had to know which of two surfaces wanted it. Now there is one, and
the product's own claim — that this thing reads for you — is answered by pasting
into the same box you ask questions in.

**The model decides whether, never what.** A pasted article does not travel
through the model as a tool argument. It rides in the request context beside the
bearer token, and `saveToLibrary` stores it verbatim. Asking the model to hand a
10,000-word article back would charge for it twice and, worse, store a paraphrase
— every "verbatim" quote later compiled out of it would then be a quote of
something nobody wrote. A url is short and structured, so naming one is safe to
ask for.

**One implementation of capture.** The tool calls the same `POST /api/v1/items`
the page called, with the reader's own token, so dedupe, extraction, the SSRF
guard, embedding and the compile queue are the ones already in place.

## Consequences

- `capture` stays a reserved slug although nothing serves it. Freeing it would
  let a page compiled today take a slug every earlier page was refused, so the
  same title would resolve differently depending on when it was saved.
- `settings` joins the reserved slugs, for the reason 0002 gave about `capture`.
- PDFs do not go through the model at all. They upload from the composer
  straight to `POST /api/v1/items/pdf`, because binary cannot travel in a prompt
  and dragging a file onto the composer is already an unambiguous "save this".
  Nothing is asked before a file upload; a link or a passage is always asked
  about first, because a link someone wants explained is not a link they want
  kept.
- `POST /api/v1/items` returns the derived title. The caller cannot know it —
  it is read off the fetched page or the first line of a paste — and the copilot
  has to report what the library will actually call the thing.
- The compile feed still runs one SSE stream per workspace, now consumed on the
  home page.
