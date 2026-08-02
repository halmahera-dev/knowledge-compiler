/**
 * Keyboard and ARIA wiring for a tab strip.
 *
 * Exists because declaring `role="tab"` is a promise. A screen reader announces
 * "tab, 2 of 4", and the person then presses Arrow Right — which does nothing
 * unless the component implements it. Half-applied tab roles are worse than
 * plain buttons, because plain buttons at least behave the way they are
 * announced.
 *
 * Implements the parts the role commits to (WAI-ARIA APG, Tabs):
 *   - arrow keys move between tabs and wrap; Home and End jump to the ends
 *   - roving tabindex, so Tab enters and leaves the strip in one step rather
 *     than walking through every tab
 *   - `aria-controls` / `aria-labelledby` tying each tab to its panel
 *
 * Selection follows focus, which APG recommends when switching panels is cheap —
 * here it only swaps already-loaded markup.
 */
import { useRef, type KeyboardEvent } from "react";

interface TablistOptions<T extends string | number> {
  /** Tab ids in the order they are rendered — arrow keys follow this order. */
  ids: readonly T[];
  active: T;
  onChange: (id: T) => void;
  /** Prefix for generated element ids, unique per tab strip on the page. */
  name: string;
}

/**
 * Which tab a key press moves to, or undefined when the key is not ours.
 *
 * Split out from the hook because it is the entire behaviour worth pinning, and
 * because it already shipped one bug: the result was tested for truthiness, so a
 * numeric tab id of `0` — a legitimate id, used by the landing page's stage
 * strip — was read as "no target" and both ArrowRight-wrap and Home did nothing.
 * Returning `undefined` for "not handled" is what makes that distinction sayable.
 */
export function nextTabId<T extends string | number>(
  ids: readonly T[],
  active: T,
  key: string,
): T | undefined {
  const at = ids.indexOf(active);
  if (at < 0 || ids.length === 0) return undefined;

  const forward = ids[(at + 1) % ids.length];
  const back = ids[(at - 1 + ids.length) % ids.length];

  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return forward;
    case "ArrowLeft":
    case "ArrowUp":
      return back;
    case "Home":
      return ids[0];
    case "End":
      return ids[ids.length - 1];
    default:
      return undefined;
  }
}

export function useTablist<T extends string | number>({
  ids,
  active,
  onChange,
  name,
}: TablistOptions<T>) {
  const buttons = useRef(new Map<T, HTMLButtonElement | null>());

  function focus(id: T) {
    onChange(id);
    // Focus has to follow selection, or the roving tabindex leaves focus on an
    // element that is now tabindex="-1" and the next Tab press starts from the
    // top of the document.
    buttons.current.get(id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const target = nextTabId(ids, active, event.key);
    if (target === undefined) return;
    // Arrow keys would otherwise scroll the page out from under the strip.
    event.preventDefault();
    focus(target);
  }

  return {
    tabProps: (id: T) => ({
      role: "tab" as const,
      id: `${name}-tab-${id}`,
      // Every tab points at the same panel element. These strips swap the
      // panel's contents rather than toggling one panel per tab, so per-tab
      // panel ids would leave every inactive tab referencing an id that is not
      // in the document — a dangling `aria-controls` is an error, not a hint.
      "aria-controls": `${name}-panel`,
      "aria-selected": active === id,
      tabIndex: active === id ? 0 : -1,
      ref: (element: HTMLButtonElement | null) => {
        buttons.current.set(id, element);
      },
      onClick: () => onChange(id),
      onKeyDown,
    }),

    /**
     * Spread onto the single region the strip controls.
     *
     * Its id is stable while `aria-labelledby` follows the selection, so the
     * panel is always named by whichever tab is currently showing.
     */
    panelProps: {
      role: "tabpanel" as const,
      id: `${name}-panel`,
      "aria-labelledby": `${name}-tab-${active}`,
    },
  };
}
