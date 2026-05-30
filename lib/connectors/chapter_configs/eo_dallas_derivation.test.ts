import { describe, it, expect } from "vitest";
import { applyMappings } from "../../jobs/applyMappings";
import { getStarterMapping } from "../starter_mappings";
import { EO_DALLAS_HUBSPOT_MAPPINGS } from "./eo_dallas_hubspot";
import type { ConnectorRecord } from "../types";

// These run the ACTUAL exported EO Dallas config (merged with the real starter
// mapping) through applyMappings, so the load-bearing contact_type +
// membership_status derivation can't silently change. In particular this pins
// the join_date→Active fallback rule that the sync's status-lock guard exists
// to protect against.

const starter = getStarterMapping("hubspot_default_v1") ?? [];

function planFor(props: Record<string, unknown>) {
  const record: ConnectorRecord = { externalIds: { hubspot: "1" }, sourceProperties: props };
  return applyMappings(record, starter, EO_DALLAS_HUBSPOT_MAPPINGS, undefined);
}

describe("EO Dallas derivation — contact_type", () => {
  it("a SAP record is a Sponsor, even with member signals present", () => {
    const p = planFor({ email: "s@x.com", firstname: "S", lastname: "P", sap_active_: "Yes", join_date: "2020-01-01" });
    expect(p.contactType).toBe("Sponsor");
  });

  it("join_date alone is enough to classify a Member", () => {
    const p = planFor({ email: "m@x.com", firstname: "M", lastname: "B", join_date: "2021-01-01" });
    expect(p.contactType).toBe("Member");
  });

  it("an application with no join_date is still a Member (Prospect lifecycle)", () => {
    const p = planFor({ email: "p@x.com", firstname: "P", lastname: "R", application: "Submitted" });
    expect(p.contactType).toBe("Member");
  });

  it("no operational signal → contactType null (sync layer skips the contact)", () => {
    const p = planFor({ email: "n@x.com", firstname: "N", lastname: "S" });
    expect(p.contactType).toBeNull();
  });
});

describe("EO Dallas derivation — membership_status", () => {
  it("join_date set, no explicit status → Active (the load-bearing fallback)", () => {
    const p = planFor({ email: "m@x.com", firstname: "M", lastname: "B", join_date: "2021-01-01" });
    expect(p.memberColumns.membership_status).toBe("Active");
  });

  it("explicit Sabbatical wins over the join_date fallback → On Leave", () => {
    const p = planFor({
      email: "l@x.com",
      firstname: "L",
      lastname: "B",
      membership_status: "Sabbatical",
      join_date: "2019-01-01",
    });
    expect(p.memberColumns.membership_status).toBe("On Leave");
  });

  it("explicit Alumni → Former Member", () => {
    const p = planFor({
      email: "f@x.com",
      firstname: "F",
      lastname: "B",
      membership_status: "Alumni",
      join_date: "2015-01-01",
    });
    expect(p.memberColumns.membership_status).toBe("Former Member");
  });

  it("application without join_date → Prospect", () => {
    const p = planFor({ email: "p@x.com", firstname: "P", lastname: "R", application: "Submitted" });
    expect(p.memberColumns.membership_status).toBe("Prospect");
  });

  it("no signal at all → membership_status is not written", () => {
    const p = planFor({ email: "n@x.com", firstname: "N", lastname: "S" });
    expect(p.memberColumns.membership_status).toBeUndefined();
  });
});
