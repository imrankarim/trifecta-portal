"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnector, type SyncResult } from "@/lib/jobs/syncConnector";
import { scoreMembers, type ScoreMembersResult } from "@/lib/jobs/scoreMembers";
import { parseScoringWeights } from "@/lib/scoring/engagementScore";

export type MemberFormState = { error: string | null };

// Lifecycle stages for actual EO members. Only meaningful when contact_type='Member'.
// "Staff" and "Spouse" remain in the underlying enum for back-compat (per ADR-005)
// but are not user-selectable here — they're now contact_type values, not statuses.
const MEMBERSHIP_STATUSES = [
  "Active",
  "On Leave",
  "Grace Period",
  "Lapsed",
  "Former Member",
  "Prospect",
] as const;
type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const CONTACT_TYPES = ["Member", "Staff", "Spouse", "Sponsor", "Other"] as const;
type ContactType = (typeof CONTACT_TYPES)[number];

// Lifecycle stages where join_date and company aren't applicable, even for Members.
const NON_BUSINESS_STATUSES: ReadonlySet<MembershipStatus> = new Set<MembershipStatus>(["Prospect"]);

function readForm(form: FormData) {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  const contactType = get("contact_type");
  if (!contactType || !CONTACT_TYPES.includes(contactType as ContactType)) {
    throw new Error("Invalid contact type");
  }
  const isMember = contactType === "Member";

  const status = get("membership_status");
  if (isMember) {
    if (!status || !MEMBERSHIP_STATUSES.includes(status as MembershipStatus)) {
      throw new Error("Membership status is required for Members");
    }
  } else if (status && !MEMBERSHIP_STATUSES.includes(status as MembershipStatus)) {
    // Non-members shouldn't normally have a status; if one was set, reject unknown values.
    throw new Error("Invalid membership status");
  }

  const email = get("email_primary");
  const firstName = get("first_name");
  const lastName = get("last_name");
  const joinDate = get("join_date_original");
  const company = get("company_name");

  if (!email || !firstName || !lastName) {
    throw new Error("Missing required field");
  }

  // join_date + company required only when contact_type=Member AND status is a "business" lifecycle
  // (i.e. not Prospect — prospects don't have a join date yet, and might not have a company).
  if (isMember && status && !NON_BUSINESS_STATUSES.has(status as MembershipStatus)) {
    if (!joinDate || !company) {
      throw new Error("Join date and company are required for active/lapsed/former members.");
    }
  }

  return {
    contact_type: contactType as ContactType,
    email_primary: email,
    first_name: firstName,
    last_name: lastName,
    preferred_name: get("preferred_name"),
    phone_mobile: get("phone_mobile"),
    job_title: get("job_title"),
    linkedin_url: get("linkedin_url"),
    company_name: company,
    city: get("city"),
    state_province: get("state_province"),
    membership_status: isMember ? (status as MembershipStatus) : null,
    join_date_original: joinDate,
  };
}

async function chapterContext() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // RLS lets the user see exactly their own chapter row.
  const { data: chapter } = await supabase
    .from("chapters")
    .select("trifecta_chapter_id, eo_region, country")
    .limit(1)
    .single();

  if (!chapter) throw new Error("You aren't linked to a chapter yet.");

  return { supabase, chapter };
}

export async function createMember(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  try {
    const fields = readForm(formData);
    const { supabase, chapter } = await chapterContext();

    const { error } = await supabase.from("members").insert({
      ...fields,
      chapter_id: chapter.trifecta_chapter_id,
      eo_region: chapter.eo_region,
      country: chapter.country,
    });

    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath("/dashboard");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }

  redirect("/admin");
}

export type SyncFormState = {
  result: SyncResult | null;
  error: string | null;
};

export async function runHubSpotSync(
  _prev: SyncFormState,
  _formData: FormData,
): Promise<SyncFormState> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { result: null, error: "Not signed in." };

    const { data: role } = await supabase.rpc("current_user_role");
    if (role !== "Admin" && role !== "ExecutiveDirector") {
      return { result: null, error: "You don't have permission to run a sync." };
    }

    const { data: chapter } = await supabase
      .from("chapters")
      .select("trifecta_chapter_id")
      .limit(1)
      .single();
    if (!chapter) return { result: null, error: "No chapter linked to your account." };

    // Sync needs to bypass RLS to upsert across all members in the chapter.
    const admin = createAdminClient();
    const result = await syncConnector({
      supabase: admin,
      chapterId: chapter.trifecta_chapter_id,
      sourceName: "hubspot",
    });

    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { result, error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export type SaveWeightsState = {
  result: ScoreMembersResult | null;
  error: string | null;
};

const WEIGHT_KEYS = [
  "forum_attendance_12m",
  "local_event_attendance_12m",
  "slp_engagement",
  "whatsapp_activity",
  "global_event_count_24m",
  "recency_of_last_engagement",
] as const;

export async function saveScoringWeights(
  _prev: SaveWeightsState,
  formData: FormData,
): Promise<SaveWeightsState> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { result: null, error: "Not signed in." };

    const { data: role } = await supabase.rpc("current_user_role");
    if (role !== "Admin" && role !== "ExecutiveDirector") {
      return { result: null, error: "You don't have permission to change scoring." };
    }

    const { data: chapter } = await supabase
      .from("chapters")
      .select("trifecta_chapter_id")
      .limit(1)
      .single();
    if (!chapter) return { result: null, error: "No chapter linked to your account." };

    // Slider values are relative importances (0–100); scoring normalizes them.
    const weights: Record<string, number> = {};
    for (const k of WEIGHT_KEYS) {
      const raw = formData.get(k);
      const n = typeof raw === "string" ? Number(raw) : NaN;
      weights[k] = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    const parsed = parseScoringWeights(weights);
    if (!parsed) return { result: null, error: "Set at least one signal above zero." };

    // chapters + cross-member writes bypass RLS via the service-role client.
    const admin = createAdminClient();
    const { error: upErr } = await admin
      .from("chapters")
      .update({ scoring_weights: parsed })
      .eq("trifecta_chapter_id", chapter.trifecta_chapter_id);
    if (upErr) return { result: null, error: upErr.message };

    // Re-score immediately so the impact is visible. scoreMembers reads the
    // weights we just saved.
    const result = await scoreMembers({
      supabase: admin,
      chapterId: chapter.trifecta_chapter_id,
    });

    revalidatePath("/dashboard");
    revalidatePath("/board");
    revalidatePath("/admin/scoring");
    return { result, error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateMember(
  memberId: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  try {
    const fields = readForm(formData);
    const { supabase } = await chapterContext();

    const { error } = await supabase
      .from("members")
      .update(fields)
      .eq("trifecta_member_id", memberId);

    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath(`/admin/${memberId}`);
    revalidatePath("/dashboard");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }

  redirect("/admin");
}
