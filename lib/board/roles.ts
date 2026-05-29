// EO Dallas 2026–2027 board roster, sourced from the "EO Dallas 26-27
// Board_Accountability Chart" Google Sheet (the DB's board_roles_history only
// records a generic "Board Member" role, so the granular office → person
// mapping lives here as config). Member IDs were resolved by name match against
// the members table; holders who aren't member rows (chapter staff, a spouse
// running the SLP program) carry memberId: null and render as plain text.
//
// When the roster changes, re-read the source sheet (see the board-roster-source
// memory) and update this file.

export type BoardTier = "leadership" | "core" | "extended";

export type BoardDomain =
  | "chapter"
  | "membership"
  | "engagement"
  | "learning"
  | "forum"
  | "finance"
  | "governance"
  | "marcomm"
  | "sap"
  | "social"
  | "accelerator"
  | "gsea"
  | "slp"
  | "admin";

export interface BoardRoleHolder {
  name: string;
  /** trifecta_member_id, or null if the holder isn't a member row. */
  memberId: string | null;
}

export interface BoardRoleDef {
  key: string;
  title: string;
  tier: BoardTier;
  domain: BoardDomain;
  /** One-line responsibility summary (from the accountability chart). */
  blurb: string;
  holders: BoardRoleHolder[];
  /** Visible only to Admin / Executive Director / staff. */
  adminOnly?: boolean;
}

export const TIER_LABELS: Record<BoardTier, string> = {
  leadership: "Leadership",
  core: "Core Board",
  extended: "Extended Board",
};

export const BOARD_ROLES: BoardRoleDef[] = [
  // ── Leadership ──────────────────────────────────────────────────────────
  {
    key: "president",
    title: "President",
    tier: "leadership",
    domain: "chapter",
    blurb: "Leads the board and sets chapter direction for the year.",
    holders: [{ name: "Gail Davis", memberId: "70a26440-73f7-4923-944c-158c71079246" }],
  },
  {
    key: "executive-director",
    title: "Executive Director",
    tier: "leadership",
    domain: "chapter",
    blurb: "Runs chapter operations and Trifecta meetings; jointly owns KPI data.",
    holders: [{ name: "Jon Minjoe", memberId: "5c351cd2-f5d9-48e7-8b98-4377e15a3a74" }],
  },
  {
    key: "president-elect",
    title: "President-Elect",
    tier: "leadership",
    domain: "chapter",
    blurb: "Prepares to lead; shadows the President through the term.",
    holders: [{ name: "Rakesh Patel", memberId: "0668a434-e864-404f-8ca2-9e9648615223" }],
  },
  {
    key: "past-president",
    title: "Past President",
    tier: "leadership",
    domain: "chapter",
    blurb: "Advises the board and supports leadership continuity.",
    holders: [{ name: "Mike Rose", memberId: "10c909df-41c6-4a42-8ab2-dfc075965226" }],
  },
  {
    key: "chapter-admin",
    title: "Chapter Admin",
    tier: "leadership",
    domain: "admin",
    blurb: "Chapter administration and operational support.",
    holders: [{ name: "Ricah Sevilla", memberId: null }],
    adminOnly: true,
  },

  // ── Core Board ──────────────────────────────────────────────────────────
  {
    key: "membership",
    title: "Membership Chair",
    tier: "core",
    domain: "membership",
    blurb: "The face of EO to prospects; drives quality new-member growth.",
    holders: [{ name: "Imran Karim", memberId: "b775d721-0288-4bdf-ad34-8d588f7def35" }],
  },
  {
    key: "engagement",
    title: "Member Engagement Chair",
    tier: "core",
    domain: "engagement",
    blurb: "Owns onboarding and the member experience; runs chapter surveys.",
    holders: [{ name: "Matt Newton", memberId: "b58bfce7-7502-4fac-8435-e252d32e83ba" }],
  },
  {
    key: "learning",
    title: "Learning Chair",
    tier: "core",
    domain: "learning",
    blurb: "Plans the events and learning calendar that add member value.",
    holders: [{ name: "Rob DeVita", memberId: "7612c517-c30f-401e-a467-bd9cdfb05391" }],
  },
  {
    key: "forum",
    title: "Forum Co-Chairs",
    tier: "core",
    domain: "forum",
    blurb: "Ensure forums add value; train moderators; place new members.",
    holders: [
      { name: "Morgan Katz", memberId: "025df5e0-f4d0-4cba-bd38-cbf60eaafd1e" },
      { name: "Ruth Ann Rose", memberId: "12897582-9965-4ad3-aef5-67313b7accdc" },
    ],
  },
  {
    key: "finance",
    title: "Finance Chair",
    tier: "core",
    domain: "finance",
    blurb: "Ensures financial health; owns the budget and dues stewardship.",
    holders: [{ name: "Prince Maliyil", memberId: "c18f896d-3893-45a8-95d2-a17d9364f4b9" }],
  },
  {
    key: "governance",
    title: "Governance Chair",
    tier: "core",
    domain: "governance",
    blurb: "Compliance, retention tracking, and KPI reporting on schedule.",
    holders: [{ name: "Navid Razi", memberId: "116c0d81-99d1-48fd-b959-282571281da7" }],
  },
  {
    key: "marcomm",
    title: "MarComm Chair",
    tier: "core",
    domain: "marcomm",
    blurb: "Chapter marketing and communications.",
    holders: [{ name: "Cristian Urzua", memberId: "ae5fddc9-a9c7-4d5d-b8ba-2d47070efd15" }],
  },
  {
    key: "sap",
    title: "Strategic Alliance Chair",
    tier: "core",
    domain: "sap",
    blurb: "Builds sponsor partnerships (SAPs) and grows the pipeline.",
    holders: [{ name: "Ellen Hunter", memberId: "c659209a-f97f-43b6-ac95-560c14e82010" }],
  },
  {
    key: "social",
    title: "MyEO / Social Chair",
    tier: "core",
    domain: "social",
    blurb: "Runs social programming and MyEO activities.",
    holders: [{ name: "Lily Smith", memberId: "37926164-1a8b-4ae8-9765-c1f144a6c5d6" }],
  },

  // ── Extended Board ──────────────────────────────────────────────────────
  {
    key: "accelerator",
    title: "Accelerator Chair",
    tier: "extended",
    domain: "accelerator",
    blurb: "Leads the EO Accelerator program for early-stage entrepreneurs.",
    holders: [{ name: "Randy Haran", memberId: "71a27906-a813-4cf4-9caf-d9d2b1741524" }],
  },
  {
    key: "gsea",
    title: "GSEA Chair",
    tier: "extended",
    domain: "gsea",
    blurb: "Runs the Global Student Entrepreneur Awards for the chapter.",
    holders: [{ name: "Randy Haran", memberId: "71a27906-a813-4cf4-9caf-d9d2b1741524" }],
  },
  {
    key: "slp",
    title: "SLP Chair",
    tier: "extended",
    domain: "slp",
    blurb: "Leads the Spouse & Life Partner program.",
    holders: [{ name: "Julia Magann", memberId: null }],
  },
];

export function getRole(key: string): BoardRoleDef | undefined {
  return BOARD_ROLES.find((r) => r.key === key);
}
