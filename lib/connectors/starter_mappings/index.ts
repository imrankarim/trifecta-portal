// Registry of starter mapping packs. Each pack is a curated FieldMapping[]
// that a chapter's data_sources_config references via
// `mappings.starter_mapping_base`. Chapters layer their custom-property
// mappings on top — the merge happens in the sync layer (Phase 2).
//
// Adding a new starter pack:
//   1. Drop a new module here (e.g. pipedrive_default_v1.ts).
//   2. Export it from this index.
//   3. Add it to STARTER_MAPPINGS.

import type { FieldMapping } from "../mapping-schema";
import {
  HUBSPOT_DEFAULT_V1,
  HUBSPOT_DEFAULT_V1_NAME,
} from "./hubspot_default_v1";

export { HUBSPOT_DEFAULT_V1, HUBSPOT_DEFAULT_V1_NAME };

export const STARTER_MAPPINGS: Record<string, ReadonlyArray<FieldMapping>> = {
  [HUBSPOT_DEFAULT_V1_NAME]: HUBSPOT_DEFAULT_V1,
};

/**
 * Look up a starter mapping pack by name. Returns undefined if unknown —
 * callers should treat a missing starter as "chapter authors the full mapping
 * themselves" rather than failing.
 */
export function getStarterMapping(name: string): ReadonlyArray<FieldMapping> | undefined {
  return STARTER_MAPPINGS[name];
}
