import { describe, expect, it } from "vitest";

import { formatSalaryRange } from "@/lib/utils/salary";

/**
 * Three optional columns make five shapes, and the bug this guards against is
 * the one where an absent bound is read as zero — "₹12,00,000 – ₹0" on a row
 * whose maximum was simply never filled in.
 *
 * The assertions compare against `Intl` output rather than hard-coded strings
 * with currency symbols in them: the exact glyph and the exact kind of space
 * `Intl` emits vary with the ICU version bundled into Node, and a test that
 * pins them breaks on an unrelated runtime upgrade. What matters is the
 * structure — which figures appear, in which order, with which prefix.
 */
const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

describe("formatSalaryRange", () => {
  it("renders nothing when neither bound is set", () => {
    // Null rather than an em dash, so the caller decides whether the field
    // deserves a row at all.
    expect(formatSalaryRange(null, null, "INR")).toBeNull();
    expect(formatSalaryRange(null, null, null)).toBeNull();
  });

  it("joins two bounds into a range", () => {
    expect(formatSalaryRange(1200000, 1800000, "INR")).toBe(`${inr(1200000)} – ${inr(1800000)}`);
  });

  it("collapses a range whose ends match", () => {
    // Someone who knows the exact figure types it into both fields.
    expect(formatSalaryRange(1200000, 1200000, "INR")).toBe(inr(1200000));
  });

  it("says which bound it has when only one is set", () => {
    expect(formatSalaryRange(1200000, null, "INR")).toBe(`From ${inr(1200000)}`);
    expect(formatSalaryRange(null, 1800000, "INR")).toBe(`Up to ${inr(1800000)}`);
  });

  it("never reads an absent bound as zero", () => {
    // The regression this file exists for.
    expect(formatSalaryRange(1200000, null, "INR")).not.toContain("0 –");
    expect(formatSalaryRange(null, 1800000, "INR")).not.toMatch(/^.*0 –/);
  });

  it("falls back to the column default when no currency is stored", () => {
    expect(formatSalaryRange(1200000, null, null)).toBe(`From ${inr(1200000)}`);
    // Blank as well as null: the column is nullable text, and "" would reach
    // Intl as a currency code and throw.
    expect(formatSalaryRange(1200000, null, "  ")).toBe(`From ${inr(1200000)}`);
  });

  it("groups rupees in lakhs and dollars in thousands", () => {
    /*
     * The reason the locale follows the currency rather than the user: one
     * formatter for both would print a US salary as "$1,20,000". Asserted on
     * the digits alone, since that is what the grouping decides.
     */
    expect(formatSalaryRange(120000, null, "INR")).toContain("1,20,000");
    expect(formatSalaryRange(120000, null, "USD")).toContain("120,000");
  });

  it("drops the decimals Intl would add by default", () => {
    expect(formatSalaryRange(1200000, null, "USD")).not.toContain(".00");
  });

  it("survives a currency code Intl refuses", () => {
    /*
     * `Intl.NumberFormat` throws a RangeError on anything that is not three
     * letters, and this value comes out of a nullable text column — so a page
     * must not 500 over one. The figure still renders, with the stored code
     * appended so it stays unambiguous.
     *
     * An unassigned-but-well-formed code like "ZZZ" does not throw: Intl prints
     * it as the prefix, which is already the right answer and needs no
     * fallback.
     */
    const result = formatSalaryRange(1200000, null, "rupees");

    expect(result).toBe("From 1,200,000 rupees");
  });
});
