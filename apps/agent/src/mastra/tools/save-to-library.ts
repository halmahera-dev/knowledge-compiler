/**
 * Saving something into the reader's library, from the conversation.
 *
 * Calls the same `POST /api/v1/items` the capture page used to call, with the
 * reader's own bearer token — so dedupe, extraction, the SSRF guard, embedding
 * and the compile queue are the ones already in place, and there is no second
 * implementation of capture to keep in step with the first.
 *
 * WHY THE PASTED TEXT DOES NOT TRAVEL THROUGH THE MODEL
 *
 * A reader who pastes a 10,000-word article expects that article saved. Asking
 * the model to hand it back as a tool argument charges for it twice, and worse,
 * makes what gets stored a paraphrase: models shorten, tidy, and drop what they
 * judge redundant. The stored bytes would then differ from the ones the reader
 * pasted, and every verbatim quote compiled out of them would be a quote of
 * something nobody wrote.
 *
 * So the text rides in the request context, exactly like the token. The model
 * decides WHETHER to save; the request decides WHAT is saved. A url is short
 * and structured, so naming one is safe to ask the model for.
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { config } from "../config";
import { explain } from "./blocked";

interface CreateItemResult {
  itemId: string;
  title: string | null;
  duplicate: boolean;
  duplicateOf: {
    title: string | null;
    pageSlug: string | null;
  } | null;
  partsQueued: number;
}

/** Mirrors the API's own floor: shorter than this cannot be compiled. */
const MIN_CONTENT_CHARS = 40;

const requestContextSchema = z.object({
  /** The reader's own bearer token, forwarded from the web app. */
  token: z.string(),
  /**
   * The text of the message this turn is answering, verbatim. Absent when the
   * reader typed a question rather than pasted a document.
   */
  messageText: z.string().optional(),
});

export const saveToLibrary = createTool({
  id: "saveToLibrary",
  description:
    "Save a link or the reader's pasted text into their library, where it is compiled into wiki pages. Only call this after the reader has agreed to save.",
  inputSchema: z.object({
    url: z
      .string()
      .optional()
      .describe(
        "The link to save, copied exactly from the reader's message. Fetched and extracted server-side. Leave unset when saving pasted text.",
      ),
    saveMessageText: z
      .boolean()
      .optional()
      .describe(
        "Set true to save the text the reader pasted in their message. The text is taken from the message itself, so do not repeat it — you cannot alter what gets saved, and you do not need to.",
      ),
    title: z
      .string()
      .optional()
      .describe(
        "Only when the reader stated a title. Left unset, the server derives one from the document, which is usually better than a guess.",
      ),
  }),
  outputSchema: z.object({
    saved: z.boolean(),
    /** What the library will call it. Report this, not your own summary of it. */
    title: z.string().nullable(),
    /** True when this exact content was already saved; nothing was queued. */
    duplicate: z.boolean(),
    duplicateTitle: z.string().nullable(),
    duplicatePageSlug: z.string().nullable(),
    /** How many compiles a long document was split into. 1 for a normal save. */
    partsQueued: z.number(),
    /** The reader must act on this before saving can work. Relay it and stop. */
    blocked: z.string().nullable(),
    /** This one save failed for a reason worth repeating, in plain words. */
    problem: z.string().nullable(),
  }),
  requestContextSchema,
  execute: async ({ url, saveMessageText, title }, { requestContext }) => {
    const empty = {
      saved: false,
      title: null,
      duplicate: false,
      duplicateTitle: null,
      duplicatePageSlug: null,
      partsQueued: 0,
    };

    const token = requestContext?.get("token");
    if (!token) {
      return { ...empty, blocked: "You are not signed in.", problem: null };
    }

    const body: Record<string, string> = {};

    if (url) {
      body.captureType = "link";
      body.sourceUrl = url;
    } else if (saveMessageText) {
      const text = requestContext?.get("messageText") ?? "";
      if (text.trim().length < MIN_CONTENT_CHARS) {
        return {
          ...empty,
          blocked: null,
          problem:
            "There is no passage in that message long enough to compile — a paragraph is about the minimum.",
        };
      }
      body.captureType = "paste";
      body.content = text;
    } else {
      return {
        ...empty,
        blocked: null,
        problem:
          "Nothing was named to save. Pass a url, or set saveMessageText to save what the reader pasted.",
      };
    }

    if (title) body.title = title;

    const response = await fetch(new URL("/api/v1/items", config.api.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // 5xx is the API being broken rather than the save being refused, and
      // must not read to the reader as "your article was no good".
      if (response.status >= 500) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `save failed (${response.status}): ${text.slice(0, 200)}`,
        );
      }

      // 422 is the one status whose own words are worth passing on: it carries
      // why a fetch failed — paywalled, 404, a private address — which is what
      // decides whether pasting the text instead would work.
      if (response.status === 422) {
        const detail = await response
          .json()
          .then((body: { detail?: string }) => body.detail)
          .catch(() => undefined);

        return {
          ...empty,
          blocked: null,
          problem: detail ?? "That could not be read.",
        };
      }

      return { ...empty, blocked: explain(response.status), problem: null };
    }

    const result = (await response.json()) as CreateItemResult;

    return {
      saved: !result.duplicate,
      title: result.title,
      duplicate: result.duplicate,
      duplicateTitle: result.duplicateOf?.title ?? null,
      duplicatePageSlug: result.duplicateOf?.pageSlug ?? null,
      partsQueued: result.partsQueued,
      blocked: null,
      problem: null,
    };
  },
});
