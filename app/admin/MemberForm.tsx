"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import {
  createMember,
  updateMember,
  type MemberFormState,
} from "./actions";

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

export type MemberInitial = {
  trifecta_member_id?: string;
  email_primary?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  phone_mobile?: string | null;
  job_title?: string | null;
  linkedin_url?: string | null;
  company_name?: string | null;
  city?: string | null;
  state_province?: string | null;
  membership_status?: string | null;
  join_date_original?: string | null;
};

const initialState: MemberFormState = { error: null };

export function MemberForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: MemberInitial;
}) {
  const action =
    mode === "create"
      ? createMember
      : updateMember.bind(null, initial!.trifecta_member_id!);

  const [state, formAction] = useFormState(action, initialState);
  const [status, setStatus] = useState<MembershipStatus>(
    (initial?.membership_status as MembershipStatus | undefined) ?? "Active",
  );
  const isStaff = status === "Staff";

  return (
    <form action={formAction} className="space-y-6">
      <Section title="Identity">
        <Field label="First name" required>
          <input name="first_name" required defaultValue={initial?.first_name ?? ""} className={inputCls} />
        </Field>
        <Field label="Last name" required>
          <input name="last_name" required defaultValue={initial?.last_name ?? ""} className={inputCls} />
        </Field>
        <Field label="Preferred name">
          <input name="preferred_name" defaultValue={initial?.preferred_name ?? ""} className={inputCls} />
        </Field>
        <Field label="Email" required>
          <input type="email" name="email_primary" required defaultValue={initial?.email_primary ?? ""} className={inputCls} />
        </Field>
        <Field label="Mobile phone">
          <input type="tel" name="phone_mobile" defaultValue={initial?.phone_mobile ?? ""} className={inputCls} />
        </Field>
        <Field label="LinkedIn URL">
          <input type="url" name="linkedin_url" defaultValue={initial?.linkedin_url ?? ""} className={inputCls} />
        </Field>
      </Section>

      <Section title="Membership">
        <Field label="Membership status" required>
          <select
            name="membership_status"
            required
            value={status}
            onChange={(e) => setStatus(e.target.value as MembershipStatus)}
            className={inputCls}
          >
            {MEMBERSHIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "Staff" ? "Staff (not a chapter member)" : s}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Join date (original)"
          required={!isStaff}
          hint={isStaff ? "Not applicable for staff" : undefined}
        >
          <input
            type="date"
            name="join_date_original"
            required={!isStaff}
            disabled={isStaff}
            defaultValue={initial?.join_date_original ?? ""}
            className={isStaff ? inputDisabledCls : inputCls}
          />
        </Field>
      </Section>

      <Section title="Business & location">
        <Field
          label="Company"
          required={!isStaff}
          hint={isStaff ? "Optional for staff" : undefined}
        >
          <input
            name="company_name"
            required={!isStaff}
            defaultValue={initial?.company_name ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Job title">
          <input name="job_title" defaultValue={initial?.job_title ?? ""} className={inputCls} />
        </Field>
        <Field label="City">
          <input name="city" defaultValue={initial?.city ?? ""} className={inputCls} />
        </Field>
        <Field label="State / province">
          <input name="state_province" defaultValue={initial?.state_province ?? ""} className={inputCls} />
        </Field>
      </Section>

      {state.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton mode={mode} />
        <Link
          href="/admin"
          className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
    >
      {pending ? "Saving…" : mode === "create" ? "Create member" : "Save changes"}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="bg-white border border-gray-200 rounded-md p-5">
      <legend className="px-2 text-xs uppercase tracking-wide text-gray-500 font-medium">
        {title}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-600 ml-0.5">*</span>}
        </span>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const inputDisabledCls =
  "w-full px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-400 bg-gray-50 cursor-not-allowed";
