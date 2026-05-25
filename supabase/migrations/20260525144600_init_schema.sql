-- Project Trifecta — initial schema migration
-- Honors v1.1 Section 8 non-negotiables:
--   * Trifecta UUID as PK on all entities
--   * eo_global_member_id on Member from day one
--   * eo_global_chapter_id on Chapter from day one
--   * chapter_id on every data table (multi-tenancy)
--   * Renewal intent fields on Member schema from day one
-- See: docs/Trifecta_Developer_Specification_v1.1.md, Sections 3 and 4.1

-- ---------------------------------------------------------------------------
-- Enums (v1.1 Section 3 & 4.1 field types)
-- ---------------------------------------------------------------------------

CREATE TYPE app_role AS ENUM ('Admin', 'BoardMember', 'ExecutiveDirector', 'Member');

CREATE TYPE preferred_channel AS ENUM ('WhatsApp', 'Email', 'SMS', 'Phone');
CREATE TYPE digest_channel    AS ENUM ('Email', 'WhatsApp', 'SMS');
CREATE TYPE urgent_channel    AS ENUM ('WhatsApp', 'SMS', 'Email');

CREATE TYPE membership_status AS ENUM ('Active', 'Grace Period', 'Lapsed', 'Alumni', 'Prospect');
CREATE TYPE renewal_status    AS ENUM ('Renewed', 'Pending', 'At Risk', 'Lapsed');
CREATE TYPE recruitment_source AS ENUM ('Peer Referral', 'Event', 'Cold Outreach', 'EO Accelerator', 'Other');
CREATE TYPE renewal_intent_response AS ENUM ('PlanToRenew', 'WantToSpeak', 'WontRenew', 'NoResponse');

CREATE TYPE eo_region AS ENUM ('US Central', 'US East', 'US West', 'Canada', 'Europe', 'LAC', 'MEPA', 'APAC', 'North Asia', 'South Asia');

CREATE TYPE annual_revenue_range AS ENUM ('$1M-$5M', '$5M-$20M', '$20M-$100M', '$100M+');
CREATE TYPE employee_count_range AS ENUM ('1-10', '11-50', '51-200', '201-500', '500+');

CREATE TYPE forum_role AS ENUM ('Member', 'Chair', 'Vice Chair', 'None');
CREATE TYPE slp_engagement_status AS ENUM ('Active', 'Occasional', 'None');
CREATE TYPE whatsapp_activity_level AS ENUM ('High', 'Medium', 'Low', 'None');

CREATE TYPE engagement_trend AS ENUM ('Improving', 'Stable', 'Declining');
CREATE TYPE churn_risk_tier  AS ENUM ('Critical', 'High', 'Medium', 'Low', 'Monitor');

CREATE TYPE outreach_method  AS ENUM ('Call', 'WhatsApp', 'Email', 'In Person', 'Other');
CREATE TYPE outreach_outcome AS ENUM ('Connected', 'No Response', 'Positive', 'Needs Follow-up', 'Resolved');

CREATE TYPE gdpr_consent     AS ENUM ('Granted', 'Pending', 'Withdrawn');
CREATE TYPE subscription_tier AS ENUM ('Pilot', 'Starter', 'Professional', 'Enterprise');

-- ---------------------------------------------------------------------------
-- chapters (v1.1 Section 4.1)
-- ---------------------------------------------------------------------------

CREATE TABLE public.chapters (
  trifecta_chapter_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  eo_global_chapter_id  TEXT        UNIQUE,
  chapter_name          TEXT        NOT NULL,
  eo_region             eo_region   NOT NULL,
  city                  TEXT        NOT NULL,
  country               TEXT        NOT NULL,
  -- ed_member_id added after members table exists (circular FK)
  ed_member_id          UUID,
  hubspot_portal_id     TEXT,
  data_sources_config   JSONB,                                   -- encrypted at app layer (Supabase Vault or service-role-only access)
  subscription_tier     subscription_tier NOT NULL DEFAULT 'Pilot',
  active_since          DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.chapters IS 'EO chapter. Top-level multi-tenancy root per v1.1 Section 2.5.';
COMMENT ON COLUMN public.chapters.data_sources_config IS 'Per-connector API credentials and config. v1.1 Section 7.3 requires encryption at rest — enforce via Supabase Vault or RLS limiting access to service role only.';

-- ---------------------------------------------------------------------------
-- members (v1.1 Section 3)
-- ---------------------------------------------------------------------------

CREATE TABLE public.members (
  -- 3.1 Identity
  trifecta_member_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  eo_global_member_id   TEXT         UNIQUE,                    -- per v1.1 §2.4: critical for cross-chapter dedup
  email_primary         TEXT         NOT NULL,
  emails_additional     TEXT[]       NOT NULL DEFAULT '{}',
  first_name            TEXT         NOT NULL,
  last_name             TEXT         NOT NULL,
  preferred_name        TEXT,
  phone_mobile          TEXT,
  phones_additional     JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- array of {type, number}
  preferred_channel     preferred_channel NOT NULL DEFAULT 'Email',
  digest_channel        digest_channel    NOT NULL DEFAULT 'Email',      -- v1.1 §2.6 default
  urgent_channel        urgent_channel    NOT NULL DEFAULT 'WhatsApp',   -- v1.1 §2.6 default
  linkedin_url          TEXT,
  photo_url             TEXT,
  time_zone             TEXT,        -- IANA, e.g. 'America/Chicago'

  -- 3.2 EO Membership (+ v1.1 renewal intent fields)
  chapter_id            UUID         NOT NULL REFERENCES public.chapters(trifecta_chapter_id) ON DELETE RESTRICT,
  membership_status     membership_status NOT NULL,
  join_date_original    DATE         NOT NULL,
  join_dates_history    DATE[]       NOT NULL DEFAULT '{}',
  rejoin_dates          DATE[]       NOT NULL DEFAULT '{}',
  years_in_eo           NUMERIC(5,2),                            -- computed nightly
  next_renewal_date     DATE,
  renewal_status        renewal_status,
  sponsor_member_id     UUID         REFERENCES public.members(trifecta_member_id) ON DELETE SET NULL,
  recruitment_source    recruitment_source,
  renewal_intent_response       renewal_intent_response,
  renewal_intent_survey_sent_at TIMESTAMPTZ,
  renewal_intent_survey_responded_at TIMESTAMPTZ,
  renewal_intent_notes          TEXT,
  renewal_intent_survey_year    INTEGER,

  -- 3.3 EO Region & Geography
  eo_region             eo_region    NOT NULL,
  city                  TEXT,
  state_province        TEXT,
  country               TEXT,                                    -- ISO 3166-1 alpha-2

  -- 3.4 Business Profile
  company_name          TEXT         NOT NULL,
  job_title             TEXT,
  industry_vertical     TEXT,
  annual_revenue_range  annual_revenue_range,
  employee_count_range  employee_count_range,
  company_website       TEXT,

  -- 3.5 Board & Leadership
  board_role_current    TEXT,
  board_role_start_date DATE,
  board_roles_history   JSONB        NOT NULL DEFAULT '[]'::jsonb,   -- array of {role, chapter_id, start, end}
  committee_memberships TEXT[]       NOT NULL DEFAULT '{}',

  -- 3.6 Forum (FK constraint added in later migration when forums table exists)
  forum_id              UUID,
  forum_assignment_date DATE,
  forum_role            forum_role,
  forum_attendance_rate_12m  NUMERIC(5,2),                       -- %, 0-100
  forum_attendance_count_12m INTEGER,
  forum_last_attended_date   DATE,

  -- 3.7 Event Engagement
  local_event_attendance_rate_12m NUMERIC(5,2),
  local_event_last_attended_date  DATE,
  global_event_count_lifetime     INTEGER,
  global_event_count_24m          INTEGER,
  global_event_last_attended_date DATE,
  learning_social_event_count_12m INTEGER,

  -- 3.8 SLP & Family
  slp_name                 TEXT,
  slp_engagement_status    slp_engagement_status,
  slp_programs_count_12m   INTEGER,

  -- 3.9 EOA History
  eoa_member            BOOLEAN,
  eoa_chapter           TEXT,
  eoa_start_date        DATE,
  eoa_graduation_date   DATE,

  -- 3.10 Digital & WhatsApp Signals
  whatsapp_activity_level   whatsapp_activity_level,
  whatsapp_last_active_date DATE,
  whatsapp_groups           TEXT[]   NOT NULL DEFAULT '{}',
  myeo_participation        BOOLEAN,
  myeo_groups               TEXT[]   NOT NULL DEFAULT '{}',
  sap_interactions          INTEGER,

  -- 3.11 Engagement Score (computed)
  engagement_score_current  NUMERIC(5,2),                        -- 0-100
  engagement_score_prev     NUMERIC(5,2),
  engagement_trend          engagement_trend,
  churn_risk_tier           churn_risk_tier,
  days_since_last_engagement INTEGER,
  score_last_calculated_at  TIMESTAMPTZ,

  -- 3.12 Outreach Tracking
  outreach_last_date        DATE,
  outreach_last_by          UUID     REFERENCES public.members(trifecta_member_id) ON DELETE SET NULL,
  outreach_last_method      outreach_method,
  outreach_last_outcome     outreach_outcome,
  outreach_count_90d        INTEGER,
  next_touchpoint_date      DATE,

  -- 3.13 Data Management
  hubspot_contact_id    TEXT,                                    -- per v1.1 §2.3: secondary reference only
  data_sources_active   TEXT[]       NOT NULL DEFAULT '{}',
  last_sync_at          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  data_completeness_pct NUMERIC(5,2),
  do_not_contact        BOOLEAN      NOT NULL DEFAULT FALSE,
  gdpr_consent          gdpr_consent,
  notes                 JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- array of {ts, author_id, text}
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Auth integration (Phase 1 plan Step 1.3): link a member row to a Supabase Auth user when they log in.
  auth_user_id          UUID         UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  role                  app_role     NOT NULL DEFAULT 'Member',

  -- A given HubSpot contact can only correspond to one member within a chapter
  CONSTRAINT members_hubspot_chapter_uq UNIQUE (chapter_id, hubspot_contact_id)
);

COMMENT ON TABLE  public.members IS 'Trifecta canonical Member record. Anchor entity for engagement signals, scores, and actions.';
COMMENT ON COLUMN public.members.eo_global_member_id IS 'Indexed nullable unique key per v1.1 §2.4. Critical for future cross-chapter dedup and EO Global API integration.';
COMMENT ON COLUMN public.members.hubspot_contact_id IS 'Secondary reference only per v1.1 §2.3. NEVER use as PK.';
COMMENT ON COLUMN public.members.auth_user_id IS 'Links a member to a Supabase Auth user. NULL for members who do not log in (most members). Set when an admin invites a board member to the portal.';

-- ---------------------------------------------------------------------------
-- Resolve circular FK: chapters.ed_member_id -> members.trifecta_member_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_ed_member_id_fkey
  FOREIGN KEY (ed_member_id) REFERENCES public.members(trifecta_member_id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Indexes (query patterns: by chapter, by external ID, by email, by score)
-- ---------------------------------------------------------------------------

CREATE INDEX idx_members_chapter_id          ON public.members (chapter_id);
CREATE INDEX idx_members_email_primary       ON public.members (email_primary);
CREATE INDEX idx_members_eo_global_member_id ON public.members (eo_global_member_id) WHERE eo_global_member_id IS NOT NULL;
CREATE INDEX idx_members_hubspot_contact_id  ON public.members (hubspot_contact_id) WHERE hubspot_contact_id IS NOT NULL;
CREATE INDEX idx_members_membership_status   ON public.members (chapter_id, membership_status);
CREATE INDEX idx_members_churn_risk_tier     ON public.members (chapter_id, churn_risk_tier) WHERE churn_risk_tier IS NOT NULL;
CREATE INDEX idx_members_auth_user_id        ON public.members (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX idx_members_next_renewal_date   ON public.members (chapter_id, next_renewal_date) WHERE next_renewal_date IS NOT NULL;

CREATE INDEX idx_chapters_eo_global_chapter_id ON public.chapters (eo_global_chapter_id) WHERE eo_global_chapter_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER chapters_set_updated_at BEFORE UPDATE ON public.chapters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER members_set_updated_at BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
