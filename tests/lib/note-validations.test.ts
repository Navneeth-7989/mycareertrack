import { describe, expect, it } from "vitest";

import { noteSchema } from "@/lib/validations/note";

/**
 * Notes (DESIGN.md §7, Phase 3 step 5).
 *
 * The simplest schema in the app — one required field — so this is short on purpose. §9
 * settled that notes are a single model with no `Application.notes` column, which is why
 * there is nothing here about reconciling two places a note could live.
 */

describe("noteSchema", () => {
  it("parses a note", () => {
    expect(noteSchema.parse({ content: "Spoke to Priya about the timeline." })).toEqual({
      content: "Spoke to Priya about the timeline.",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(noteSchema.parse({ content: "  Called them back.  " }).content).toBe(
      "Called them back.",
    );
  });

  /**
   * Line breaks survive, which the panel relies on: it renders with
   * `whitespace-pre-line`, and a note is the field people paste an email thread into.
   * Trimming only touches the ends.
   */
  it("keeps internal line breaks", () => {
    const content = "Round 1: graphs\nRound 2: system design\n\nAsk about the team.";

    expect(noteSchema.parse({ content }).content).toBe(content);
  });

  it.each([
    { name: "an empty note", content: "" },
    { name: "a whitespace-only note", content: "   \n  " },
    { name: "a note over 50,000 characters", content: "x".repeat(50_001) },
  ])("rejects $name", ({ content }) => {
    const result = noteSchema.safeParse({ content });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["content"]);
  });

  /**
   * The most generous cap in the app, matching the job description's (§8). A note is where
   * a whole thread or a set of interview questions goes, which is exactly what a timeline
   * entry's 2,000 is too small for.
   */
  it("accepts a note at the 50,000-character cap", () => {
    expect(noteSchema.safeParse({ content: "x".repeat(50_000) }).success).toBe(true);
  });

  it("rejects a missing content key rather than treating it as blank", () => {
    expect(noteSchema.safeParse({}).success).toBe(false);
  });
});
