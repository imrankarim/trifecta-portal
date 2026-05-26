"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type MemberFormState = { error: string | null };

const MEMBERSHIP_STATUSES = [
  "Active",
  "On Leave",
  "Grace Period",
  "Lapsed",
  "Alumni",
  "Prospect",
  "Staff",
] as const;
type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

function readForm(form: FormData) {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  const status = get("membership_status");
  if (!status || !MEMBERSHIP_STATUSES.includes(status as MembershipStatus)) {
    throw new Error("Invalid membership status");
  }

  const email = get("email_primary");
  const firstName = get("first_name");
  const lastName = get("last_name");
  const joinDate = get("join_date_original");
  const company = get("company_name");
  const isStaff = status === "Staff";

  if (!email || !firstName || !lastName) {
    throw new Error("Missing required field");
  }
  if (!isStaff && (!joinDate || !company)) {
    throw new Error("Join date and company are required for chapter members.");
  }

  return {
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
    membership_status: status as MembershipStatus,
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
