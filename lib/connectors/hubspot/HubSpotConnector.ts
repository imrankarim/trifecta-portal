// HubSpotConnector — implements DataSource for the HubSpot Contacts API.
//
// Per ADR-004, this connector is generic across all HubSpot chapters. It
// authenticates with a Private App token (or Service Key — same format),
// paginates the contacts API, and returns ConnectorRecord[] with full
// source properties. The sync layer applies the chapter's mapping rules.
//
// It does NOT pre-map firstname→first_name. It does NOT know what
// "membership_status" means semantically. Every chapter's HubSpot can have
// totally different customizations and this code doesn't care.

import {
  type DataSource,
  ConnectorConfigError,
  NotSupportedError,
} from "../DataSource";
import type {
  ConnectorRecord,
  ConnectorAttendanceRecord,
  ConnectorPipelineStage,
  OutreachOutcomeWrite,
  SourceProperty,
  SourceSchema,
} from "../types";

const HUBSPOT_API = "https://api.hubapi.com";
const CONTACTS_PAGE_SIZE = 100; // HubSpot max per page

/** Subset of HubSpot's property metadata we actually consume. */
interface HubSpotPropertyApiShape {
  name: string;
  label?: string;
  groupName?: string;
  type?: string;
  fieldType?: string;
  options?: Array<{ value: string; label: string }>;
  hubspotDefined?: boolean;
  hidden?: boolean;
}

/** Subset of HubSpot's contact-object shape returned by /crm/v3/objects/contacts. */
interface HubSpotContactApiShape {
  id: string;
  properties: Record<string, unknown>;
  updatedAt?: string;
  archived?: boolean;
}

interface ContactsApiResponse {
  results: HubSpotContactApiShape[];
  paging?: { next?: { after: string; link?: string } };
}

interface PropertiesApiResponse {
  results: HubSpotPropertyApiShape[];
}

/**
 * Constructor input. The sync layer assembles this from
 * chapters.data_sources_config.hubspot and the chapter's mapping config.
 */
export interface HubSpotConnectorConfig {
  /** Trifecta chapter this connector instance is scoped to. */
  chapterId: string;
  /** HubSpot Private App / Service Key token. Starts with "pat-na1-...". */
  token: string;
  /**
   * Source property names this connector should fetch for each contact.
   * Typically derived by the sync layer from the chapter's field_mappings
   * plus a small set of always-fetched fields (e.g. "hs_object_id",
   * "lastmodifieddate"). If empty, the connector falls back to HubSpot's
   * default property set (limited to ~50 fields).
   */
  propertiesToFetch?: string[];
  /**
   * Optional fetch implementation override — for tests. Defaults to global fetch.
   */
  fetchImpl?: typeof fetch;
}

export class HubSpotConnector implements DataSource {
  readonly sourceName = "hubspot";
  readonly chapterId: string;

  private readonly token: string;
  private readonly propertiesToFetch: string[];
  private readonly fetchImpl: typeof fetch;

  constructor(config: HubSpotConnectorConfig) {
    if (!config.token || !config.token.startsWith("pat-")) {
      throw new ConnectorConfigError(
        "hubspot",
        "token missing or wrong format (expected pat-… prefix)",
      );
    }
    this.chapterId = config.chapterId;
    this.token = config.token;
    this.propertiesToFetch = config.propertiesToFetch ?? [];
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  // ─────────────────────────────────────────────────────────────────────
  // DataSource implementation
  // ─────────────────────────────────────────────────────────────────────

  async getMembers(opts: { since?: Date } = {}): Promise<ConnectorRecord[]> {
    const records: ConnectorRecord[] = [];
    const propertiesParam = this.propertiesToFetch.length > 0
      ? `&properties=${encodeURIComponent(this.propertiesToFetch.join(","))}`
      : "";

    let after: string | undefined;
    let pages = 0;
    const maxPages = 500; // safety cap; 100 × 500 = 50K contacts

    while (pages < maxPages) {
      const afterParam = after ? `&after=${encodeURIComponent(after)}` : "";
      const url =
        `${HUBSPOT_API}/crm/v3/objects/contacts` +
        `?limit=${CONTACTS_PAGE_SIZE}${afterParam}${propertiesParam}`;
      const resp = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!resp.ok) {
        throw new Error(`HubSpot getMembers HTTP ${resp.status}: ${await safeText(resp)}`);
      }
      const body = (await resp.json()) as ContactsApiResponse;

      for (const c of body.results) {
        if (c.archived) continue;
        if (opts.since && c.updatedAt && new Date(c.updatedAt) < opts.since) continue;
        records.push({
          externalIds: { hubspot: c.id },
          sourceProperties: c.properties ?? {},
          sourceLastModifiedAt: c.updatedAt ?? null,
        });
      }

      after = body.paging?.next?.after;
      pages++;
      if (!after) break;
    }
    return records;
  }

  async discoverSchema(): Promise<SourceSchema> {
    const url = `${HUBSPOT_API}/crm/v3/properties/contacts`;
    const resp = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!resp.ok) {
      throw new Error(`HubSpot discoverSchema HTTP ${resp.status}: ${await safeText(resp)}`);
    }
    const body = (await resp.json()) as PropertiesApiResponse;
    const schema: SourceSchema = {};
    for (const p of body.results) {
      const entry: SourceProperty = {
        name: p.name,
        label: p.label,
        groupName: p.groupName,
        type: p.type,
        fieldType: p.fieldType,
      };
      if (p.options && p.options.length > 0) {
        entry.options = p.options.map((o) => ({ value: o.value, label: o.label }));
      }
      schema[p.name] = entry;
    }
    return schema;
  }

  // HubSpot's Contacts API doesn't have native attendance or pipeline objects
  // that map cleanly to Trifecta — both are encoded in custom contact properties
  // (per-fiscal-year multi-selects, etc.). Those are surfaced through getMembers()
  // and turned into attendance / pipeline records by mapping rules at sync time.
  async getAttendanceRecords(): Promise<ConnectorAttendanceRecord[]> {
    return [];
  }

  async getPipelineStages(): Promise<ConnectorPipelineStage[]> {
    return [];
  }

  /** Phase 1 read-only. Write-back lands in Phase 2 (v1.1 §2.2). */
  async writeOutcome(_outcome: OutreachOutcomeWrite): Promise<void> {
    throw new NotSupportedError("writeOutcome", this.sourceName);
  }
}

async function safeText(resp: Response): Promise<string> {
  try {
    const t = await resp.text();
    return t.length > 500 ? t.slice(0, 500) + "…" : t;
  } catch {
    return "(no body)";
  }
}
