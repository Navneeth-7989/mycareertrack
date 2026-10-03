/**
 * Display metadata for the `WorkMode` enum.
 *
 * The values are written out as literals rather than imported from
 * `@prisma/client`, which would pull Prisma outside src/server/ and break the
 * one-import-site rule in DESIGN.md §4. They are string literals, so Prisma's
 * generated enum type still accepts them at the mutation boundary — and the
 * test suite asserts the two lists agree, which is what stops this drifting
 * from the schema.
 */
export const WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"] as const;

export type WorkModeValue = (typeof WORK_MODES)[number];

export const WORK_MODE_LABELS: Record<WorkModeValue, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};
