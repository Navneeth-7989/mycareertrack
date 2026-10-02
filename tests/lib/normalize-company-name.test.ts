import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "@/lib/utils/normalize-company-name";

describe("normalizeCompanyName", () => {
  it("collapses the casing and whitespace variants from the design doc", () => {
    // The worked example in DESIGN.md §3: all three are one company.
    expect(normalizeCompanyName("Google")).toBe("google");
    expect(normalizeCompanyName("google ")).toBe("google");
    expect(normalizeCompanyName("Google LLC")).toBe("google");
  });

  it("collapses inner whitespace", () => {
    expect(normalizeCompanyName("  Tata   Consultancy  Services ")).toBe(
      "tata consultancy services",
    );
  });

  it("strips Indian legal suffixes", () => {
    expect(normalizeCompanyName("Infosys Limited")).toBe("infosys");
    expect(normalizeCompanyName("Wipro Ltd.")).toBe("wipro");
    expect(normalizeCompanyName("Flipkart Internet Pvt Ltd")).toBe("flipkart internet");
    expect(normalizeCompanyName("Zerodha Broking Private Limited")).toBe("zerodha broking");
  });

  it("strips western legal suffixes", () => {
    expect(normalizeCompanyName("Stripe, Inc")).toBe("stripe");
    expect(normalizeCompanyName("Palantir Technologies Inc.")).toBe("palantir technologies");
    expect(normalizeCompanyName("Oracle Corporation")).toBe("oracle");
    expect(normalizeCompanyName("SAP SE GmbH")).toBe("sap se");
  });

  it("does not amputate words that merely end in a suffix", () => {
    // The bug this guards: a naive endsWith("co") turns Cisco into "cis".
    expect(normalizeCompanyName("Cisco")).toBe("cisco");
    expect(normalizeCompanyName("Intel")).toBe("intel");
    expect(normalizeCompanyName("Incredible Labs")).toBe("incredible labs");
    expect(normalizeCompanyName("Plc Systems")).toBe("plc systems");
  });

  it("preserves internal punctuation", () => {
    // Stripping it would merge genuinely different companies.
    expect(normalizeCompanyName("Dr. Reddy's Laboratories")).toBe("dr. reddy's laboratories");
    expect(normalizeCompanyName("Coca-Cola")).toBe("coca-cola");
  });

  it("never reduces a name to an empty key", () => {
    expect(normalizeCompanyName("Limited")).toBe("limited");
    expect(normalizeCompanyName("Co")).toBe("co");
  });
});
