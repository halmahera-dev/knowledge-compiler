/**
 * The text of the message a turn is answering.
 *
 * Read off the request rather than out of the model, because saveToLibrary
 * stores it verbatim — see the note at the top of tools/save-to-library.ts.
 * Kept apart from index.ts so the shape-walking can be tested without standing
 * up a Mastra instance.
 */

interface MaybeMessage {
  role?: string;
  /** AI SDK v5 shape. A message may carry several text parts. */
  parts?: { type?: string; text?: string }[];
  /** Older shape, still accepted: content as one string. */
  content?: unknown;
}

export function lastUserText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;

  // Backwards: the turn being answered is the last thing the reader said, and
  // a long conversation may hold many earlier pastes that are not this one.
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] as MaybeMessage | null;
    if (message?.role !== "user") continue;

    if (Array.isArray(message.parts)) {
      // Joined rather than first-only: a paste split across parts is one
      // document, and keeping only the opening would silently truncate it.
      const text = message.parts
        .filter(
          (part) => part?.type === "text" && typeof part.text === "string",
        )
        .map((part) => part.text)
        .join("\n")
        .trim();

      return text || undefined;
    }

    return typeof message.content === "string"
      ? message.content.trim() || undefined
      : undefined;
  }

  return undefined;
}
