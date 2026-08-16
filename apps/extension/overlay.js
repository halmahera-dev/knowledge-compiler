/**
 * What a save looks like from inside the page.
 *
 * A badge on the toolbar icon and an OS notification were the only feedback, and
 * both are wrong for this: the badge is 3mm across in the corner you are not
 * looking at, and notifications are commonly switched off at the OS level, which
 * turns a working save into a silent one. You are looking at the article — so the
 * report belongs on the article.
 *
 * The animation is the compile step, not a generic spinner. Bars stand for the
 * lines being read; they sweep and converge, then settle level when the save
 * lands. That is literally what the product does with them, and it makes the
 * wait legible instead of merely occupied.
 *
 * Three things this must not do, in order of how badly they would bite:
 *
 *   1. Break the save. Every entry point treats the overlay as decoration and
 *      ignores its failures. A page that blocks injection still saves.
 *   2. Let the page style it. Everything lives in a shadow root under `all:
 *      initial`, because a site with `* { animation: none }` or an aggressive
 *      `div` rule would otherwise take the overlay apart.
 *   3. Trust the page's text. Titles come from the document, so they are set as
 *      textContent — never markup. `innerHTML` here would let a crafted <title>
 *      run script in the page's world through an <img onerror>.
 */

if (!window.__kcOverlayInstalled) {
  window.__kcOverlayInstalled = true;

  /** Phases, and how long the end state stays before it fades out. */
  const LINGER = { saved: 3400, duplicate: 4200, error: 7000 };
  const BAR_COUNT = 6;

  const EYEBROW = {
    working: "Compiling",
    saved: "Saved",
    duplicate: "Already saved",
    error: "Not saved",
  };

  const CSS = `
    :host {
      all: initial;
      position: fixed;
      right: 20px;
      bottom: 20px;
      /* Above practically everything without reaching for the actual maximum,
         which some sites use for their own cookie banners and would tie. */
      z-index: 2147483000;
      font-family: Inter, system-ui, -apple-system, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; }

    .card {
      --paper: #faf9f6;
      --ink: #1a1815;
      --muted: #6b6560;
      --faint: #8c8681;
      --rule: #e5e1d8;
      --accent: #1a1815;
      width: 296px;
      padding: 14px 16px 15px;
      border: 1px solid var(--rule);
      border-radius: 10px;
      background: var(--paper);
      color: var(--ink);
      box-shadow:
        0 1px 2px rgba(26, 24, 21, 0.06),
        0 12px 32px -8px rgba(26, 24, 21, 0.18);
      /* Entry is the only layout-ish motion, and it is on transform, so it
         composites rather than reflowing the host page. */
      opacity: 0;
      transform: translateY(10px) scale(0.98);
      transition:
        opacity 260ms cubic-bezier(0.16, 1, 0.3, 1),
        transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .card.in { opacity: 1; transform: none; }
    .card.saved { --accent: #2f855a; }
    .card.duplicate { --accent: #8a6d2f; }
    .card.error { --accent: #c53030; }

    @media (prefers-color-scheme: dark) {
      .card {
        --paper: #201e1b;
        --ink: #ece9e4;
        --muted: #a8a29b;
        --faint: #7e7871;
        --rule: #3a3733;
        --accent: #ece9e4;
        box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.5);
      }
      .card.saved { --accent: #6ee7a8; }
      .card.duplicate { --accent: #d9b878; }
      .card.error { --accent: #f08b84; }
    }

    .head { display: flex; align-items: center; gap: 8px; }
    .eyebrow {
      flex: 1;
      font: 500 9.5px/1 ui-monospace, SFMono-Regular, monospace;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .mark { width: 15px; height: 15px; flex: none; color: var(--accent); }
    .mark path {
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 24;
      stroke-dashoffset: 24;
      animation: draw 420ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes draw { to { stroke-dashoffset: 0; } }

    .title {
      margin-top: 7px;
      font: 600 14.5px/1.35 ui-serif, Georgia, serif;
      /* Two lines, then ellipsis: a headline is worth wrapping once, and a
         card that grows with the title would jump around between saves. */
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .note { margin-top: 5px; font-size: 11.5px; line-height: 1.45; color: var(--muted); }

    .bars { display: flex; gap: 3px; align-items: flex-end; height: 13px; margin-top: 11px; }
    .bar {
      flex: 1;
      height: 100%;
      border-radius: 1.5px;
      background: var(--accent);
      opacity: 0.16;
      transform-origin: left center;
      transform: scaleX(0.28);
      transition:
        transform 380ms cubic-bezier(0.16, 1, 0.3, 1),
        opacity 380ms ease;
    }
    .working .bar { animation: sweep 1150ms ease-in-out infinite; }
    /* Staggered so they read as a pass moving down the page rather than a
       pulse. The delays are negative so the cycle is already underway on the
       first frame — a row that starts flat looks like it has stalled. */
    .working .bar:nth-child(1) { animation-delay: -1000ms; }
    .working .bar:nth-child(2) { animation-delay: -850ms; }
    .working .bar:nth-child(3) { animation-delay: -700ms; }
    .working .bar:nth-child(4) { animation-delay: -550ms; }
    .working .bar:nth-child(5) { animation-delay: -400ms; }
    .working .bar:nth-child(6) { animation-delay: -250ms; }
    @keyframes sweep {
      0%,
      100% { transform: scaleX(0.28); opacity: 0.16; }
      45% { transform: scaleX(1); opacity: 0.75; }
    }
    /* Settled: the lines converge on one length, which is the compile finishing. */
    .done .bar { transform: scaleX(1); opacity: 0.5; }
    .error .bar { transform: scaleX(0.35); opacity: 0.3; }

    @media (prefers-reduced-motion: reduce) {
      .card { transition: opacity 120ms linear; transform: none; }
      .card.in { transform: none; }
      .working .bar { animation: none; }
      .bar { transition: none; transform: scaleX(1); opacity: 0.4; }
      .mark path { animation: none; stroke-dashoffset: 0; }
    }
  `;

  const host = document.createElement("div");
  host.setAttribute("data-traversa", "");
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = CSS;

  const card = document.createElement("div");
  card.className = "card";
  // The whole card is one status region: a screen reader should hear "Saved —
  // compiling now", not six bars changing width.
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");

  const head = document.createElement("div");
  head.className = "head";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  head.append(eyebrow);

  const title = document.createElement("p");
  title.className = "title";
  const note = document.createElement("p");
  note.className = "note";

  const bars = document.createElement("div");
  bars.className = "bars";
  bars.setAttribute("aria-hidden", "true");
  for (let i = 0; i < BAR_COUNT; i += 1) {
    const bar = document.createElement("span");
    bar.className = "bar";
    bars.append(bar);
  }

  card.append(head, title, note, bars);
  root.append(style, card);

  let hideTimer;
  let removeTimer;

  /** Draws a tick or a cross beside the eyebrow, once the result is known. */
  function setMark(kind) {
    head.querySelector(".mark")?.remove();
    if (kind === "working") return;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "mark");
    svg.setAttribute("viewBox", "0 0 20 20");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      kind === "error" ? "M5.5 5.5 L14.5 14.5 M14.5 5.5 L5.5 14.5" : "M4 10.5 L8.2 14.5 L16 6",
    );
    svg.append(path);
    head.append(svg);
  }

  function attach() {
    if (!host.isConnected) (document.body ?? document.documentElement).append(host);
  }

  function show(phase, { label, note: noteText }) {
    clearTimeout(hideTimer);
    clearTimeout(removeTimer);
    attach();

    card.className = `card in ${phase === "working" ? "working" : phase}`;
    if (phase !== "working" && phase !== "error") card.classList.add("done");

    eyebrow.textContent = EYEBROW[phase] ?? EYEBROW.working;
    // textContent throughout: `label` is the page's own title.
    title.textContent = label ?? "";
    note.textContent = noteText ?? "";
    setMark(phase);

    // Next frame, so the entry transition has a from-state to move off.
    requestAnimationFrame(() => card.classList.add("in"));

    const linger = LINGER[phase];
    if (linger) {
      hideTimer = setTimeout(() => {
        card.classList.remove("in");
        removeTimer = setTimeout(() => host.remove(), 320);
      }, linger);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.kc === "start") show("working", message);
    else if (message?.kc === "result") show(message.state ?? "saved", message);
    // No response is sent: nothing waits on the overlay, by design.
  });

  // The card starts hidden; `show` is what attaches and reveals it.
  card.classList.remove("in");
}
