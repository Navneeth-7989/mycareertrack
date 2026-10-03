import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { WORK_MODES } from "@/lib/constants/work-mode";
import { FALLBACK_TIMEZONE } from "@/lib/utils/timezone";
import {
  onboardingSchema,
  onboardingStepOneSchema,
  onboardingStepThreeSchema,
  onboardingStepTwoSchema,
} from "@/lib/validations/profile";

const validPayload = {
  name: "Navneet Shahi",
  university: "IIT Bombay",
  degree: "B.Tech Computer Science",
  graduationYear: "2027",
  linkedinUrl: "linkedin.com/in/navneet",
  githubUrl: "",
  portfolioUrl: "",
  targetRoles: [],
  skills: [],
  preferredLocations: [],
  preferredWorkMode: "",
};

describe("required onboarding fields", () => {
  // The columns are nullable in Postgres because an OAuth sign-in creates the
  // User row before any of this is asked for — so this schema is the only
  // thing enforcing the requirement in DESIGN.md §9.
  it.each(["name", "university", "degree", "graduationYear"])("rejects a blank %s", (field) => {
    const result = onboardingStepOneSchema.safeParse({ ...validPayload, [field]: "   " });

    expect(result.success).toBe(false);
  });

  it("rejects a blank LinkedIn URL", () => {
    expect(onboardingStepTwoSchema.safeParse({ ...validPayload, linkedinUrl: "" }).success).toBe(
      false,
    );
  });

  it("trims surrounding whitespace off text fields", () => {
    const result = onboardingStepOneSchema.parse({ ...validPayload, name: "  Navneet  " });

    expect(result.name).toBe("Navneet");
  });
});

describe("graduation year", () => {
  it("arrives as a string and comes out an Int", () => {
    const result = onboardingStepOneSchema.parse(validPayload);

    expect(result.graduationYear).toBe(2027);
  });

  it.each(["27", "20277", "two thousand", "2027.5", "-027"])("rejects %j", (graduationYear) => {
    expect(onboardingStepOneSchema.safeParse({ ...validPayload, graduationYear }).success).toBe(
      false,
    );
  });

  it("rejects a year before 1950", () => {
    expect(
      onboardingStepOneSchema.safeParse({ ...validPayload, graduationYear: "1949" }).success,
    ).toBe(false);
  });

  it("allows a decade of lookahead but no more", () => {
    const year = new Date().getFullYear();

    expect(
      onboardingStepOneSchema.safeParse({
        ...validPayload,
        graduationYear: String(year + 10),
      }).success,
    ).toBe(true);

    expect(
      onboardingStepOneSchema.safeParse({
        ...validPayload,
        graduationYear: String(year + 11),
      }).success,
    ).toBe(false);
  });
});

describe("URL fields", () => {
  it("adds the missing scheme nobody types", () => {
    const result = onboardingStepTwoSchema.parse({
      ...validPayload,
      linkedinUrl: "linkedin.com/in/navneet",
    });

    expect(result.linkedinUrl).toBe("https://linkedin.com/in/navneet");
  });

  it("leaves an explicit scheme alone", () => {
    const result = onboardingStepTwoSchema.parse({
      ...validPayload,
      linkedinUrl: "http://linkedin.com/in/navneet",
    });

    expect(result.linkedinUrl).toBe("http://linkedin.com/in/navneet");
  });

  // These values end up in an href. DESIGN.md §8 allows http and https only.
  it.each([
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "mailto:me@example.com",
    "file:///etc/passwd",
  ])("rejects the %j scheme", (linkedinUrl) => {
    expect(onboardingStepTwoSchema.safeParse({ ...validPayload, linkedinUrl }).success).toBe(false);
  });

  it("rejects something that isn't a hostname", () => {
    expect(
      onboardingStepTwoSchema.safeParse({ ...validPayload, linkedinUrl: "not a url" }).success,
    ).toBe(false);
  });

  // "https://linkedin.com@evil.example" has evil.example as its host. A link
  // that reads as one site and resolves to another has no legitimate use in a
  // profile field.
  it.each(["https://linkedin.com@evil.example/in/navneet", "https://user:pass@evil.example"])(
    "rejects credentials embedded in %j",
    (linkedinUrl) => {
      expect(onboardingStepTwoSchema.safeParse({ ...validPayload, linkedinUrl }).success).toBe(
        false,
      );
    },
  );

  it("keeps a host:port that was typed without a scheme", () => {
    const result = onboardingStepTwoSchema.parse({
      ...validPayload,
      portfolioUrl: "my-site.dev:8080/work",
    });

    expect(result.portfolioUrl).toBe("https://my-site.dev:8080/work");
  });

  // A nullable column holding "" means every reader has to treat two values as
  // the same thing, and one of them eventually forgets.
  it("turns empty optional URLs into null", () => {
    const result = onboardingStepTwoSchema.parse(validPayload);

    expect(result.githubUrl).toBeNull();
    expect(result.portfolioUrl).toBeNull();
  });

  it("still validates an optional URL that was filled in", () => {
    expect(
      onboardingStepTwoSchema.safeParse({ ...validPayload, githubUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
  });
});

describe("free-text lists", () => {
  it("trims entries and drops blanks", () => {
    const result = onboardingStepThreeSchema.parse({
      ...validPayload,
      skills: ["  React ", "", "   ", "Postgres"],
    });

    expect(result.skills).toEqual(["React", "Postgres"]);
  });

  it("collapses casing duplicates, keeping the casing typed first", () => {
    const result = onboardingStepThreeSchema.parse({
      ...validPayload,
      skills: ["React", "react", "REACT"],
    });

    expect(result.skills).toEqual(["React"]);
  });

  it("rejects more than 25 entries", () => {
    const skills = Array.from({ length: 26 }, (_, index) => `skill-${index}`);

    expect(onboardingStepThreeSchema.safeParse({ ...validPayload, skills }).success).toBe(false);
  });

  it("rejects an entry longer than 60 characters", () => {
    expect(
      onboardingStepThreeSchema.safeParse({ ...validPayload, skills: ["a".repeat(61)] }).success,
    ).toBe(false);
  });
});

describe("preferred work mode", () => {
  it("maps the no-preference option to null", () => {
    expect(onboardingStepThreeSchema.parse(validPayload).preferredWorkMode).toBeNull();
  });

  it.each(WORK_MODES)("accepts %s", (mode) => {
    const result = onboardingStepThreeSchema.parse({
      ...validPayload,
      preferredWorkMode: mode,
    });

    expect(result.preferredWorkMode).toBe(mode);
  });

  it("rejects a value that isn't in the enum", () => {
    expect(
      onboardingStepThreeSchema.safeParse({ ...validPayload, preferredWorkMode: "ANYWHERE" })
        .success,
    ).toBe(false);
  });

  // WORK_MODES is hand-written in src/lib/constants so Prisma stays out of
  // src/lib (DESIGN.md §4). This is what stops it drifting from the schema.
  it("matches the WorkMode enum in schema.prisma", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const block = /enum WorkMode \{([^}]*)\}/.exec(schema)?.[1] ?? "";
    const values = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(values.sort()).toEqual([...WORK_MODES].sort());
  });
});

describe("timezone", () => {
  it("keeps a valid IANA zone", () => {
    const result = onboardingSchema.parse({ ...validPayload, timezone: "Europe/Berlin" });

    expect(result.timezone).toBe("Europe/Berlin");
  });

  // Detection is primary and the fallback is for when it fails (§10.4), so a
  // bad or absent zone must never cost the user their submission.
  it.each([undefined, "", "   ", "Fake/Nowhere", "garbage"])("falls back for %j", (timezone) => {
    const result = onboardingSchema.parse({ ...validPayload, timezone });

    expect(result.timezone).toBe(FALLBACK_TIMEZONE);
  });
});

describe("onboardingSchema", () => {
  // Identity comes from requireApiUser(), never the body (DESIGN.md §8).
  it("strips fields it does not declare, userId above all", () => {
    const result = onboardingSchema.parse({
      ...validPayload,
      userId: "cuid-of-another-user",
      onboardingCompleted: false,
    });

    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("onboardingCompleted");
  });
});
