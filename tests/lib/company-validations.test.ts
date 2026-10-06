import { describe, expect, it } from "vitest";

import {
  COMPANY_SEARCH_LIMIT,
  companyNameSchema,
  companySearchParamsSchema,
  companyWebsiteSchema,
  createCompanySchema,
} from "@/lib/validations/company";

describe("companyNameSchema", () => {
  it("keeps the display casing the user typed", () => {
    // Normalization is the match key's job, not the name's — Company.name holds
    // what was typed so the UI shows "JPMorgan Chase", not "jpmorgan chase".
    expect(companyNameSchema.parse("JPMorgan Chase")).toBe("JPMorgan Chase");
  });

  it("trims surrounding whitespace", () => {
    expect(companyNameSchema.parse("  Infosys  ")).toBe("Infosys");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(companyNameSchema.safeParse("").success).toBe(false);
    expect(companyNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects a name with no letter or digit in it", () => {
    // "---" normalizes to "---": a valid match key for a company that does not
    // exist.
    expect(companyNameSchema.safeParse("---").success).toBe(false);
    expect(companyNameSchema.safeParse("!!!").success).toBe(false);
  });

  it("accepts a non-Latin name", () => {
    // The alphanumeric check is unicode-aware, so this is a name and not
    // punctuation.
    expect(companyNameSchema.parse("टाटा मोटर्स")).toBe("टाटा मोटर्स");
  });

  it("accepts a bare legal suffix as a name", () => {
    // "Ltd." keeps the match key "ltd", because normalizeCompanyName only
    // strips a suffix that follows a separator. The same rule is what lets a
    // company genuinely called "Limited" keep its name, and the alternative —
    // stripping unconditionally — would reduce both to an empty key.
    expect(companyNameSchema.parse("Ltd.")).toBe("Ltd.");
    expect(companyNameSchema.parse("Limited")).toBe("Limited");
  });

  it("rejects a pasted paragraph", () => {
    expect(companyNameSchema.safeParse("x".repeat(121)).success).toBe(false);
    expect(companyNameSchema.safeParse("x".repeat(120)).success).toBe(true);
  });
});

describe("companyWebsiteSchema", () => {
  it("adds the scheme nobody types", () => {
    expect(companyWebsiteSchema.parse("google.com")).toBe("https://google.com");
  });

  it("stores a blank website as null, not an empty string", () => {
    expect(companyWebsiteSchema.parse("")).toBeNull();
    expect(companyWebsiteSchema.parse(undefined)).toBeNull();
  });

  it("refuses a javascript: URL", () => {
    // This value reaches an href. See DESIGN.md §8.
    expect(companyWebsiteSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("refuses embedded credentials", () => {
    expect(companyWebsiteSchema.safeParse("https://google.com@evil.example").success).toBe(false);
  });

  it("carries its own error example rather than the LinkedIn one", () => {
    const result = companyWebsiteSchema.safeParse("not a url at all");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("careers.google.com");
  });
});

describe("createCompanySchema", () => {
  it("accepts a name with no website", () => {
    expect(createCompanySchema.parse({ name: "Zerodha" })).toEqual({
      name: "Zerodha",
      website: null,
    });
  });
});

describe("companySearchParamsSchema", () => {
  it("treats an absent query as an empty one", () => {
    // Not an error: the combobox sends this on open and gets the user's recent
    // companies back.
    expect(companySearchParamsSchema.parse({})).toEqual({ q: "", limit: COMPANY_SEARCH_LIMIT });
  });

  it("truncates an over-long query instead of rejecting it", () => {
    // This endpoint runs on every keystroke. A 400 would turn a long paste into
    // an error message under the search box instead of simply finding nothing.
    const { q } = companySearchParamsSchema.parse({ q: "x".repeat(500) });

    expect(q).toHaveLength(120);
  });

  it("coerces the limit from its string form on the wire", () => {
    expect(companySearchParamsSchema.parse({ limit: "5" }).limit).toBe(5);
  });

  it("caps the limit server-side", () => {
    expect(companySearchParamsSchema.safeParse({ limit: "100" }).success).toBe(false);
    expect(companySearchParamsSchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(companySearchParamsSchema.safeParse({ limit: "abc" }).success).toBe(false);
  });
});
