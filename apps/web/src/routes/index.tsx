/**
 * The landing page.
 *
 * Built as the title page of a reference work rather than as a product hero: the
 * thing being sold is a wiki you can check, so the page is set in the same paper,
 * ink and serif the wiki uses. Someone who signs up should recognise the app they
 * arrive in.
 *
 * The argument is carried by {@link CompileDemo} — three real sources going in
 * and a cited page with a live disagreement coming out — because the claim that
 * separates this from a summariser is one a feature list cannot make.
 */
import { Link, createFileRoute } from "@tanstack/react-router";

import { CompileDemo } from "~/components/compile-demo";

export const Route = createFileRoute("/")({
  component: LandingPage,
  // The one page that gets shared before anyone has an account, so the title
  // carries the pitch rather than just the product name.
  head: () => ({
    meta: [{ title: "Knowledge Compiler — read it once, it stays read" }],
  }),
});

/** The three things it deliberately is not. Positioning, stated as refusals. */
const REFUSALS = [
  {
    not: "Not a search box",
    // Sharpened because the page also demonstrates asking questions: the claim
    // is about when the reading happens, not about whether you may ask.
    body: "You can ask it things. It answers from what it already compiled, rather than re-reading your library at question time.",
  },
  {
    not: "Not a folder",
    body: "Nothing to file, tag or tidy. Pages find their own place and link themselves.",
  },
  {
    not: "Not a summariser",
    body: "Every sentence carries the passage it came from. When two sources disagree the page keeps both — deciding for you is how a summary becomes a rumour.",
  },
] as const;

/**
 * A citation marker inside prose.
 *
 * Marked `aria-hidden` and paired with a visually-hidden label, so a screen
 * reader hears "citation 1" rather than the bare digit running into the sentence
 * before it.
 */
function SupCite({ n }: { n: number }) {
  return (
    <sup className="ml-0.5">
      <span className="sr-only">citation {n}</span>
      <span aria-hidden="true" className="font-mono text-micro text-link">
        [{n}]
      </span>
    </sup>
  );
}

function LandingPage() {
  return (
    <div className="paper-grain">
      {/* Deliberately not the app header: no nav to pages you cannot reach yet. */}
      <header className="mx-auto flex max-w-[76rem] items-center justify-between px-5 py-5">
        <p className="flex items-baseline gap-2.5">
          <span className="font-read text-[1.3rem] font-semibold tracking-tight">Compiler</span>
          <span className="eyebrow hidden sm:inline">knowledge base</span>
        </p>
        <Link
          to="/signin"
          search={{ redirect: "/capture", mode: "signin" }}
          className="text-small text-ink-muted underline-offset-4 transition-colors duration-fast hover:text-ink hover:underline"
        >
          Sign in
        </Link>
      </header>

      {/* Masthead. Asymmetric on purpose — a centred headline with a button under
          it is the one arrangement every landing page already has. */}
      <section className="mx-auto max-w-[76rem] px-5">
        <div className="flex items-center gap-4 border-t border-ink pt-3">
          <span className="eyebrow">Personal knowledge base</span>
          <span aria-hidden="true" className="h-px flex-1 bg-rule" />
          <span className="eyebrow hidden sm:inline">Compile-time, not query-time</span>
        </div>

        <div className="grid gap-10 pb-14 pt-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <h1 className="font-read text-display font-semibold leading-[0.98] tracking-[-0.03em]">
              Read it once.
              <br />
              It stays read.
            </h1>

            <p className="prose-read mt-6 text-lead text-ink-muted">
              Save a link, a passage, or a PDF. An agent reads it, writes down what it
              claims, and folds that into a wiki that already knows what you saved before.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/signin"
                search={{ redirect: "/capture", mode: "signup" }}
                className="flex h-12 items-center rounded-md bg-ink px-6 text-small font-medium text-paper transition-opacity duration-fast hover:opacity-90"
              >
                Start a workspace
              </Link>
              <Link
                to="/signin"
                search={{ redirect: "/capture", mode: "signin" }}
                className="text-small text-ink-muted underline decoration-rule-strong underline-offset-4 transition-colors duration-fast hover:text-link"
              >
                I already have one
              </Link>
            </div>
          </div>

          {/* Colophon: the three commitments, set as marginalia against a rule —
              the form a printed reference uses for exactly this. */}
          <aside className="lg:col-span-4 lg:col-start-9 lg:pt-3">
            <dl className="border-l border-rule pl-5">
              {[
                ["Compiles on save", "Not on every question."],
                ["Cites every sentence", "The passage, not just the link."],
                ["Keeps contradictions", "Marked, never quietly merged."],
              ].map(([term, detail]) => (
                <div key={term} className="mt-5 first:mt-0">
                  <dt className="font-mono text-micro uppercase tracking-wider text-ink">
                    {term}
                  </dt>
                  <dd className="mt-1 text-small leading-relaxed text-ink-muted">{detail}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <div className="border-y border-rule bg-paper py-14">
        <CompileDemo />
      </div>

      {/* The copilot, shown as one exchange rather than described.
          Its whole claim is that answers are checkable, which is a thing you can
          only judge by seeing an answer next to the passage behind it. */}
      <section
        aria-labelledby="ask-heading"
        className="mx-auto max-w-[76rem] px-5 pb-4 pt-16"
      >
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <p className="eyebrow">And then ask it</p>
            <h2
              id="ask-heading"
              className="mt-2 font-read text-h2 font-semibold leading-tight tracking-[-0.02em]"
            >
              Answers you can check.
            </h2>
            <p className="mt-4 text-small leading-relaxed text-ink-muted">
              Answered only from what this workspace compiled, each sentence carrying the
              claim it rests on. Threads are saved, so you can pick one up later.
            </p>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <div className="rounded-lg border border-rule bg-surface p-5">
              <p className="font-read text-h3 font-semibold leading-snug">
                Why does quantisation hurt accuracy unevenly?
              </p>
              <p className="prose-read mt-3 text-ink">
                A small number of channels carry outlier activations, and quantising them
                uniformly is what dominates the error
                <SupCite n={1} /> — which is why aggregate benchmarks can look flat while
                multi-step reasoning drops
                <SupCite n={2} />.
              </p>
              <ul className="mt-4 space-y-2 border-t border-rule pt-3">
                {[
                  ["1", "LLM.int8()", "quantising these uniformly is what destroys accuracy at scale"],
                  ["2", "Reasoning under 4-bit weights", "4-bit models lose 9–14 points"],
                ].map(([n, source, quote]) => (
                  <li key={n} className="flex gap-2">
                    <span className="font-mono text-micro text-ink-faint">[{n}]</span>
                    <span className="min-w-0">
                      <span className="font-read text-small italic text-ink-muted">
                        &ldquo;{quote}&rdquo;
                      </span>
                      <span className="ml-2 font-mono text-micro text-ink-faint">
                        {source}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How the thing is shaped.
          Stated plainly because it is the part people get wrong on arrival: they
          assume one account means one pile. Rendered as nesting rather than as
          three bullets, so the containment is visible instead of asserted. */}
      <section aria-labelledby="shape-heading" className="mx-auto max-w-[76rem] px-5 py-16">
        <p className="eyebrow">How it is arranged</p>
        <h2
          id="shape-heading"
          className="mt-2 font-read text-h2 font-semibold tracking-[-0.02em]"
        >
          One account, as many workspaces as you keep subjects.
        </h2>

        <div className="mt-7 max-w-[46rem] rounded-lg border border-rule bg-sunken p-5">
          <p className="font-mono text-micro uppercase tracking-wider text-ink-faint">
            Your account
          </p>
          <div className="mt-3 space-y-3 border-l border-rule-strong pl-5">
            {[
              ["Thesis", "41 captures · 12 pages"],
              ["Work reading", "18 captures · 6 pages"],
            ].map(([name, contents]) => (
              <div key={name} className="rounded-md border border-rule bg-surface px-4 py-3">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-read text-body font-semibold">{name}</span>
                  <span className="font-mono text-micro text-ink-faint">{contents}</span>
                </p>
                <p className="mt-1 text-small text-ink-muted">
                  Its own wiki, graph, gaps and conversations.
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-small leading-relaxed text-ink-muted">
            Nothing crosses between them. A question asked in one is answered only from
            what that one has read.
          </p>
        </div>
      </section>

      {/* Positioning. Prose in the reading face rather than a comparison table —
          the distinctions are arguments, and a row of ticks cannot carry one. */}
      <section aria-labelledby="refusals-heading" className="mx-auto max-w-[76rem] px-5 py-16">
        <h2 id="refusals-heading" className="sr-only">
          What it is not
        </h2>
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {REFUSALS.map(({ not, body }) => (
            <div key={not}>
              <p className="font-read text-h3 font-semibold tracking-[-0.01em]">{not}</p>
              <span aria-hidden="true" className="mt-3 block h-px w-10 bg-ink" />
              <p className="mt-3 font-read text-small leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="mx-auto flex max-w-[76rem] flex-wrap items-end justify-between gap-6 px-5 py-14">
          <div>
            <p className="eyebrow">Nothing to configure</p>
            <p className="mt-2 max-w-[34ch] font-read text-h2 font-semibold leading-tight tracking-[-0.02em]">
              Your first page compiles about a minute after your first save.
            </p>
          </div>
          <Link
            to="/signin"
            search={{ redirect: "/capture", mode: "signup" }}
            className="flex h-12 items-center rounded-md bg-ink px-6 text-small font-medium text-paper transition-opacity duration-fast hover:opacity-90"
          >
            Start a workspace
          </Link>
        </div>
      </section>

      {/* The footer held one line restating the page above it. The call to
          action is the last thing worth reading here. */}
    </div>
  );
}
