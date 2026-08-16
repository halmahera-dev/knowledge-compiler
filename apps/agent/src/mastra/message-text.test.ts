import { describe, expect, test } from "vitest";

import { lastUserText } from "./message-text";

describe("lastUserText", () => {
  test("reads the newest user message, not the first", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "an older paste" }] },
      { role: "assistant", parts: [{ type: "text", text: "saved" }] },
      { role: "user", parts: [{ type: "text", text: "the one to save" }] },
    ];

    expect(lastUserText(messages)).toBe("the one to save");
  });

  test("skips assistant messages above it", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "paste me" }] },
      { role: "assistant", parts: [{ type: "text", text: "want me to save?" }] },
    ];

    expect(lastUserText(messages)).toBe("paste me");
  });

  test("joins several text parts, so a split paste is not truncated", () => {
    const messages = [
      {
        role: "user",
        parts: [
          { type: "text", text: "first half" },
          { type: "text", text: "second half" },
        ],
      },
    ];

    expect(lastUserText(messages)).toBe("first half\nsecond half");
  });

  test("ignores non-text parts", () => {
    const messages = [
      {
        role: "user",
        parts: [
          { type: "step-start" },
          { type: "text", text: "the article" },
          { type: "tool-searchKnowledge" },
        ],
      },
    ];

    expect(lastUserText(messages)).toBe("the article");
  });

  test("accepts a plain string content", () => {
    expect(lastUserText([{ role: "user", content: "  padded  " }])).toBe(
      "padded",
    );
  });

  test("returns undefined rather than an empty string", () => {
    expect(lastUserText([{ role: "user", parts: [] }])).toBeUndefined();
    expect(
      lastUserText([{ role: "user", parts: [{ type: "text", text: "   " }] }]),
    ).toBeUndefined();
  });

  test("survives a body that is not a message list", () => {
    expect(lastUserText(undefined)).toBeUndefined();
    expect(lastUserText("nonsense")).toBeUndefined();
    expect(lastUserText([null, 7])).toBeUndefined();
  });

  test("returns undefined when nobody has spoken", () => {
    expect(
      lastUserText([{ role: "assistant", parts: [{ type: "text", text: "hi" }] }]),
    ).toBeUndefined();
  });
});
