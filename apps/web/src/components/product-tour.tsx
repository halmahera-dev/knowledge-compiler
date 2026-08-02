/**
 * The guided tour behind the navbar's Visual Help button.
 *
 * Anchored to real elements rather than shown as a slideshow of screenshots: the
 * point is to show where a thing *is*, and a picture of the interface teaches
 * nothing about the interface you are looking at. Each step highlights its target
 * in place and explains it beside it.
 *
 * Steps whose target is absent are skipped rather than shown pointing at nothing —
 * the sidebar only exists on Ask, the feed only on Capture.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CompassIcon } from "~/components/icons";

interface Step {
  /** Matched against `data-tour` on the element to highlight. */
  target: string;
  title: string;
  body: string;
}

/**
 * The tour, in the order the product is actually used.
 *
 * Deliberately follows the hierarchy the product is built on — an account holds
 * workspaces, a workspace holds captures — because that is the part people get
 * wrong when they arrive.
 */
const STEPS: Step[] = [
  {
    target: "workspace",
    title: "Workspaces hold everything",
    body: "One account can keep several. Each has its own captures, wiki, graph and conversations, and nothing crosses between them.",
  },
  {
    target: "nav-capture",
    title: "Save what you read",
    body: "A passage, a link, a whole article, or a PDF. Saving is the only thing you have to do.",
  },
  {
    target: "capture-modes",
    title: "Four ways in",
    body: "Links are fetched and extracted server-side. PDFs are split when they are long, so nothing past the opening pages is quietly dropped.",
  },
  {
    target: "compile-feed",
    title: "Watch it land",
    body: "Every save produces a diff: which page it joined, which claims were added, what got disputed.",
  },
  {
    target: "nav-wiki",
    title: "The compiled wiki",
    body: "Pages write themselves from what you saved. Each claim keeps the sentence it came from, so you can check it.",
  },
  {
    target: "nav-ask",
    title: "Ask your own library",
    body: "Answers come only from pages this workspace compiled, and cite the claims they rest on. Threads are saved.",
  },
  {
    target: "nav-graph",
    title: "How topics connect",
    body: "Typed edges — extends, contradicts, prerequisite of — not an undifferentiated web of 'related'.",
  },
  {
    target: "nav-gaps",
    title: "What you haven't read",
    body: "Prerequisites your reading leans on but never covers, noticed while compiling.",
  },
];

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function boxFor(target: string): Box | null {
  const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export function ProductTour({ onClose }: { onClose: () => void }) {
  // Only steps whose target is on this page; the tour is honest about where it is.
  const [steps] = useState(() => STEPS.filter((step) => boxFor(step.target) !== null));
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const step = steps[index];

  // Measured after layout so the highlight is never a frame behind the element.
  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => setBox(boxFor(step.target));
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, steps.length]);

  if (!step) {
    return (
      <Scrim onClose={onClose}>
        <Panel ref={dialogRef}>
          <p className="font-read text-h3 font-semibold">Nothing to point at here.</p>
          <p className="mt-2 text-small leading-relaxed text-ink-muted">
            Open the app and try again — the tour highlights real controls rather than
            showing pictures of them.
          </p>
          <button type="button" onClick={onClose} className={primaryButton}>
            Close
          </button>
        </Panel>
      </Scrim>
    );
  }

  const last = index === steps.length - 1;

  return (
    <Scrim onClose={onClose}>
      {/* The cut-out. A ring plus a shadow spread large enough to dim the rest of
          the page, so one element is lit without compositing two layers. */}
      {box && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[60] rounded-md ring-2 ring-link transition-all duration-normal"
          style={{
            top: box.top - 4,
            left: box.left - 4,
            width: box.width + 8,
            height: box.height + 8,
            boxShadow: "0 0 0 9999px color-mix(in oklch, var(--color-ink) 55%, transparent)",
          }}
        />
      )}

      <Panel
        ref={dialogRef}
        style={placementFor(box)}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">
          {index + 1} of {steps.length}
        </p>
        <p className="mt-1.5 font-read text-h3 font-semibold leading-snug">{step.title}</p>
        <p className="mt-2 text-small leading-relaxed text-ink-muted">{step.body}</p>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            disabled={index === 0}
            className="h-9 cursor-pointer rounded-md px-3 text-small text-ink-muted transition-colors duration-fast hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (last ? onClose() : setIndex((i) => i + 1))}
            className={primaryButton}
          >
            {last ? "Done" : "Next"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto cursor-pointer text-micro text-ink-faint transition-colors duration-fast hover:text-ink"
          >
            Skip
          </button>
        </div>
      </Panel>
    </Scrim>
  );
}

const primaryButton =
  "h-9 cursor-pointer rounded-md bg-ink px-4 text-small font-medium text-paper transition-opacity duration-fast hover:opacity-90";

/**
 * Keeps the card near its target without covering it.
 *
 * Below the highlight when there is room, above when there is not, and clamped to
 * the viewport so a target near an edge does not push the card off-screen.
 */
function placementFor(box: Box | null): React.CSSProperties {
  if (typeof window === "undefined" || !box) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const CARD = { width: 320, height: 210, gap: 16 };
  const below = box.top + box.height + CARD.gap;
  const fitsBelow = below + CARD.height < window.innerHeight;

  return {
    top: fitsBelow ? below : Math.max(CARD.gap, box.top - CARD.height - CARD.gap),
    left: Math.min(
      Math.max(CARD.gap, box.left + box.width / 2 - CARD.width / 2),
      window.innerWidth - CARD.width - CARD.gap,
    ),
    width: CARD.width,
  };
}

function Scrim({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[55]"
      // Clicking away is the fastest exit and the one people try first.
      onClick={onClose}
    >
      {children}
    </div>
  );
}

function Panel({
  children,
  style,
  onClick,
  ref,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: (event: React.MouseEvent) => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
      tabIndex={-1}
      style={style}
      onClick={onClick}
      className="fixed z-[61] max-w-[calc(100vw-2rem)] rounded-lg border border-rule-strong bg-surface p-5 shadow-lg"
    >
      {children}
    </div>
  );
}

/** The navbar control that starts the tour. */
export function VisualHelpButton({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      title="Guided tour of the interface"
      className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-small text-ink-muted transition-colors duration-fast hover:bg-sunken hover:text-ink sm:px-3"
    >
      <CompassIcon width={15} height={15} />
      <span className="hidden lg:inline">Visual help</span>
    </button>
  );
}
