"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveScoringWeights, type SaveWeightsState } from "../actions";

const SIGNALS: Array<{ key: string; label: string; help: string }> = [
  { key: "forum_attendance_12m", label: "Forum participation", help: "Forum meeting attendance (12 mo) — usually the strongest signal" },
  { key: "local_event_attendance_12m", label: "Local event attendance", help: "Chapter events attended (12 mo)" },
  { key: "slp_engagement", label: "Spouse / SLP involvement", help: "Spouse & Life Partner program engagement" },
  { key: "whatsapp_activity", label: "WhatsApp activity", help: "Presence in the chapter chat" },
  { key: "global_event_count_24m", label: "Global events", help: "EO global events attended (24 mo)" },
  { key: "recency_of_last_engagement", label: "Recency", help: "How recently they engaged at all" },
];

const TIER_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-green-100 text-green-800",
  Monitor: "bg-gray-100 text-gray-700",
};

const initialState: SaveWeightsState = { result: null, error: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Saving & recalculating…" : "Save & recalculate"}
    </button>
  );
}

export function ScoringWeights({ initial }: { initial: Record<string, number> }) {
  const [state, formAction] = useFormState(saveScoringWeights, initialState);
  const [values, setValues] = useState<Record<string, number>>(() => ({ ...initial }));

  const total = SIGNALS.reduce((sum, s) => sum + (values[s.key] ?? 0), 0);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  function set(key: string, v: number) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function resetDefaults() {
    setValues({
      forum_attendance_12m: 35,
      local_event_attendance_12m: 25,
      slp_engagement: 15,
      whatsapp_activity: 10,
      global_event_count_24m: 10,
      recency_of_last_engagement: 5,
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
        {SIGNALS.map((s) => {
          const v = values[s.key] ?? 0;
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-sm font-medium text-gray-900">{s.label}</label>
                <span className="text-sm font-semibold text-indigo-700 tabular-nums">
                  {pct(v)}%
                </span>
              </div>
              <input
                type="range"
                name={s.key}
                min={0}
                max={100}
                value={v}
                onChange={(e) => set(s.key, Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
              <p className="text-xs text-gray-500 mt-0.5">{s.help}</p>
            </div>
          );
        })}

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={resetDefaults}
            className="text-xs text-gray-600 hover:text-gray-900 underline"
          >
            Reset to defaults
          </button>
          <span className="text-xs text-gray-400">
            Effective weights shown as % (normalized automatically)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <SaveButton />
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.result && !state.error && (
          <span className="text-sm text-green-700">
            Recalculated {state.result.membersScored} members.
          </span>
        )}
      </div>

      {state.result && !state.error && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New risk-tier distribution</h3>
          <div className="flex flex-wrap gap-2">
            {(["Critical", "High", "Medium", "Low", "Monitor"] as const).map((tier) => (
              <span
                key={tier}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${TIER_STYLES[tier]}`}
              >
                {tier}
                <span className="tabular-nums font-semibold">{state.result!.tierDistribution[tier]}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Score range {state.result.scoreStats.min}–{state.result.scoreStats.max} · mean{" "}
            {state.result.scoreStats.mean} · median {state.result.scoreStats.median}
          </p>
        </div>
      )}
    </form>
  );
}
