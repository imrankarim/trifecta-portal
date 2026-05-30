-- Per-chapter tunable engagement-score weights.
--
-- The engagement score blends signals (forum attendance, local events, SLP,
-- WhatsApp, global events, recency) with weights that historically lived as
-- code constants. Different chapters care about different signals, so this
-- column lets a chapter tune them from the UI (/admin/scoring) — mapping-as-data,
-- consistent with chapters.data_sources_config.
--
-- Shape: { "forum_attendance_12m": 0.35, "local_event_attendance_12m": 0.25,
--          "slp_engagement": 0.15, "whatsapp_activity": 0.10,
--          "global_event_count_24m": 0.10, "recency_of_last_engagement": 0.05 }
-- Keys must match lib/scoring/engagementScore.ts WEIGHTS. NULL = use code
-- defaults. Values are normalized to sum 1.0 at scoring time, so the stored
-- numbers only need to express relative importance.

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS scoring_weights JSONB;

COMMENT ON COLUMN public.chapters.scoring_weights IS
  'Per-chapter engagement-score weights (keys match lib/scoring/engagementScore.ts WEIGHTS). NULL = use code defaults. Normalized to sum 1.0 at scoring time. Tunable via /admin/scoring.';
