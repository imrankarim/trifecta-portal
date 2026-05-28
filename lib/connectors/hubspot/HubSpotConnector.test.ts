import { describe, it, expect, vi } from "vitest";
import { HubSpotConnector } from "./HubSpotConnector";
import { ConnectorConfigError, NotSupportedError } from "../DataSource";

const CHAPTER_ID = "test-chapter-id";
const VALID_TOKEN = "pat-na1-test-token-1234";

/** Build a fetch mock that returns canned responses keyed by URL substring. */
function makeFetch(routes: Array<{ urlContains: string; body: unknown; status?: number }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = routes.find((r) => url.includes(r.urlContains));
    if (!match) {
      return new Response(`unhandled URL in mock: ${url}`, { status: 599 });
    }
    return new Response(JSON.stringify(match.body), {
      status: match.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Constructor / config validation
// ─────────────────────────────────────────────────────────────────────
describe("HubSpotConnector — config", () => {
  it("exposes sourceName + chapterId", () => {
    const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN });
    expect(c.sourceName).toBe("hubspot");
    expect(c.chapterId).toBe(CHAPTER_ID);
  });

  it("rejects an empty token", () => {
    expect(() => new HubSpotConnector({ chapterId: CHAPTER_ID, token: "" })).toThrow(
      ConnectorConfigError,
    );
  });

  it("rejects a malformed token (missing pat- prefix)", () => {
    expect(
      () => new HubSpotConnector({ chapterId: CHAPTER_ID, token: "not-a-hubspot-token" }),
    ).toThrow(ConnectorConfigError);
  });
});

// ─────────────────────────────────────────────────────────────────────
// getMembers — pagination + property filtering + archived skip
// ─────────────────────────────────────────────────────────────────────
describe("HubSpotConnector.getMembers", () => {
  it("returns ConnectorRecord[] with externalIds.hubspot set from contact id", async () => {
    const fetchImpl = makeFetch([
      {
        urlContains: "/objects/contacts",
        body: {
          results: [
            { id: "111", properties: { email: "a@x.com", firstname: "A" }, updatedAt: "2024-01-01T00:00:00Z" },
            { id: "222", properties: { email: "b@x.com", firstname: "B" }, updatedAt: "2024-02-01T00:00:00Z" },
          ],
        },
      },
    ]);

    const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN, fetchImpl });
    const records = await c.getMembers();

    expect(records).toHaveLength(2);
    expect(records[0].externalIds.hubspot).toBe("111");
    expect(records[0].sourceProperties).toEqual({ email: "a@x.com", firstname: "A" });
    expect(records[0].sourceLastModifiedAt).toBe("2024-01-01T00:00:00Z");
  });

  it("paginates via the `after` cursor", async () => {
    let callCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      callCount++;
      const url = input.toString();
      if (callCount === 1) {
        // First page: returns 2 records and a cursor for next page
        expect(url).not.toContain("after=");
        return new Response(
          JSON.stringify({
            results: [
              { id: "1", properties: { name: "First" } },
              { id: "2", properties: { name: "Second" } },
            ],
            paging: { next: { after: "cursor-2" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // Second page: returns 1 record, no further paging
      expect(url).toContain("after=cursor-2");
      return new Response(
        JSON.stringify({
          results: [{ id: "3", properties: { name: "Third" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN, fetchImpl });
    const records = await c.getMembers();

    expect(records).toHaveLength(3);
    expect(records.map((r) => r.externalIds.hubspot)).toEqual(["1", "2", "3"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("skips archived contacts", async () => {
    const fetchImpl = makeFetch([
      {
        urlContains: "/objects/contacts",
        body: {
          results: [
            { id: "1", properties: { email: "a@x.com" } },
            { id: "2", properties: { email: "b@x.com" }, archived: true },
            { id: "3", properties: { email: "c@x.com" } },
          ],
        },
      },
    ]);
    const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN, fetchImpl });
    const records = await c.getMembers();
    expect(records.map((r) => r.externalIds.hubspot)).toEqual(["1", "3"]);
  });

  it("filters by `since` based on updatedAt", async () => {
    const fetchImpl = makeFetch([
      {
        urlContains: "/objects/contacts",
        body: {
          results: [
            { id: "old", properties: {}, updatedAt: "2024-01-01T00:00:00Z" },
            { id: "new", properties: {}, updatedAt: "2024-06-01T00:00:00Z" },
            { id: "newer", properties: {}, updatedAt: "2024-12-01T00:00:00Z" },
          ],
        },
      },
    ]);
    const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN, fetchImpl });
    const records = await c.getMembers({ since: new Date("2024-05-01T00:00:00Z") });
    expect(records.map((r) => r.externalIds.hubspot)).toEqual(["new", "newer"]);
  });

  it("includes the propertiesToFetch list in the URL", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      expect(url).toContain("properties=");
      expect(url).toContain(encodeURIComponent("email,firstname,membership_status"));
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const c = new HubSpotConnector({
      chapterId: CHAPTER_ID,
      token: VALID_TOKEN,
      propertiesToFetch: ["email", "firstname", "membership_status"],
      fetchImpl,
    });
    await c.getMembers();
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("sends the Bearer token", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toBe(`Bearer ${VALID_TOKEN}`);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN, fetchImpl });
    await c.getMembers();
  });

  it("throws on non-2xx response with body excerpt", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("unauthorized", { status: 401 }),
    );
    const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN, fetchImpl });
    await expect(c.getMembers()).rejects.toThrow(/HubSpot getMembers HTTP 401/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// discoverSchema
// ─────────────────────────────────────────────────────────────────────
describe("HubSpotConnector.discoverSchema", () => {
  it("normalizes /crm/v3/properties/contacts response into SourceSchema", async () => {
    const fetchImpl = makeFetch([
      {
        urlContains: "/properties/contacts",
        body: {
          results: [
            {
              name: "email",
              label: "Email",
              type: "string",
              fieldType: "text",
              groupName: "contactinformation",
              hubspotDefined: true,
            },
            {
              name: "membership_status",
              label: "Membership Status",
              type: "enumeration",
              fieldType: "select",
              groupName: "contact_activity",
              options: [
                { value: "Active", label: "Active" },
                { value: "Lapsed", label: "Lapsed" },
              ],
              hubspotDefined: false,
            },
          ],
        },
      },
    ]);
    const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN, fetchImpl });
    const schema = await c.discoverSchema();
    expect(Object.keys(schema)).toEqual(["email", "membership_status"]);
    expect(schema.email).toMatchObject({
      name: "email",
      label: "Email",
      type: "string",
      fieldType: "text",
      groupName: "contactinformation",
    });
    expect(schema.email.options).toBeUndefined();
    expect(schema.membership_status.options).toEqual([
      { value: "Active", label: "Active" },
      { value: "Lapsed", label: "Lapsed" },
    ]);
  });

  it("throws on non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response("forbidden", { status: 403 }));
    const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN, fetchImpl });
    await expect(c.discoverSchema()).rejects.toThrow(/HubSpot discoverSchema HTTP 403/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Capability methods we deliberately don't implement (yet)
// ─────────────────────────────────────────────────────────────────────
describe("HubSpotConnector — read-only capabilities", () => {
  const fetchImpl = vi.fn();
  const c = new HubSpotConnector({ chapterId: CHAPTER_ID, token: VALID_TOKEN, fetchImpl });

  it("returns [] for getAttendanceRecords (HubSpot has no native attendance)", async () => {
    expect(await c.getAttendanceRecords()).toEqual([]);
  });

  it("returns [] for getPipelineStages", async () => {
    expect(await c.getPipelineStages()).toEqual([]);
  });

  it("throws NotSupportedError for writeOutcome (Phase 1 read-only)", async () => {
    await expect(
      c.writeOutcome({
        memberExternalIds: { hubspot: "1" },
        action: "call",
        result: "spoke",
        performedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(NotSupportedError);
  });
});
