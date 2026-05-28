// EO Dallas — HubSpot field mapping configuration.
//
// This file is the canonical authoring document for the per-chapter mappings
// that get written to chapters.data_sources_config.hubspot.mappings for
// EO Dallas. See ADR-004 for the architectural rationale.
//
// Source data: docs/hubspot/eo_dallas_custom_properties.md (652 properties
// total in their HubSpot — 422 standard, 230 custom).
//
// Rule of thumb for what's included here:
//   * High-value canonical mappings (membership_status, renewal, forum,
//     board, EOA, recruitment_source) → real Trifecta columns
//   * EO-Dallas-specific data we want to preserve but Trifecta's canonical
//     schema doesn't model → members.custom_fields.<key>
//   * Per-fiscal-year event multi-selects → custom_fields.attendance.<bucket>
//     (will migrate to a real event_attendance table in Phase 2)
//   * Exit-survey textareas → notes via append_to_notes
//   * The `requalification_properties` group → custom_fields.requalification
//     via group_to_jsonb (21 properties at once)
//
// Anything NOT mapped here is implicitly discarded by the sync layer.
// Unmapped fields can be added later as data — no code change needed.

import type { FieldMapping } from "../mapping-schema";

export const EO_DALLAS_HUBSPOT_AUTHORED_BY = "human:imran-karim+claude-2026-05-28";

export const EO_DALLAS_HUBSPOT_MAPPINGS: FieldMapping[] = [
  // ============================================================
  // IDENTITY  (custom properties beyond hubspot_default_v1)
  // ============================================================
  {
    source: "birthday",
    target: "members.custom_fields.birthday",
    transform: "iso_date",
    notes: "Trifecta has no canonical birthday column. Preserve in custom_fields.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // MEMBERSHIP STATUS — the headline mapping
  // ============================================================
  {
    source: "membership_status",
    target: "members.membership_status",
    transform: "enum_map",
    transform_args: {
      value_map: {
        Active: "Active",
        Inactive: "Lapsed",
        Sabbatical: "On Leave",
        Alumni: "Alumni",
        Spouse: "Spouse",
      },
      default: null,
    },
    notes:
      "EO Dallas's Inactive→Lapsed; Sabbatical→On Leave; Spouse handled per ADR-004 design question 2.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "join_date",
    target: "members.join_date_original",
    transform: "iso_date",
    notes: "Direct map to the Trifecta canonical column.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "how_long_were_you_a_member_of_eo_dallas_",
    target: "members.custom_fields.years_in_eo_self_reported",
    transform: "direct_copy",
    notes:
      "Exit-survey self-report. Trifecta canonical years_in_eo is computed; keep this as context.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // RENEWAL  — feeds the at-risk digest directly
  // ============================================================
  {
    source: "renewal_status",
    target: "members.renewal_intent_response",
    transform: "enum_map_after_strip",
    transform_args: {
      strip_pattern: "^[\\p{Emoji}\\p{Emoji_Component}\\s]+",
      value_map: {
        "Confirmed Renew": "PlanToRenew",
        "Leaning Renew": "PlanToRenew",
        "At Risk": "WantToSpeak",
        "Likely Non-Renew": "WontRenew",
      },
      default: null,
    },
    notes:
      "EO Dallas decorates with emoji (💚💛♥️🖤). Strip leading emoji+whitespace then map. ADR-004 example.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // Exit-survey free text → notes via append_to_notes.
  // These are gold for the scoring engine and digest (Phase 1 Week 3 use them
  // as context for at-risk explanations).
  {
    source: "why_have_you_decided_to_leave_eo_dallas_",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:exit_survey:leaving_reason" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "when_did_you_make_your_decision_not_to_renew_with_eo_dallas_",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:exit_survey:decision_timing" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "who_did_you_first_notify_regarding_your_renewal_decision_",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:exit_survey:first_notified" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "please_select_any___all_reasons_you_are_not_choosing_to_renew_your_membership",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:exit_survey:non_renewal_reasons" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "please_share_any_other_reasons_for_not_renewing_below_",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:exit_survey:additional_reasons" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "if_eo_dallas_ultimately_failed_to_meet_your_needs_as_an_entrepreneur__please_share_why__and_what_yo",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:exit_survey:failure_feedback" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "what__if_any__changes_within_eo_dallas_would_lead_you_to_consider_rejoining_",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:exit_survey:rejoin_conditions" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "where_did_you_get_the_most_value_out_of_eo_dallas__the_least_",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:exit_survey:value_assessment" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "do_you_have_any_additional_feedback_for_our_board_to_consider_",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:exit_survey:board_feedback" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "what_is_the_one_thing_about_eo_that_has_kept_you_renewing_your_membership_up_to_this_point__and__if",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:renewal_survey:retention_factor" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "in_your_own_words__what_value_can_eo_dallas_provide_to_you_as_an_elumni_of_our_chapter__now__and_in",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:alumni_survey:future_value" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "please_rate_your_overall_eo_dallas_experience",
    target: "members.custom_fields.overall_experience_rating",
    transform: "direct_copy",
    notes: "Excellent/Good/Average/Fair/Poor — useful score input later.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "how_would_you_like_to_stay_involved_with_eo_dallas_",
    target: "members.custom_fields.alumni_engagement_interest",
    transform: "array_of_text",
    notes: "Multi-select of post-membership engagement options.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // FORUM  — engagement-critical
  // ============================================================
  {
    source: "forum",
    target: "members.custom_fields.forum_name",
    transform: "direct_copy",
    notes:
      "Forum name (32 distinct values in EO Dallas). Future: populate a forums table and link via members.forum_id. For Phase 1 preserve as a name string.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "current_moderator",
    target: "members.forum_role",
    transform: "enum_map",
    transform_args: {
      value_map: { true: "Chair", false: "Member" },
      default: "Member",
    },
    notes: "EO Dallas tracks moderator as boolean; map true→Chair.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "moderator_elect",
    target: "members.custom_fields.forum_moderator_elect",
    transform: "bool_from_yes_no",
    notes: "Vice-chair concept — preserve as a flag.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "forum_trained",
    target: "members.custom_fields.forum_trained",
    transform: "bool_from_yes_no",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "date_forum_trained",
    target: "members.custom_fields.forum_trained_date",
    transform: "iso_date",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "fmr__mod",
    target: "members.custom_fields.former_moderator",
    transform: "bool_from_yes_no",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "forum_moderator",
    target: "members.custom_fields.forum_moderator_name",
    transform: "direct_copy",
    notes: "Name of THIS member's forum moderator (not their own role).",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "eo_forum_experience_rating",
    target: "members.custom_fields.forum_experience_rating",
    transform: "direct_copy",
    notes: "1-10 self-reported.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "eo_forum_experience_reason",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:forum_experience_reason" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // BOARD SERVICE
  // ============================================================
  {
    source: "dallas_bod",
    target: "members.board_roles_history",
    transform: "checkbox_years_to_history",
    transform_args: { role: "Board Member" },
    notes: "Year-range multi-select → board_roles_history JSONB. ADR-004 worked example.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "fmr__board",
    target: "members.custom_fields.former_board",
    transform: "bool_from_yes_no",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "bod_position",
    target: "members.custom_fields.board_position_history",
    transform: "array_of_text",
    notes: "Multi-select of 26 board position labels. Free-form for now.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // BUSINESS / COMPANY  — Trifecta canonical + multi-company spillover
  // ============================================================
  {
    source: "annual_revenue_range",
    target: "members.annual_revenue_range",
    transform: "enum_map",
    transform_args: {
      value_map: {
        "Less than 1,000,000": null,
        "1,000,000 - 5,000,000": "$1M-$5M",
        "5,000,000 - 10,000,000": "$5M-$20M",
        "10,000,000 - 50,000,000": "$5M-$20M",
        "50,000,000 - 100,000,000": "$20M-$100M",
        "100,000,000+": "$100M+",
      },
      default: null,
    },
    notes:
      "EO Dallas's bands differ from Trifecta's enum. Best-fit mapping: 10-50M lands in $5M-$20M (closest lower neighbor). EO membership requires $1M+ so 'Less than 1M' shouldn't occur for actives.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "annual_revenue_number",
    target: "members.custom_fields.annual_revenue_number",
    transform: "direct_copy",
    notes: "Exact figure if known. Useful for board-only finance views.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "company_1_*",
    target: "members.custom_fields.additional_companies",
    transform: "multi_company_primary",
    transform_args: {
      prefix_template: "company_{n}_",
      max_count: 3,
      sub_fields: [
        "dba",
        "annual_revenue",
        "number_of_full_time_employees",
        "client_ownership_percentage",
        "revenue_is_for_the_year_ending",
      ],
    },
    notes:
      "ADR-004 design question 1: primary company stays on members.company_name; additional in custom_fields. Promote to a member_companies table when ≥30 chapters track this pattern.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "equity_ownership",
    target: "members.custom_fields.equity_ownership_pct",
    transform: "direct_copy",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // EOA  (EO Accelerator)
  // ============================================================
  {
    source: "eo_accelerator",
    target: "members.eoa_member",
    transform: "bool_from_yes_no",
    notes: "Currently in EOA program.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "accel__grad",
    target: "members.custom_fields.eoa_graduate",
    transform: "bool_from_yes_no",
    notes: "EOA graduate (separate from currently in program).",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // SAP / SLP / SPOUSE  (ADR-004 design questions 2 + 4)
  // ============================================================
  {
    source: "sap_active_",
    target: "members.custom_fields.sap_active",
    transform: "direct_copy",
    notes: "Yes | No | On Hold. SAP = Strategic Alliance Partner (EO Dallas terminology).",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "sap_tier",
    target: "members.custom_fields.sap_tier",
    transform: "direct_copy",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "sap_type",
    target: "members.custom_fields.sap_type",
    transform: "array_of_text",
    notes: "In-Kind | Commission | Paid (multi-select).",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "sap_forum_presentation_topics",
    target: "members.custom_fields.sap_forum_presentation_topics",
    transform: "direct_copy",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "spouse_first_name",
    target: "members.custom_fields.spouse.first_name",
    transform: "direct_copy",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "spouse_last_name",
    target: "members.custom_fields.spouse.last_name",
    transform: "direct_copy",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "spouse_phone",
    target: "members.custom_fields.spouse.phone",
    transform: "phone_normalize",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "spousal_email_address",
    target: "members.custom_fields.spouse.email",
    transform: "email_normalize",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "spouse_life_partner",
    target: "members.custom_fields.spouse.label",
    transform: "direct_copy",
    notes: "Free-text descriptor for the relationship label.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "interested_in_slp_forum",
    target: "members.custom_fields.slp.interested_in_forum",
    transform: "enum_map",
    transform_args: { value_map: { Yes: true, No: false, Maybe: null }, default: null },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "interested_in_spousal_forum",
    target: "members.custom_fields.spouse.interested_in_forum",
    transform: "enum_map",
    transform_args: { value_map: { Yes: true, No: false, "N/A": null }, default: null },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // EVENTS  — per-fiscal-year multi-selects → custom_fields.attendance
  // (Will migrate to a real event_attendance table in Phase 2.)
  // ============================================================
  {
    source: "n25_26_learning_event",
    target: "members.custom_fields.attendance.learning_2025_26",
    transform: "multi_select_to_attendance",
    transform_args: { event_type: "learning", fiscal_year: "2025-26" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "n25_26_social_event",
    target: "members.custom_fields.attendance.social_2025_26",
    transform: "multi_select_to_attendance",
    transform_args: { event_type: "local", fiscal_year: "2025-26" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "n24_25_learning_event",
    target: "members.custom_fields.attendance.learning_2024_25",
    transform: "multi_select_to_attendance",
    transform_args: { event_type: "learning", fiscal_year: "2024-25" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "n24_25_social_event",
    target: "members.custom_fields.attendance.social_2024_25",
    transform: "multi_select_to_attendance",
    transform_args: { event_type: "local", fiscal_year: "2024-25" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "n2023_social_event",
    target: "members.custom_fields.attendance.social_2022_23",
    transform: "multi_select_to_attendance",
    transform_args: { event_type: "local", fiscal_year: "2022-23" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "do_you_currently_attend_eo_dallas_learning_events_",
    target: "members.custom_fields.self_reported_learning_attendance",
    transform: "direct_copy",
    notes: "Yes, Regularly | Occasionally | No",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "did_you_attend_any_eo_events_outside_of_our_chapter_",
    target: "members.custom_fields.attended_external_eo_events",
    transform: "array_of_text",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // RECRUITMENT
  // ============================================================
  {
    source: "how_did_you_hear_about_us_",
    target: "members.recruitment_source",
    transform: "enum_map",
    transform_args: {
      value_map: {
        "Social Media": "Cold Outreach",
        "Word of Mouth": "Peer Referral",
        "Internet Search": "Cold Outreach",
      },
      default: "Other",
    },
    notes:
      "EO Dallas's options are a subset of Trifecta's. Word of Mouth → Peer Referral; others → Cold Outreach.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "referral_source",
    target: "members.custom_fields.referral_source_text",
    transform: "direct_copy",
    notes: "Free-text referrer name. Preserve alongside the structured enum mapping.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // REQUALIFICATION  (annual survey — 21 properties as a group)
  // ============================================================
  {
    source: "_group:requalification_properties",
    target: "members.custom_fields.requalification",
    transform: "group_to_jsonb",
    transform_args: { group_name: "requalification_properties" },
    notes:
      "ADR-004 design question 3. Bundles all 21 requalification-group properties (accountant info, multi-company revenue/employees/ownership%, etc.) into one JSONB blob. Don't canonicalize until pattern recurs.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // MISC HIGH-VALUE CUSTOM FIELDS
  // ============================================================
  {
    source: "chapter",
    target: "members.custom_fields.hubspot_chapter_label",
    transform: "direct_copy",
    notes: "HubSpot's own chapter label. Useful for cross-check; the canonical chapter_id is set elsewhere.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "application",
    target: "members.custom_fields.application_status",
    transform: "direct_copy",
    notes: "Complete | Partial | Incomplete — membership application progress.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "chapter_consideration_email",
    target: "members.custom_fields.consideration_email_status",
    transform: "direct_copy",
    notes: "Sent | Approved — workflow tracker.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "cpa_verification",
    target: "members.custom_fields.cpa_verified",
    transform: "bool_from_yes_no",
    notes: "Revenue verified by CPA.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "financials_are_verifiable",
    target: "members.custom_fields.financials_verifiable",
    transform: "bool_from_yes_no",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "company_role_survey",
    target: "members.custom_fields.company_role",
    transform: "direct_copy",
    notes: "Founder | Co-Founder | Controlling Shareholder | Managing Partner | CEO | COO | Other",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "demographics",
    target: "members.custom_fields.gender",
    transform: "direct_copy",
    notes: "Male | Female. Self-reported.",
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },
  {
    source: "anecdotal_financial_notes",
    target: "members.notes",
    transform: "append_to_notes",
    transform_args: { tag: "hubspot:anecdotal_financial_notes" },
    authored_by: EO_DALLAS_HUBSPOT_AUTHORED_BY,
  },

  // ============================================================
  // (Deliberately omitted: ~150 event-registration / form-response /
  // workflow-tracking properties — flight numbers, dietary preferences,
  // event-specific RSVPs, mentor-program intent fields, etc. They live
  // in HubSpot but don't earn space in Trifecta. If a particular field
  // proves useful later, add a rule here — purely a data change.)
  // ============================================================
];
