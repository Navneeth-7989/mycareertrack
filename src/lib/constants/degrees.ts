/**
 * The degrees the onboarding wizard suggests.
 *
 * Suggestions, not a constraint — the field accepts anything typed, and the
 * server validates only length (see `validations/profile`). This was an
 * explicit product call: a student holding a qualification we failed to list
 * must be able to finish signing up, and that matters more than a tidy column.
 *
 * The trade-off is real and worth writing down: "B.Tech", "BTech" and "Bachelor
 * of Technology" can all now reach the database, so anything that later groups
 * or counts by degree has to normalise first rather than trusting the values to
 * be comparable. Offering the list first is what keeps that rare.
 *
 * Because the list is only a starting point, it stays short of exhaustive and
 * covers the common cases well. A specialisation still belongs in
 * `fieldOfStudy`: picking "B.Tech" here should not mean losing "Computer
 * Science", which is the whole reason that column exists.
 *
 * Ordered by level rather than alphabetically. The combobox filters as the user
 * types, so this order is only what an undecided user scrolls through, and
 * bachelor's degrees first matches who is actually signing up.
 */
export const DEGREES = [
  // Undergraduate — engineering and computing
  "B.Tech",
  "B.E.",
  "B.Sc",
  "B.Sc (Hons)",
  "BCA",
  "B.Sc (Computer Science)",
  "B.Stat",
  "B.Math",

  // Undergraduate — commerce, management and the arts
  "B.Com",
  "B.Com (Hons)",
  "BBA",
  "BBM",
  "BMS",
  "BA",
  "BA (Hons)",
  "BFA",
  "B.Des",
  "B.Arch",
  "B.Planning",
  "BHM",
  "B.Ed",
  "B.P.Ed",
  "BSW",
  "B.Voc",

  // Undergraduate — law
  "LL.B",
  "BA LL.B (Hons)",
  "BBA LL.B",
  "B.Com LL.B",

  // Undergraduate — medicine and allied health
  "MBBS",
  "BDS",
  "B.Pharm",
  "BAMS",
  "BHMS",
  "BUMS",
  "BPT",
  "B.Sc Nursing",
  "BMLT",
  "B.V.Sc",
  "B.Sc Agriculture",

  // Integrated and dual degrees
  "B.Tech + M.Tech (Dual Degree)",
  "Integrated M.Tech",
  "Integrated M.Sc",
  "BS-MS (Dual Degree)",
  "Integrated MBA",
  "Integrated MA",
  "Integrated LL.M",

  // Postgraduate — engineering, computing and the sciences
  "M.Tech",
  "M.E.",
  "M.Sc",
  "MCA",
  "MS (by Research)",
  "M.Stat",

  // Postgraduate — commerce, management and the arts
  "MBA",
  "PGDM",
  "Executive MBA",
  "M.Com",
  "MA",
  "M.Des",
  "M.Arch",
  "MFA",
  "M.Ed",
  "MSW",
  "MHA",

  // Postgraduate — law, medicine and allied health
  "LL.M",
  "M.Pharm",
  "MPH",
  "MD",
  "MS (Medicine)",
  "MDS",
  "MPT",

  // Research
  "M.Phil",
  "Ph.D",
  "D.Sc",

  // Diplomas and professional qualifications
  "Diploma (Polytechnic)",
  "Advanced Diploma",
  "Post Graduate Diploma",
  "Chartered Accountancy (CA)",
  "Company Secretary (CS)",
  "Cost and Management Accountancy (CMA)",
] as const;

export type Degree = (typeof DEGREES)[number];
